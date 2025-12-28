// Retrieval service for Slice 2
// Handles context retrieval and formatting for prompt injection

import { searchMemories, type Memory } from '@/lib/memory';
import type { QueryComplexity } from '@/types/retrieval';

export interface RetrievalResult {
  memories: (Memory & { similarity: number })[];
  context: string; // Formatted for prompt injection
  tokenEstimate: number;
}

export interface RetrievalOptions {
  maxMemories?: number;
  minRelevance?: number;
  maxTokens?: number;
}

// Assess query complexity to determine retrieval depth
const assessQueryComplexity = (query: string): QueryComplexity => {
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
    lowercased.includes('you know about')
  ) {
    return 0.5;
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

// Format memories for prompt injection
// Groups by type and formats as markdown
const formatMemoriesForPrompt = (
  memories: (Memory & { similarity: number })[]
): string => {
  if (memories.length === 0) return '';

  const grouped = memories.reduce(
    (acc, m) => {
      if (!acc[m.type]) acc[m.type] = [];
      acc[m.type].push(m);
      return acc;
    },
    {} as Record<string, typeof memories>
  );

  let context = '## Relevant Context from Memory\n\n';

  // Order by importance: facts first, then preferences, then others
  const typeOrder = ['fact', 'preference', 'entity', 'decision', 'event'];
  const sortedTypes = Object.keys(grouped).sort(
    (a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
  );

  for (const type of sortedTypes) {
    const items = grouped[type];
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1) + 's';
    context += `### ${typeLabel}\n`;

    // Sort by importance within each group
    const sortedItems = items.sort((a, b) => b.importance - a.importance);
    for (const item of sortedItems) {
      context += `- ${item.content}\n`;
    }
    context += '\n';
  }

  return context;
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
  const { maxMemories = 15, maxTokens = 4000 } = options;

  const minRelevance = options.minRelevance ?? getRelevanceThreshold(query);

  try {
    console.log(`[Retrieval] Query: "${query.slice(0, 50)}..." threshold: ${minRelevance}`);

    // Search memories
    const memories = await searchMemories(userId, query, {
      threshold: minRelevance,
      limit: maxMemories,
    });

    console.log(`[Retrieval] Found ${memories.length} memories above threshold`);
    if (memories.length > 0) {
      memories.forEach(m => console.log(`  - [${m.type}] ${m.content.slice(0, 50)}... (sim: ${m.similarity.toFixed(3)})`));
    }

    // Format context
    let context = formatMemoriesForPrompt(memories);
    let tokenEstimate = estimateTokens(context);

    // Trim if over token budget (remove lowest importance memories first)
    const trimmedMemories = [...memories].sort(
      (a, b) => b.importance - a.importance
    );
    while (tokenEstimate > maxTokens && trimmedMemories.length > 0) {
      trimmedMemories.pop();
      context = formatMemoriesForPrompt(trimmedMemories);
      tokenEstimate = estimateTokens(context);
    }

    return {
      memories: trimmedMemories,
      context,
      tokenEstimate,
    };
  } catch (error) {
    // If retrieval fails, return empty result
    // Don't break the chat experience
    console.error('[Retrieval] Error retrieving context:', error);
    return {
      memories: [],
      context: '',
      tokenEstimate: 0,
    };
  }
};

// Export helpers for testing
export { assessQueryComplexity, getRelevanceThreshold, estimateTokens };
