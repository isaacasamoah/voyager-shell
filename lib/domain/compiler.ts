// Domain Compiler
// Compiles domain expertise from multiple sources into optimized prompt context
// ~120 LOC, no LLM calls, pure transformation

import type {
  DomainSource,
  DomainSourceType,
  CompiledDomain,
  DomainCompilerOptions,
} from './types'
import { DEFAULT_WEIGHTS } from './types'

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Simple token estimation: word count * 1.3
 * Accurate enough for budgeting, no tokenizer dependency.
 */
export const estimateTokens = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.ceil(words * 1.3)
}

// =============================================================================
// SOURCE EXTRACTION
// =============================================================================

/**
 * Extract key information from a source.
 * Strips boilerplate, keeps substance.
 */
const extractEssence = (source: DomainSource): string => {
  const content = source.content.trim()

  // For YAML sources, the content is already structured
  if (source.type === 'yaml') {
    return content
  }

  // For other sources, clean up common patterns
  return content
    // Remove common boilerplate phrases
    .replace(/^(we are|our company|our team|the team)\s+/gi, '')
    // Collapse multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim excessive whitespace
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Format a source for prompt inclusion.
 */
const formatSource = (source: DomainSource): string => {
  const essence = extractEssence(source)

  switch (source.type) {
    case 'setup':
      return essence
    case 'pinned':
      return essence
    case 'cited':
      return essence
    case 'yaml':
      return essence
    default:
      return essence
  }
}

// =============================================================================
// COMPILATION
// =============================================================================

/**
 * Compile domain sources into a cohesive prompt.
 * Pure synchronous transformation - no DB calls, no LLM.
 *
 * Algorithm:
 * 1. Sort sources by weight (highest first)
 * 2. Extract and format each source
 * 3. Accumulate until token budget exhausted
 * 4. Wrap in domain context block
 */
export const compileDomainFromSources = (
  sources: DomainSource[],
  options: DomainCompilerOptions = {}
): CompiledDomain => {
  const maxTokens = options.maxTokens ?? 500
  const minCitationCount = options.minCitationCount ?? 2

  // Filter sources by criteria
  const validSources = sources.filter((s) => {
    // Cited sources need minimum citation count
    if (s.type === 'cited') {
      const citationCount = (s.metadata?.citationCount as number) ?? 0
      return citationCount >= minCitationCount
    }
    return s.content.trim().length > 0
  })

  // Sort by weight (descending)
  const sortedSources = [...validSources].sort((a, b) => {
    const weightA = a.weight ?? DEFAULT_WEIGHTS[a.type]
    const weightB = b.weight ?? DEFAULT_WEIGHTS[b.type]
    return weightB - weightA
  })

  // Accumulate sources within token budget
  const includedSources: DomainSource[] = []
  const segments: string[] = []
  let currentTokens = 0

  // Reserve ~20 tokens for wrapper text
  const contentBudget = maxTokens - 20

  for (const source of sortedSources) {
    const formatted = formatSource(source)
    const tokens = estimateTokens(formatted)

    if (currentTokens + tokens <= contentBudget) {
      segments.push(formatted)
      includedSources.push(source)
      currentTokens += tokens
    } else if (segments.length === 0) {
      // First source is too large - truncate it
      const maxWords = Math.floor(contentBudget / 1.3)
      const words = formatted.split(/\s+/)
      const truncated = words.slice(0, maxWords).join(' ') + '...'
      segments.push(truncated)
      includedSources.push(source)
      break
    }
  }

  // Build the compiled prompt
  let prompt = ''
  if (segments.length > 0) {
    prompt = '## Domain Context\n\n' + segments.join('\n\n')
  }

  const tokenEstimate = estimateTokens(prompt)

  return {
    prompt,
    sources: includedSources,
    compiledAt: new Date(),
    tokenEstimate,
  }
}

// =============================================================================
// ASYNC COMPILATION (DB FETCH)
// =============================================================================

/**
 * Compile domain for a voyage by fetching sources from DB.
 *
 * TODO: Implement DB fetching for:
 * - Setup conversations (voyage onboarding transcripts)
 * - Pinned knowledge (getPinnedKnowledge)
 * - Cited knowledge (frequently referenced items)
 * - YAML config (voyage settings)
 */
export const compileDomain = async (
  voyageSlug: string,
  options: DomainCompilerOptions = {}
): Promise<CompiledDomain> => {
  // TODO: Fetch sources from DB
  // const setupSources = await getSetupConversations(voyageSlug)
  // const pinnedSources = await getPinnedKnowledge(voyageSlug)
  // const citedSources = await getFrequentlyCited(voyageSlug, options.minCitationCount)
  // const yamlSources = await getYamlConfig(voyageSlug)

  // For now, return empty compilation
  // Implementation will be added when DB schema is ready
  console.log(`[Domain] compileDomain called for voyage: ${voyageSlug}`)

  const sources: DomainSource[] = []

  return compileDomainFromSources(sources, options)
}
