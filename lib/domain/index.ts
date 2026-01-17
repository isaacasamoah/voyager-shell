// Domain Module
// Compiles domain expertise from multiple sources into optimized prompt context
//
// Usage:
//   // Sync (from pre-fetched sources)
//   const compiled = compileDomainFromSources(sources, { maxTokens: 500 })
//
//   // Async (fetches from DB)
//   const compiled = await compileDomain('acme-corp', { maxTokens: 500 })
//
// Sources are prioritized: setup > pinned > cited > yaml

// Types
export type { DomainSource, DomainSourceType, CompiledDomain, DomainCompilerOptions } from './types'
export { DEFAULT_WEIGHTS } from './types'

// Compiler functions
export { compileDomain, compileDomainFromSources, estimateTokens } from './compiler'
