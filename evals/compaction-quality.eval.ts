import { evaluate } from '@lmnr-ai/lmnr';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compactionQualityExecutor } from './executors';
import {
  compactionQualityJudge,
  compressionRatioScore,
  getCompactionJudgeInsights,
  resetCompactionJudgeInsights,
} from './evaluators';
import { getCompactionPromptTokenEstimate } from '../src/agent/context/compaction.ts';

import type {
  CompactionEvalData,
  CompactionPromptProfile,
  CompactionTarget,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test dataset
const testDataPath = path.join(__dirname, 'data', 'compaction.json');
const rawData = await fs.readFile(testDataPath, 'utf-8');
const testCases = JSON.parse(rawData);

function parseStrategyArg(): 'A' | 'B' | undefined {
  const value = parseArgValue('--strategy');
  if (!value) return undefined;

  if (value === 'A' || value === 'B') return value;
  throw new Error(`Invalid --strategy value: "${value}". Use A or B.`);
}

function parseArgValue(flag: `--${string}`): string | undefined {
  const raw = process.argv.find(
    (arg) => arg.startsWith(`${flag}=`) || arg === flag,
  );
  if (!raw) return undefined;

  return raw === flag ? process.argv[process.argv.indexOf(raw) + 1] : raw.split('=')[1];
}

function parsePromptProfileArg(): CompactionPromptProfile {
  const value = parseArgValue('--prompt-profile');
  if (!value) return 'native';
  if (value === 'native' || value === 'normalized') return value;
  throw new Error(
    `Invalid --prompt-profile value: "${value}". Use "native" or "normalized".`,
  );
}

function parseSummaryTokenCapArg(): number | undefined {
  const value = parseArgValue('--summary-max-output-tokens');
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid --summary-max-output-tokens value: "${value}". Use a positive integer.`,
    );
  }
  return parsed;
}

const strategyFilter = parseStrategyArg();
const promptProfile = parsePromptProfileArg();
const summaryMaxOutputTokens = parseSummaryTokenCapArg();
const strategies: Array<'A' | 'B'> = strategyFilter ? [strategyFilter] : ['A', 'B'];

const promptTokenEstimates = {
  A: getCompactionPromptTokenEstimate('A', promptProfile),
  B: getCompactionPromptTokenEstimate('B', promptProfile),
};

const dataset = testCases.flatMap((testCase: any) =>
  strategies.map((strategy) => ({
    data: {
      ...(testCase.data as Omit<
        CompactionEvalData,
        'id' | 'description' | 'strategy'
      >),
      id: testCase.id,
      description: testCase.description,
      strategy,
      promptProfile,
      summaryMaxOutputTokens,
    } as CompactionEvalData,
    target: {
      strategy,
      id: testCase.id,
      description: testCase.description,
    } as CompactionTarget,
  })),
);

console.log(`Running compaction quality evaluation on 
  ${dataset.length} test cases (${testCases.length} conversations × 
  ${strategies.length} strateg${strategies.length > 1 ? 'ies' : 'y'})`);
console.log(
  `Prompt profile: ${promptProfile} | Estimated prompt tokens: A=${promptTokenEstimates.A}, B=${promptTokenEstimates.B}`,
);
if (summaryMaxOutputTokens) {
  console.log(`Summary max output tokens: ${summaryMaxOutputTokens}`);
}

// Run evaluation
resetCompactionJudgeInsights();
await evaluate({
  data: dataset,
  executor: compactionQualityExecutor,
  evaluators: {
    qualityBreakdown: compactionQualityJudge as any,
    compressionEfficiency: compressionRatioScore as any,
  },
  config: {
    projectApiKey: process.env.LMNR_PROJECT_API_KEY,
  },
  groupName: 'compaction-quality-comparison',
  name:
    strategyFilter ?
      `compaction-quality-${promptProfile}-strategy-${strategyFilter}`
    : `compaction-quality-${promptProfile}-all-strategies`,
});

const resultsDir = path.join(__dirname, 'results');
await fs.mkdir(resultsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const strategyLabel = strategyFilter ?? 'A-B';
const capLabel = summaryMaxOutputTokens ?? 'uncapped';
const insightsPath = path.join(
  resultsDir,
  `compaction-insights-${strategyLabel}-${promptProfile}-cap-${capLabel}-${timestamp}.json`,
);

await fs.writeFile(
  insightsPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      strategy: strategyFilter ?? 'both',
      promptProfile,
      promptTokenEstimates,
      summaryMaxOutputTokens: summaryMaxOutputTokens ?? null,
      testCases: testCases.length,
      evaluatedDatapoints: dataset.length,
      insights: getCompactionJudgeInsights(),
    },
    null,
    2,
  ),
);

console.log('✅ Compaction quality evaluation complete!');
console.log('📊 View results at: https://www.lmnr.ai');
console.log(`📝 Judge insights saved to: ${insightsPath}`);
