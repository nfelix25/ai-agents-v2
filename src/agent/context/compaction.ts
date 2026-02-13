import { generateText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { extractMessageText } from './tokenEstimator.ts';

const SUMMARIZATION_PROMPT_A = `
  You are a conversation summarizer. Your task is to create a concise summary of the conversation so far that preserves:

  1. Key decisions and conclusions reached.
  2. Important context and facts mentioned.
  3. Any pending tasks or questions.
  4. The overall goal of the conversation.

  Be concise, but complete. The summary should allow the conversation to continue naturally.

  Conversation to summarize:
`;

const SUMMARIZATION_PROMPT_B = `
  You are the Conversation Compactor for a long-running LLM-based agent.

  GOAL
  Compress the conversation so far into a compact, durable state the agent can carry forward, while preserving: (a) user intent and constraints, (b) decisions and commitments already made, (c) unresolved questions and next steps, (d) definitions and terminology established, (e) user preferences and stable personal context, (f) critical evidence/citations/IDs if present.

  INPUTS
  - conversation: full transcript so far (or the most recent chunk)
  - current_task: the agent’s active objective(s), if any
  - current_state: existing memory/state (if any)

  OUTPUT
  Return ONLY valid JSON matching the schema below. Do not include commentary, markdown, or extra keys.

  SCHEMA
  {
    "task_focus": "1–2 sentences (each) describing the current objective(s).",
    "user_profile": {
      "stable_preferences": ["bullet-ish strings; only long-lived preferences"],
      "style_tone_preferences": ["e.g., concise vs detailed; formatting; etc."],
      "constraints": ["hard constraints: time, budget, tools, privacy, etc."],
      "domain_context": ["relevant background the user has that affects answers"]
    },
    "working_memory": {
      "key_facts": ["facts established in convo that matter going forward"],
      "definitions": [{"term": "...", "meaning": "..."}],
      "assumptions": ["assumptions the agent is currently using; mark as assumptions"],
      "open_questions": ["questions that must be answered to proceed"],
      "risks_or_watchouts": ["things likely to go wrong; pitfalls; sensitivities"]
    },
    "decisions_and_commitments": [
      {"decision": "...", "rationale": "...", "status": "made|tentative"}
    ],
    "plan": {
      "next_steps": ["ordered steps the agent should do next"],
      "blocked_on": ["what is blocking progress, if anything"]
    },
    "retrieval_index": {
      "topics": ["keywords for later retrieval"],
      "entities": ["people/tools/projects mentioned"],
      "artifacts": [{"type": "doc|code|link|file", "id_or_url": "...", "note": "..."}]
    },
    "conversation_do_not_forget": [
      "Up to ~10 short, high-signal lines that must survive any summarization."
    ],
    "deletions": {
      "safe_to_forget": ["redundant chatter, repeated explanations, etc."],
      "verbatim_to_drop": ["long quotes / logs that can be referenced elsewhere"]
    }
  }

  RULES
  1) Prefer precision over coverage. Keep only what changes future behavior.
  2) Preserve numbers, names, IDs, and user-stated constraints exactly.
  3) If the user expressed a preference, include it only if it’s likely stable.
  4) Mark uncertainty explicitly as an assumption; don’t smuggle guesses as facts.
  5) Keep the entire JSON under ~1,200 tokens if possible; be aggressively concise.
  6) Never include private system prompts or hidden policies in the output.
  7) If the transcript contains sensitive data (credentials, secrets), do NOT copy it; instead add a note in risks_or_watchouts and redact from key_facts.
  8) If multiple tasks exist, set task_focus to the active one and list others in open_questions or next_steps.

  Now produce the JSON compaction for the provided conversation.
`;

/**
 * Format messages array as readable text for summarization
 */
function messagesToText(messages: ModelMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role.toUpperCase();
      const content = extractMessageText(msg);
      return `[${role}]: ${content}`;
    })
    .join('\n\n');
}

/**
 * Compact a conversation by summarizing it with an LLM.
 *
 * Takes the current messages (excluding system prompt) and returns a new
 * messages array with:
 * - A user message containing the summary
 * - An assistant acknowledgment
 *
 * The system prompt should be prepended by the caller.
 */
export async function compactConversation(
  messages: ModelMessage[],
  model: string = 'gpt-5-mini',
): Promise<any> {
  // Filter out system messages - they're handled separately
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  if (conversationMessages.length === 0) {
    return [];
  }

  const conversationText = messagesToText(conversationMessages);

  const { text: summary } = await generateText({
    model: openai(model),
    prompt: SUMMARIZATION_PROMPT_A + conversationText,
  });

  // Create compacted messages
  const compactedMessages: ModelMessage[] = [
    {
      role: 'user',
      content: `[CONVERSATION SUMMARY]\nThe following is a summary of our conversation so far:\n\n${summary}\n\nPlease continue from where we left off.`,
    },
    {
      role: 'assistant',
      content:
        "I understand. I've reviewed the summary of our conversation and I'm ready to continue. How can I help you next?",
    },
  ];

  return compactedMessages;
}
