// Retrieval service for Slice 2 Phase 1
// Uses event-sourced knowledge system
//
// Philosophy: "Curation is subtraction, not extraction"
// - Messages ARE the knowledge (preserved exactly)
// - Pinned items surface first
// - Quieted items hidden by default

import {
  searchKnowledge,
  getPinnedKnowledge,
  formatKnowledgeForPrompt,
  type KnowledgeNode,
} from '@/lib/knowledge';

export interface RetrievalResult {
  knowledge: KnowledgeNode[];
  context: string; // Formatted for prompt injection
  tokenEstimate: number;
  // Metadata for logging
  metadata: {
    threshold: number;
    pinnedCount: number;
    searchCount: number;
    latencyMs: number;
  };
}

export interface RetrievalOptions {
  maxResults?: number;
  minRelevance?: number;
  maxTokens?: number;
  voyageSlug?: string;
}

// Assess query complexity to determine retrieval depth
const assessQueryComplexity = (query: string): 'simple' | 'contextual' | 'complex' => {
  const lowercased = query.toLowerCase();

  // Simple queries need minimal context
  if (lowercased.match(/^(what|when|who|where) (is|was|are|were) /)) {
    return 'simple';
  }

  // Complex queries need deep context
  if (
    lowercased.includes('help me') ||
    lowercased.includes('how should') ||
    lowercased.includes('plan') ||
    lowercased.includes('strategy') ||
    lowercased.length > 200
  ) {
    return 'complex';
  }

  return 'contextual';
};

// Get relevance threshold based on query
const getRelevanceThreshold = (query: string): number => {
  const lowercased = query.toLowerCase();

  // Explicit memory queries get lower threshold
  if (
    lowercased.includes('remember') ||
    lowercased.includes('recall') ||
    lowercased.includes('what do you know') ||
    lowercased.includes('did we decide') ||
    lowercased.includes('we discussed') ||
    lowercased.includes('we talked about') ||
    lowercased.includes('you know about') ||
    lowercased.includes('what else') ||
    lowercased.includes('other decisions') ||
    lowercased.includes('insights') ||
    lowercased.includes('concepts') ||
    lowercased.includes('we learned') ||
    lowercased.includes('from that conversation') ||
    lowercased.includes('from that discussion')
  ) {
    return 0.35; // Lower for explicit memory probing - prefer recall over precision
  }

  const complexity = assessQueryComplexity(query);
  switch (complexity) {
    case 'simple':
      return 0.85;
    case 'complex':
      return 0.6;
    default:
      return 0.7;
  }
};

// Estimate tokens (rough: ~4 chars per token)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// Main retrieval function
export const retrieveContext = async (
  userId: string,
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult> => {
  const startTime = Date.now();
  const { maxResults = 15, maxTokens = 4000, voyageSlug } = options;

  const minRelevance = options.minRelevance ?? getRelevanceThreshold(query);

  try {
    console.log(`[Retrieval] Query: "${query.slice(0, 50)}..." threshold: ${minRelevance}`);

    // Get pinned knowledge first (always surface these)
    const pinned = await getPinnedKnowledge(userId, voyageSlug);

    // Search for relevant knowledge
    const searchResults = await searchKnowledge(userId, query, {
      threshold: minRelevance,
      limit: maxResults,
      voyageSlug,
      includeQuiet: false, // Respect curation
    });

    // Combine: pinned first, then search results (dedupe)
    const pinnedIds = new Set(pinned.map((p) => p.eventId));
    const combined = [
      ...pinned,
      ...searchResults.filter((r) => !pinnedIds.has(r.eventId)),
    ];

    console.log(
      `[Retrieval] Found ${pinned.length} pinned + ${searchResults.length} search results`
    );
    if (combined.length > 0 && combined.length <= 5) {
      combined.forEach((k) =>
        console.log(
          `  - [${k.classifications[0] ?? 'message'}] ${k.content.slice(0, 50)}... (pinned: ${k.isPinned})`
        )
      );
    }

    // Format context
    let context = formatKnowledgeForPrompt(combined);
    let tokenEstimate = estimateTokens(context);

    // Trim if over token budget (remove lowest importance, keep pinned)
    const trimmed = [...combined].sort((a, b) => {
      // Pinned always stay
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Then by importance
      return b.importance - a.importance;
    });

    while (tokenEstimate > maxTokens && trimmed.length > pinned.length) {
      trimmed.pop();
      context = formatKnowledgeForPrompt(trimmed);
      tokenEstimate = estimateTokens(context);
    }

    const latencyMs = Date.now() - startTime;

    return {
      knowledge: trimmed,
      context,
      tokenEstimate,
      metadata: {
        threshold: minRelevance,
        pinnedCount: pinned.length,
        searchCount: searchResults.length,
        latencyMs,
      },
    };
  } catch (error) {
    // If retrieval fails, return empty result
    // Don't break the chat experience
    console.error('[Retrieval] Error retrieving context:', error);
    return {
      knowledge: [],
      context: '',
      tokenEstimate: 0,
      metadata: {
        threshold: minRelevance,
        pinnedCount: 0,
        searchCount: 0,
        latencyMs: Date.now() - startTime,
      },
    };
  }
};

// Export helpers for testing
export { assessQueryComplexity, getRelevanceThreshold, estimateTokens };

// Export logging utilities
export {
  logRetrievalEvent,
  logCitations,
  detectCitations,
  type RetrievalEventInput,
} from './logging';

// Export retrieval tools for agentic search
export {
  createRetrievalTools,
  type ToolContext,
  type RetrievalTools,
} from './tools';
