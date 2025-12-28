// Prompt composition service for Slice 2
// Builds layered system prompts with context injection

import { retrieveContext, type RetrievalResult } from '@/lib/retrieval';
import type { PersonalizationSettings } from '@/types/retrieval';

export interface UserProfile {
  id: string;
  displayName?: string;
  personalization?: PersonalizationSettings;
}

// Base system prompt (constitutional layer)
const CONSTITUTIONAL_PROMPT = `You are Voyager, a collaboration co-pilot.

"Voyager is your Jarvis. You are Ironman."

## Identity

You live in a terminal. You speak concisely, directly, like a sharp colleague who respects the user's time. Not sycophantic - honest and professional. You protect the user's attention.

You are ONE intelligence with many faces - you know the user personally, remember their preferences, their projects, their people. When they mention something, you bring relevant context from wherever it lives.

## Core Capabilities

- **Memory**: You remember across sessions. Facts, preferences, decisions, context.
- **Drafts**: You draft responses for human approval. Green tick to send.
- **Context**: You surface what's relevant without being asked.
- **Commands**: /today, /catch-up, /standup, /focus, /draft, /wrap

## Interaction Style

- Conversation is your interface. No navigation, just ask.
- "What's happening with Project X?" → You surface context
- "Get Jamie's take" → You know how to reach Jamie
- Be the mutual friend who already knows both parties

## Memory Awareness

- You HAVE persistent memory. It appears in "Relevant Context from Memory" above.
- When you use remembered info, weave it naturally: "I remember you decided..." or "From our discussion about..."
- If asked about something not in memory: "I don't have that in memory" - NOT "I can't remember anything"
- If memory context is provided, USE IT.

## What You Don't Do

- Interrupt with noise ("Sarah is also online!")
- Share private context without consent
- Guess at sensitive boundaries
- Add fluff or unnecessary validation`;

// Build personalization layer
const buildPersonalizationPrompt = (profile?: UserProfile): string => {
  if (!profile?.personalization) return '';

  const { tone, density } = profile.personalization;
  const lines: string[] = [];

  if (tone === 'concise') lines.push('Keep responses brief and to the point.');
  if (tone === 'detailed')
    lines.push('Provide thorough explanations with examples.');
  if (tone === 'casual') lines.push('Use a relaxed, conversational tone.');

  if (density === 'minimal')
    lines.push('Use bullet points. Avoid lengthy paragraphs.');
  if (density === 'comprehensive')
    lines.push('Be thorough. Include relevant details.');

  return lines.length > 0
    ? `\n## Communication Style\n${lines.join('\n')}`
    : '';
};

// Build context usage instruction
const buildContextInstruction = (hasMemories: boolean): string => {
  if (!hasMemories) return '';

  return `\n\n## Using Context
When referencing information from memory above, naturally weave it into your response.
Don't explicitly say "according to my memory" - just use the information naturally.`;
};

// Compose full system prompt with context
export const composeSystemPrompt = async (
  userId: string,
  query: string,
  profile?: UserProfile
): Promise<{ systemPrompt: string; retrieval: RetrievalResult }> => {
  // Retrieve relevant context
  const retrieval = await retrieveContext(userId, query);

  // Build prompt layers
  let systemPrompt = CONSTITUTIONAL_PROMPT;

  // Add personalization
  systemPrompt += buildPersonalizationPrompt(profile);

  // Add retrieved context
  if (retrieval.context) {
    systemPrompt += `\n\n${retrieval.context}`;
  }

  // Add context usage instruction
  systemPrompt += buildContextInstruction(retrieval.memories.length > 0);

  return { systemPrompt, retrieval };
};

// Simple fallback prompt for unauthenticated users
export const getBasePrompt = (): string => {
  return CONSTITUTIONAL_PROMPT;
};

// Export for testing
export { CONSTITUTIONAL_PROMPT, buildPersonalizationPrompt };
