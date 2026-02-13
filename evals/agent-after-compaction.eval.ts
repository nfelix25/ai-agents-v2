import { evaluate } from '@lmnr-ai/lmnr';
import { agentAfterCompactionExecutor } from './executors.js';
import { llmJudge, toolOrderCorrect } from './evaluators.js';
import type {
  AgentAfterCompactionData,
  AgentAfterCompactionTarget,
} from './types.js';

// Example: Test if agent can continue task after compaction
const dataset: Array<{
  data: AgentAfterCompactionData;
  target: AgentAfterCompactionTarget;
}> = [
  {
    data: {
      conversationHistory: [
        /* Long conversation about setting up authentication */
      ],
      compactionStrategy: 'A' as const,
      nextUserPrompt: 'Now add password reset functionality',
      tools: [
        /* available tools */
      ],
    },
    target: {
      expectedToolOrder: ['readFile', 'writeFile'],
      originalTask: 'Add password reset to existing auth system',
      mockToolResults: {},
      category: 'task-completion',
      criticalContext: [],
    },
  },
  // Add more test cases
];

await evaluate({
  data: dataset,
  executor: agentAfterCompactionExecutor,
  evaluators: {
    toolOrder: (output, target) => {
      if (!target) return 1;
      return toolOrderCorrect(output, target);
    },
    outputQuality: (output, target) => {
      if (!target) return 1;
      return llmJudge(output, target);
    },
  },
  config: {
    projectApiKey: process.env.LMNR_PROJECT_API_KEY,
  },
  groupName: 'agent-after-compaction',
});
