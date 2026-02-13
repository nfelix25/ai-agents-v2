import {
  generateText,
  stepCountIs,
  tool,
  type ModelMessage,
  type Tool,
  type ToolSet,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import { buildMessages, buildMockedTools } from './utils.ts';

import type {
  EvalData,
  SingleTurnResult,
  MultiTurnEvalData,
  MultiTurnResult,
  CompactionEvalData,
  CompactionTarget,
  CompactionResult,
  AgentAfterCompactionData,
  AgentAfterCompactionTarget,
} from './types.ts';
import { SYSTEM_PROMPT } from '../src/agent/system/prompt.ts';
import { estimateMessagesTokens } from '../src/agent/context/tokenEstimator.ts';
import { compactConversation } from '../src/agent/context/compaction.ts';

const TOOL_DEFINITIONS: Record<
  string,
  { description: Tool['description']; parameters: Tool['inputSchema'] }
> = {
  readFile: {
    description: 'Read the contents of a file at the specified path',
    parameters: z.object({
      path: z.string().describe('the path to the file that you want to read'),
    }),
  },
  writeFile: {
    description: 'Write given content to the file at the specified path',
    parameters: z.object({
      path: z.string().describe('the path to the file that you want to write'),
      content: z.string().describe('The content you want to write to the file'),
    }),
  },
  listFiles: {
    description: 'List all the files in a directory',
    parameters: z.object({
      path: z
        .string()
        .describe(
          'the path of the directory in which you want to list the files',
        ),
    }),
  },
  deleteFile: {
    description: 'Delete a file at the given path',
    parameters: z.object({
      path: z.string().describe('the path to the file that you want to delete'),
    }),
  },
  runCommand: {
    description: 'Execute a shell command and return its output',
    parameters: z.object({
      command: z.string().describe('the shell command to execute'),
    }),
  },
};

export const singleTurnWithMocks = async (
  data: EvalData,
): Promise<SingleTurnResult> => {
  const messages = buildMessages(data);

  // Build mocked tools from definitions based on data.tools
  const tools: ToolSet = {};
  for (const toolName of data.tools) {
    const def = TOOL_DEFINITIONS[toolName];

    if (def) {
      tools[toolName] = tool({
        description: def.description,
        inputSchema: def.parameters,
      });
    }
  }

  const result = await generateText({
    model: openai(data.config?.model ?? 'gpt-5-mini'),
    messages,
    tools,
    stopWhen: stepCountIs(1),
    // Temperature not valid for reasoning models, but omitted when stringified if undefined
    temperature: data.config?.temperature,
  });

  const toolCalls = (result.toolCalls ?? []).map((tc) => ({
    toolName: tc.toolName,
    input: 'input' in tc ? tc.input : {},
  }));

  const toolNames = toolCalls.map((tc) => tc.toolName);

  return { toolCalls, toolNames, selectedAny: toolNames.length > 0 };
};

/**
 * Multi-turn executor with mocked tools.
 * Runs a complete agent loop with tools returning fixed values.
 */

export const multiTurnWithMocks = async (
  data: MultiTurnEvalData,
): Promise<MultiTurnResult> => {
  const tools = buildMockedTools(data.mockTools);

  const messages: ModelMessage[] = data.messages ?? [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: data.prompt! },
  ];

  const result = await generateText({
    model: openai(data.config?.model ?? 'gpt-5-mini'),
    messages,
    tools,
    stopWhen: stepCountIs(data.config?.maxSteps ?? 20),
  });

  const allToolCalls: string[] = [];
  const steps = result.steps.map((step) => {
    const stepToolCalls = (step.toolCalls ?? []).map((tc) => {
      allToolCalls.push(tc.toolName);
      return {
        toolName: tc.toolName,
        args: 'args' in tc ? tc.args : {},
      };
    });

    const stepToolResults = (step.staticToolResults ?? []).map((tr) => ({
      toolName: tr.toolName,
      result: 'results' in tr ? tr.results : tr,
    }));

    return {
      toolCalls: stepToolCalls.length > 0 ? stepToolCalls : undefined,
      toolResults: stepToolResults.length > 0 ? stepToolResults : undefined,
      text: step.text || undefined,
    };
  });

  const toolsUsed = [...new Set(allToolCalls)];

  return {
    text: result.text,
    steps,
    toolsUsed,
    toolCallOrder: allToolCalls,
  };
};

export async function compactionQualityExecutor(
  data: CompactionEvalData,
  target: CompactionTarget,
): Promise<CompactionResult> {
  // Estimate original tokens
  const originalTokens = estimateMessagesTokens(data.originalConversation);

  // Compact the conversation with the specified strategy
  const compacted = await compactConversation(
    data.originalConversation,
    'gpt-5-mini',
    target.strategy,
  );

  // Estimate compacted tokens
  const compactedTokens = estimateMessagesTokens(compacted);

  // Calculate compression ratio
  const compressionRatio = 1 - compactedTokens.total / originalTokens.total;

  return {
    id: target.id,
    strategy: target.strategy,
    originalLength: data.originalConversation.length,
    compactedLength: compacted.length,
    compactedText: (compacted[0]?.content as string) ?? '',
    criticalInfo: data.criticalInfo,
    originalTokens: originalTokens.total,
    compactedTokens: compactedTokens.total,
    compressionRatio,
  };
}

export async function agentAfterCompactionExecutor(
  data: AgentAfterCompactionData,
  target: AgentAfterCompactionTarget,
): Promise<MultiTurnResult> {
  const compactedConversation = await compactConversation(
    data.conversationHistory,
    'gpt-5-mini',
    data.compactionStrategy,
  );

  // Prepend system prompt to compacted conversation
  const messages: ModelMessage[] = [
    ...compactedConversation,
    { role: 'user', content: data.nextUserPrompt },
  ];

  return await multiTurnWithMocks({ messages, mockTools: data.tools });
}
