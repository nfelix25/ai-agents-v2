import { generateText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';

import { tools } from './tools';
import { SYSTEM_PROMPT } from './system/prompt';

import type { AgentCallbacks } from '../types';

const MODEL_NAME = 'gpt-5-mini';

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<any> {
  // Filter and check if we need to compact the conversation history before starting
  const { text } = await generateText({
    model: openai(MODEL_NAME),
    prompt: userMessage,
    system: SYSTEM_PROMPT,
    tools,
  });

  console.log(text);
}

runAgent('What is the meaning of life?');
