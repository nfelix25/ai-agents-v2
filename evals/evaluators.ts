import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import type {
  EvalTarget,
  SingleTurnResult,
  MultiTurnTarget,
  MultiTurnResult,
  CompactionResult,
  CompactionTarget,
} from './types.ts';

const judgeSchema = z.object({
  score: z
    .number()
    .min(1)
    .max(10)
    .describe('Score from 1-10 where 10 is perfect'),

  reason: z.string().describe('Brief explanation for the score'),
});

/**
 * Evaluator: LLM-as-judge for output quality.
 * Uses structured output to reliably assess if the agent's response is correct.
 * Returns a score from 0-1 (internally uses 1-10 scale divided by 10).
 */
export const llmJudge = async (
  output: MultiTurnResult,
  target: MultiTurnTarget,
) => {
  const result = await generateObject({
    model: openai('gpt-5.1'),
    schema: judgeSchema,
    schemaName: 'evaluation',
    providerOptions: { openai: { reasoningEffort: 'high' } },
    schemaDescription: 'Evaluation of an AI agent response.',
    messages: [
      {
        role: 'system',
        content: `You are an evaluation judge. Score the agent's response on a scale of 1-10.

        Scoring criteria:
        - 10: Response fully addresses the task using tool results correctly
        - 7-9: Response is mostly correct with minor issues
        - 4-6: Response partially addresses the task
        - 1-3: Response is mostly incorrect or irrelevant`,
      },
      {
        role: 'user',
        content: `Task: ${target.originalTask}

        Tools called: ${JSON.stringify(output.toolCallOrder)}
        Tool results provided: ${JSON.stringify(target.mockToolResults)}

        Agent's final response:
        ${output.text}

        Evaluate if this response correctly uses the tool results to answer the task.`,
      },
    ],
  });

  console.log(result.object.reason);

  // Convert 1-10 scale to 0-1 range
  return result.object.score / 10;
};

export function toolsSelected(
  output: SingleTurnResult | MultiTurnResult,
  target: EvalTarget | MultiTurnTarget,
): number {
  const expectedTools =
    'expectedTools' in target ? target.expectedTools
    : 'expectedToolOrder' in target ? target.expectedToolOrder
    : undefined;

  if (!expectedTools?.length) return 1;

  const selected = new Set(
    'toolNames' in output ? output.toolNames : output.toolsUsed,
  );

  return expectedTools.every((t) => selected.has(t)) ? 1 : 0;
}

/**
 * Evaluator: Check if forbidden tolls were avoided.
 * Returns 1 if NONE of the forbidden tools were avoided, 0 otherwise.
 * For negative prompts.
 */
export function toolsAvoided(
  output: SingleTurnResult | MultiTurnResult,
  target: EvalTarget | MultiTurnTarget,
): number {
  if (!target.forbiddenTools?.length) return 1;

  const selected = new Set(
    'toolNames' in output ? output.toolNames : output.toolsUsed,
  );

  return target.forbiddenTools.some((t) => selected.has(t)) ? 0 : 1;
}

/**
 * Evaluator: Check if tools were called in expected order.
 * Returns the fraction of expected tool calls found in the sequence.
 * Order matters but tools don't need to be consecutive.
 */
export function toolOrderCorrect(
  output: MultiTurnResult,
  target: MultiTurnTarget,
): number {
  if (!target.expectedToolOrder?.length) return 1;

  const actualOrder = output.toolCallOrder;

  // Check if expected tools appear in order (not necessarily consecutive)
  let expectedIdx = 0;
  for (const toolName of actualOrder) {
    if (toolName === target.expectedToolOrder[expectedIdx]) {
      expectedIdx++;
      if (expectedIdx === target.expectedToolOrder.length) break;
    }
  }

  return expectedIdx / target.expectedToolOrder.length;
}

/**
 * Evaluator: Precision/recall score for tool selection.
 * Returns a score between 0 and 1 based on correct selections.
 * For secondary prompts.
 */
