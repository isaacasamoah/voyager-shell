/**
 * Depth Classifier for Voyager Phase 1.5
 *
 * Smart heuristics to determine retrieval depth BEFORE expensive LLM calls.
 * - Comprehensive queries skip IF decision (always go deep)
 * - Quick queries skip deep path entirely
 * - Standard queries let IF decision gate
 *
 * Design goal: <5ms latency, pure function, no dependencies
 */

export type SearchDepth = 'quick' | 'standard' | 'comprehensive';

/**
 * Signals that indicate user wants exhaustive, deep retrieval.
 * These queries bypass the IF decision and always trigger deep search.
 */
const COMPREHENSIVE_SIGNALS = {
  // Explicit breadth indicators
  explicit: [
    'everything about',
    'all of',
    'comprehensive',
    'thorough',
    'full history',
    'complete picture',
    'deep dive',
  ],
  // Temporal analysis (requires aggregating over time)
  temporal: [
    'over time',
    'history of',
    'evolution',
    'timeline',
    'progression',
    'how has',
    'changes to',
  ],
  // Reasoning/decision archaeology
  reasoning: [
    'compare',
    'trade-offs',
    'tradeoffs',
    'why did we',
    'decision behind',
    'reasoning for',
    'pros and cons',
  ],
  // Regex patterns for more complex matching
  patterns: [
    /everything.*(about|regarding|on)/i,
    /\ball\b.*\b(discussions?|mentions?|references?)\b/i,
    /\bsummarize\b.*\b(all|everything)\b/i,
  ],
};

/**
 * Signals that indicate a simple lookup - no deep retrieval needed.
 * These queries skip the deep path entirely for fast response.
 */
const QUICK_SIGNALS = {
  // Simple factual lookups
  factual: ['what is', 'when is', 'who is', 'where is', 'how do i'],
  // Direct resource requests
  simple: ['link to', 'url for', 'phone number', 'email for', 'address of'],
  // Regex patterns for question starters
  patterns: [/^(what|when|who|where)\s+is\s+/i, /^(show|give)\s+me\s+the\s+/i],
};

/**
 * Classifies query complexity to determine retrieval depth.
 *
 * @param query - The user's search query
 * @returns SearchDepth - 'quick' | 'standard' | 'comprehensive'
 *
 * Quick: Simple lookups, factual questions, short queries
 * Standard: Default - let IF decision determine if deep search needed
 * Comprehensive: Complex analysis, temporal queries, exhaustive requests
 */
export function classifySearchDepth(query: string): SearchDepth {
  const q = query.toLowerCase();

  // --- Comprehensive check (highest priority) ---

  // Explicit breadth signals
  for (const signal of COMPREHENSIVE_SIGNALS.explicit) {
    if (q.includes(signal)) return 'comprehensive';
  }

  // Temporal analysis signals
  for (const signal of COMPREHENSIVE_SIGNALS.temporal) {
    if (q.includes(signal)) return 'comprehensive';
  }

  // Reasoning/decision signals
  for (const signal of COMPREHENSIVE_SIGNALS.reasoning) {
    if (q.includes(signal)) return 'comprehensive';
  }

  // Pattern matching for comprehensive
  for (const pattern of COMPREHENSIVE_SIGNALS.patterns) {
    if (pattern.test(query)) return 'comprehensive';
  }

  // --- Quick check ---

  // Factual question starters
  for (const signal of QUICK_SIGNALS.factual) {
    if (q.startsWith(signal)) return 'quick';
  }

  // Simple resource requests
  for (const signal of QUICK_SIGNALS.simple) {
    if (q.includes(signal)) return 'quick';
  }

  // Pattern matching for quick
  for (const pattern of QUICK_SIGNALS.patterns) {
    if (pattern.test(query)) return 'quick';
  }

  // --- Structural heuristics ---

  const wordCount = query.trim().split(/\s+/).length;

  // Very short queries are usually simple lookups
  if (wordCount <= 5) return 'quick';

  // Very long queries usually indicate complex needs
  if (wordCount >= 15) return 'comprehensive';

  // Default: let IF decision gate the deep path
  return 'standard';
}
