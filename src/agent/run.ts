import { generateText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getTracer, Laminar } from '@lmnr-ai/lmnr';

import { tools } from './tools/index.ts';
import { SYSTEM_PROMPT } from './system/prompt.ts';

import type { AgentCallbacks } from '../types.ts';
import { executeTool } from './executeTool.ts';

const MODEL_NAME = 'gpt-5-mini';

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY,
});

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<any> {
  // Filter and check if we need to compact the conversation history before starting
  const { text, toolCalls } = await generateText({
    model: openai(MODEL_NAME),
    prompt: userMessage,
    system: SYSTEM_PROMPT,
    tools,
    experimental_telemetry: {
      isEnabled: true,
      tracer: getTracer(),
    },
  });

  console.log(text, toolCalls);

  toolCalls?.forEach(async (toolCall) => {
    console.log(await executeTool(toolCall.toolName, toolCall.input));
  });
}