export function toolSelectionScore(
  output: SingleTurnResult,
  target: EvalTarget,
): number {
  if (!target.expectedTools?.length) {
    return output.selectedAny ? 0.5 : 1;
  }

  const expected = new Set(target.expectedTools);
  const selected = new Set(output.toolNames);

  const hits = output.toolNames.filter((t) => expected.has(t)).length;
  const precision = selected.size > 0 ? hits / selected.size : 0;
  const recall = expected.size > 0 ? hits / expected.size : 0;

  // Simple F1-ish score
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export async function compactionQualityJudge(
  output: CompactionResult,
  target: CompactionTarget,
): Promise<number> {
  const { object } = await generateObject({
    model: openai('gpt-5.1'),
    providerOptions: { openai: { reasoningEffort: 'high' } },
    system: `You are evaluating conversation summarization 
  quality.

  Score from 1-10 based on:
  1. **Information Preservation** (40%): Are all critical details 
  from mustPreserve preserved?
  2. **Clarity** (20%): Is the summary clear and coherent?
  3. **Completeness** (20%): Can someone continue the task from this
   summary alone?
  4. **Conciseness** (20%): Is it appropriately compressed without 
  over-summarizing?

  Return JSON with:
  - score: number (1-10)
  - reason: string (explain the score)
  - missingInfo: array of critical info that was lost
  - wellPreserved: array of critical info that was well preserved`,
    prompt: `
  ## Original Conversation Stats
  - Messages: ${output.originalLength}
  - Tokens: ${output.originalTokens}

  ## Compacted Summary Stats
  - Messages: ${output.compactedLength}
  - Tokens: ${output.compactedTokens}
  - Compression Ratio: ${(output.compressionRatio * 100).toFixed(1)}%
  - Strategy: ${output.strategy}

  ## CRITICAL INFORMATION THAT MUST BE PRESERVED

  ### Must Preserve (critical facts):
  ${output.criticalInfo.mustPreserve
    .map(
      (item, i) => `${i + 1}. 
  ${item}`,
    )
    .join('\n')}

  ### Task Context:
  ${output.criticalInfo.taskContext}

  ### Key Decisions:
  ${output.criticalInfo.keyDecisions
    .map(
      (item, i) => `${i + 1}. 
  ${item}`,
    )
    .join('\n')}

  ### User Preferences:
  ${output.criticalInfo.userPreferences
    .map(
      (item, i) => `${i + 1}. 
  ${item}`,
    )
    .join('\n')}

  ${
    output.criticalInfo.technicalConstraints ?
      `### Technical Constr
  aints:\n${output.criticalInfo.technicalConstraints
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n')}`
    : ''
  }

  ${
    output.criticalInfo.rejectedOptions ?
      `### Rejected Options 
  (should be 
  mentioned):\n${output.criticalInfo.rejectedOptions
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n')}`
    : ''
  }

  ## COMPACTED SUMMARY TO EVALUATE

  ${output.compactedText}

  ---

  **Task:** Evaluate how well this summary preserves the critical 
  information listed above.`,
    schema: z.object({
      score: z
        .number()
        .min(1)
        .max(10)
        .describe('Score from 1-10 where 10 is perfect'),
      reason: z.string().describe('Brief explanation for the score'),
      missingInfo: z
        .array(z.string())
        .describe('List of critical info items that were lost in the summary'),
      wellPreserved: z
        .array(z.string())
        .describe(
          'List of critical info items that were well preserved in the summary',
        ),
    }),
  });

  return object.score / 10; // Normalize to 0-1 range
}

export function compressionRatioScore(
  output: CompactionResult,
  _target: CompactionTarget,
): number {
  // Score based on compression ratio
  // Good: 0.5-0.8 (50-80% reduction)
  // Too little: <0.3 (not compacting enough)
  // Too much: >0.9 (might lose info)

  const ratio = output.compressionRatio;

  if (ratio >= 0.5 && ratio <= 0.8) return 1; // Ideal
  if (ratio >= 0.3 && ratio < 0.5) return 0.7; // Could compact more
  if (ratio > 0.8 && ratio <= 0.9) return 0.8; // Heavy compression
  if (ratio > 0.9) return 0.5; // Too much compression
  return 0.3; // Not compacted enough
}
