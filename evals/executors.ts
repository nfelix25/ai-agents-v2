import { generateText, stepCountIs, tool, type Tool, type ToolSet } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import { buildMessages } from './utils.ts';

import type {
  EvalData,
  SingleTurnResult,
  MultiTurnEvalData,
  MultiTurnResult,
} from './types.ts';

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
    model: data.config?.model ?? 'gpt-5-mini',
    messages,
    tools,
    stopWhen: stepCountIs(1),
    // Temperature not valid for reasoning models, but omitted when stringified if undefined
    temperature: data.config?.temperature,
  });

  const toolCalls = (result.toolCalls ?? []).map((tc) => ({
    toolName: tc.toolName,
    args: 'args' in tc ? tc.args : {},
  }));

  const toolNames = toolCalls.map((tc) => tc.toolName);

  return { toolCalls, toolNames, selectedAny: toolNames.length > 0 };
};

/**
 * Multi-turn executor with mocked tools.
 * Runs a complete agent loop with tools returning fixed values.
 */
