// Domain Module types
// Compiles domain expertise from multiple sources into optimized prompt context

// =============================================================================
// SOURCE TYPES
// =============================================================================

/**
 * Type of domain source, in priority order:
 * - setup: How the team described themselves during onboarding
 * - pinned: Explicitly marked as important
 * - cited: Frequently referenced in conversations
 * - yaml: Manual configuration files
 */
export type DomainSourceType = 'setup' | 'pinned' | 'cited' | 'yaml'

/**
 * A single source contributing to domain expertise.
 */
export interface DomainSource {
  type: DomainSourceType
  content: string
  weight: number // 0.0-1.0, higher = more important
  metadata?: Record<string, unknown>
}

// =============================================================================
// COMPILED DOMAIN
// =============================================================================

/**
 * The compiled domain prompt, ready for injection.
 */
export interface CompiledDomain {
  /** Compiled ~500 token prompt capturing domain expertise */
  prompt: string
  /** Sources that contributed to this compilation */
  sources: DomainSource[]
  /** When this was compiled */
  compiledAt: Date
  /** Estimated token count (word count * 1.3) */
  tokenEstimate: number
}

// =============================================================================
// COMPILER OPTIONS
// =============================================================================

/**
 * Options for domain compilation.
 */
export interface DomainCompilerOptions {
  /** Maximum tokens for compiled prompt. Default: 500 */
  maxTokens?: number
  /** Minimum citation count to include 'cited' sources. Default: 2 */
  minCitationCount?: number
}

// =============================================================================
// WEIGHT DEFAULTS
// =============================================================================

/**
 * Default weights by source type (priority order).
 * Higher weight = included first in budget.
 */
export const DEFAULT_WEIGHTS: Record<DomainSourceType, number> = {
  setup: 1.0,
  pinned: 0.9,
  cited: 0.7,
  yaml: 0.5,
}
