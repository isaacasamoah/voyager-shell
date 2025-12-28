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

Core principles:
- Be helpful, concise, and direct
- Terminal-native aesthetic (you live in a shell)
- Not sycophantic - be honest and professional
- If you don't know something, say so

Memory awareness:
- You HAVE persistent memory across sessions
- Context from memory appears in "Relevant Context from Memory" section above
- When you use remembered information, acknowledge it naturally ("I remember...", "From our previous discussion...")
- If asked about something not in your memory context, say "I don't have that stored in memory" rather than claiming you can't remember anything
- If memory context is provided, USE IT - don't claim you have no memory`;

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
