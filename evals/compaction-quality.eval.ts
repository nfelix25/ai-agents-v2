import { evaluate } from '@lmnr-ai/lmnr';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compactionQualityExecutor } from './executors';
import { compactionQualityJudge, compressionRatioScore } from './evaluators';

import type { CompactionEvalData, CompactionTarget } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test dataset
const testDataPath = path.join(__dirname, 'data', 'compaction.json');
const rawData = await fs.readFile(testDataPath, 'utf-8');
const testCases = JSON.parse(rawData);

// Create dataset with both strategies for each conversation
const dataset = testCases.flatMap((testCase: any) => [
  {
    data: testCase.data as CompactionEvalData,
    target: {
      strategy: 'A' as const,
      id: testCase.id,
      description: testCase.description,
    } as CompactionTarget,
  },
  {
    data: testCase.data as CompactionEvalData,
    target: {
      strategy: 'B' as const,
      id: testCase.id,
      description: testCase.description,
    } as CompactionTarget,
  },
]);

console.log(`Running compaction quality evaluation on 
  ${dataset.length} test cases (${testCases.length} conversations × 
  2 strategies)`);

// Run evaluation
await evaluate({
  data: dataset,
  executor: compactionQualityExecutor,
  evaluators: {
    informationPreservation: compactionQualityJudge as any,
    compressionEfficiency: compressionRatioScore as any,
  },
  config: {
    projectApiKey: process.env.LMNR_PROJECT_API_KEY,
  },
  groupName: 'compaction-quality-comparison',
});

console.log('✅ Compaction quality evaluation complete!');
console.log('📊 View results at: https://www.lmnr.ai');
