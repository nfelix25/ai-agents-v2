import { generateText, stepCountIs, tool, type Tool, type ToolSet } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

import type {
  EvalData,
  SingleTurnResult,
  MultiTurnEvalData,
  MultiTurnResult,
} from './types.ts';

const TOOL_DEFINITIONS: Record<
  string,
  { description: Tool['description']; parameters: Record<string, any> }
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
