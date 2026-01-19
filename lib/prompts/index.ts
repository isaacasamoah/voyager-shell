// Modular prompt composition service
// Layered system: Core → Voyage → User → Tools → Context
// DSPy-compatible: pure functions, structured data

import { retrieveContext, type RetrievalResult } from '@/lib/retrieval';
import { getPinnedKnowledge, type KnowledgeNode } from '@/lib/knowledge';

// Re-export types
export * from './types';

// Re-export core prompt
export { CORE_PROMPT, CORE_PROMPT_TOKENS } from './core';

// Re-export followup prompts
export { composeFollowupPrompt, formatCompletedTaskForFollowup } from './followup';

// Re-export defaults
export {
  DEFAULT_VOYAGE_CONFIG,
  DEFAULT_USER_PROFILE,
  DEFAULT_COMPOSER_OPTIONS,
  VOYAGE_PRESET_ENGINEERING,
  VOYAGE_PRESET_CREATIVE,
  VOYAGE_PRESET_ENTERPRISE,
  mergeVoyageConfig,
  mergeUserProfile,
} from './defaults';

// Re-export formatters
export * from './format';

// Re-export composer
export {
  composePrompt,
  composeMinimalPrompt,
  composeFromDb,
  debugPrompt,
  type ComposeInput,
  type ComposeFromDbInput,
} from './compose';

// Import for legacy compatibility
import { composePrompt } from './compose';
import { CORE_PROMPT } from './core';
import { mergeUserProfile } from './defaults';
import type { KnowledgeItem, RetrievedContext } from './types';

// ============================================================================
// LEGACY COMPATIBILITY LAYER
// These functions maintain backward compatibility with existing chat route
// ============================================================================

export interface UserProfile {
  id: string;
  displayName?: string;
  personalization?: {
    tone?: 'concise' | 'detailed' | 'casual';
    density?: 'minimal' | 'balanced' | 'comprehensive';
  };
}

interface ComposeOptions {
  profile?: UserProfile;
  voyageSlug?: string;
  continuityContext?: string | null;  // Retrieved context from conversation history
}

/**
 * Legacy compose function for backward compatibility.
 * Uses the new modular system under the hood.
 */
export const composeSystemPrompt = async (
  userId: string,
  query: string,
  options?: ComposeOptions
): Promise<{ systemPrompt: string; retrieval: RetrievalResult }> => {
  const { profile, voyageSlug, continuityContext } = options ?? {};

  // Retrieve relevant context using existing retrieval system
  const retrieval = await retrieveContext(userId, query, { voyageSlug });

  // Get pinned knowledge
  let pinnedKnowledge: KnowledgeItem[] = [];
  try {
    const pinned = await getPinnedKnowledge(userId, voyageSlug);
    pinnedKnowledge = pinned.map((k: KnowledgeNode) => ({
      id: k.eventId,
      content: k.content,
      source: 'pinned' as const,
      relevance: 1.0,
    }));
  } catch (error) {
    console.warn('[Prompts] Failed to get pinned knowledge:', error);
  }

  // Convert retrieval to new format
  const contextItems: KnowledgeItem[] = retrieval.knowledge.map((k) => ({
    id: k.eventId,
    content: k.content,
    source: 'personal' as const,
    relevance: k.importance || 0.5,
  }));

  // Add continuity context as high-priority item if present
  // This is context retrieved from earlier in the conversation (beyond the window)
  if (continuityContext) {
    contextItems.unshift({
      id: 'continuity-context',
      content: continuityContext,
      source: 'personal' as const, // Treat as personal context
      relevance: 1.0, // High priority - user explicitly referenced this
    });
  }

  const retrievedContext: RetrievedContext = {
    items: contextItems,
    query,
  };

  // Build user profile in new format
  const userProfile = profile
    ? mergeUserProfile(profile.id, {
        displayName: profile.displayName,
        communication: {
          verbosity: profile.personalization?.tone === 'concise'
            ? 'terse'
            : profile.personalization?.tone === 'detailed'
              ? 'detailed'
              : 'balanced',
          directness: 'balanced',
          technicalLevel: 'intermediate',
        },
        interaction: {
          confirmActions: true,
          proactiveHelp: true,
          showReasoning: false,
        },
        context: {},
      })
    : undefined;

  // Compose using new modular system
  const composed = composePrompt({
    userId,
    userProfile,
    pinnedKnowledge,
    retrievedContext,
  });

  return {
    systemPrompt: composed.systemPrompt,
    retrieval,
  };
};

/**
 * Legacy base prompt function for backward compatibility.
 */
export const getBasePrompt = (): string => {
  return CORE_PROMPT;
};
