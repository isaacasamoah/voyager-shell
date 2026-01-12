// Context formatter
// Pure function: RetrievedContext → prompt section string
// DSPy-ready: could become an optimizable module

import type { RetrievedContext, KnowledgeItem } from '../types';

/**
 * Formats retrieved knowledge into a prompt section.
 *
 * Design principles:
 * - Relevance-ordered: Most relevant first
 * - Source-attributed: Clear where knowledge came from
 * - Truncation-aware: Can be cut from the bottom safely
 */
export const formatContext = (
  context: RetrievedContext,
  maxTokens?: number
): string => {
  if (context.items.length === 0) {
    return '';
  }

  const sections: string[] = [
    '# Relevant Knowledge (Pre-Retrieved)',
    '',
    '> I already searched for context relevant to this conversation. USE THIS FIRST before calling any retrieval tools. Only search if this context is insufficient.',
  ];

  // Sort by relevance (highest first)
  const sorted = [...context.items].sort((a, b) => b.relevance - a.relevance);

  // Group by source for cleaner presentation
  const personal = sorted.filter((i) => i.source === 'personal');
  const voyage = sorted.filter((i) => i.source === 'voyage');
  const pinned = sorted.filter((i) => i.source === 'pinned');

  // Pinned first (most important)
  if (pinned.length > 0) {
    sections.push(formatGroup('Pinned', pinned));
  }

  // Personal knowledge
  if (personal.length > 0) {
    sections.push(formatGroup('From Memory', personal));
  }

  // Community knowledge
  if (voyage.length > 0) {
    sections.push(formatGroup('From Community', voyage));
  }

  let result = sections.join('\n');

  // Truncate if needed (rough token estimate)
  if (maxTokens) {
    result = truncateToTokens(result, maxTokens);
  }

  return result;
};

const formatGroup = (label: string, items: KnowledgeItem[]): string => {
  const lines: string[] = [`\n## ${label}`];

  items.forEach((item) => {
    const content = item.content.trim();

    // For longer content, keep as paragraphs
    if (content.length > 200) {
      lines.push(`\n${content}`);
    } else {
      // For shorter content, use bullets
      lines.push(`- ${content.replace(/\n+/g, ' ')}`);
    }
  });

  return lines.join('\n');
};

/**
 * Truncates content to approximately the given token count.
 * Cuts from the bottom (least relevant content).
 */
const truncateToTokens = (content: string, maxTokens: number): string => {
  const words = content.split(/\s+/);
  const estimatedTokens = Math.ceil(words.length * 0.75);

  if (estimatedTokens <= maxTokens) {
    return content;
  }

  // Calculate how many words we can keep
  const maxWords = Math.floor(maxTokens / 0.75);
  const truncated = words.slice(0, maxWords).join(' ');

  // Find a clean break point (end of line or paragraph)
  const lastNewline = truncated.lastIndexOf('\n');
  const lastPeriod = truncated.lastIndexOf('. ');
  const breakPoint = Math.max(lastNewline, lastPeriod);

  if (breakPoint > truncated.length * 0.8) {
    return truncated.slice(0, breakPoint + 1) + '\n\n[Additional context truncated]';
  }

  return truncated + '\n\n[Additional context truncated]';
};

/**
 * Formats a simple "no context" message when retrieval returns empty.
 */
export const formatNoContext = (): string => {
  return '# Context\n\nNo relevant context found for this query.';
};

/**
 * Estimates token count for the formatted context.
 */
export const estimateContextTokens = (context: RetrievedContext): number => {
  const formatted = formatContext(context);
  const words = formatted.split(/\s+/).length;
  return Math.ceil(words * 0.75);
};
