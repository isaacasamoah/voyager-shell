// =============================================================================
// VOYAGER V2: USER MEMORY TYPES
// =============================================================================
// TypeScript types matching the SQL schema in 001_memory.sql
// Used by retrieval agents and memory operations.

// -----------------------------------------------------------------------------
// Core Types
// -----------------------------------------------------------------------------

export type MemoryType = 'fact' | 'preference' | 'entity' | 'summary' | 'insight'

export type EntityType = 'person' | 'project' | 'tool' | 'topic' | 'company'

export type SourceType =
  | 'conversation'
  | 'onboarding'
  | 'integration'
  | 'inference'
  | 'user_confirmed'

export type RelationshipType =
  | 'mentions'
  | 'relates_to'
  | 'contradicts'
  | 'supports'
  | 'supersedes'

export type RetrievalMethod = 'semantic' | 'entity' | 'recency' | 'related'

// -----------------------------------------------------------------------------
// Database Row Types
// -----------------------------------------------------------------------------

export interface UserMemory {
  id: string
  user_id: string
  memory_type: MemoryType
  content: string
  embedding: number[] | null
  importance: number
  confidence: number
  created_at: string
  last_accessed_at: string | null
  access_count: number
  superseded_by: string | null
  superseded_at: string | null
  is_active: boolean
  source_type: SourceType
  source_conversation_id: string | null
  source_metadata: Record<string, unknown>
  entity_type: EntityType | null
  entity_name: string | null
  entity_aliases: string[] | null
  categories: string[]
  tags: string[]
  flagged_for_review: boolean
  review_reason: string | null
}

export interface MemoryRelationship {
  id: string
  user_id: string
  source_memory_id: string
  target_memory_id: string
  relationship_type: RelationshipType
  strength: number
  created_at: string
}

export interface ConversationSummary {
  id: string
  user_id: string
  conversation_id: string
  summary: string
  key_points: string[] | null
  entities_mentioned: string[] | null
  decisions_made: string[] | null
  embedding: number[] | null
  message_count: number
  start_time: string
  end_time: string
  community_id: string | null
  created_at: string
}

export interface MemoryAccessLog {
  id: string
  user_id: string
  memory_id: string
  conversation_id: string | null
  query_text: string | null
  retrieval_method: RetrievalMethod
  was_useful: boolean | null
  similarity_score: number | null
  accessed_at: string
}

// -----------------------------------------------------------------------------
// Input Types (for creating/updating)
// -----------------------------------------------------------------------------

export interface CreateMemoryInput {
  user_id: string
  memory_type: MemoryType
  content: string
  embedding?: number[]
  importance?: number
  confidence?: number
  source_type: SourceType
  source_conversation_id?: string
  source_metadata?: Record<string, unknown>
  entity_type?: EntityType
  entity_name?: string
  entity_aliases?: string[]
  categories?: string[]
  tags?: string[]
}

export interface CreateRelationshipInput {
  user_id: string
  source_memory_id: string
  target_memory_id: string
  relationship_type: RelationshipType
  strength?: number
}

// -----------------------------------------------------------------------------
// Retrieval Types
// -----------------------------------------------------------------------------

export interface RetrievalQuery {
  user_id: string
  query_text: string
  query_embedding?: number[]
  mentioned_entities?: string[]
  categories?: string[]
  min_similarity?: number
  limit?: number
  include_inactive?: boolean
  recency_days?: number
}

export interface ScoredMemory extends UserMemory {
  similarity: number
  score: number
}

export interface RetrievalResult {
  memories: ScoredMemory[]
  entities: UserMemory[]
  recent_summaries: ConversationSummary[]
  query_time_ms: number
}

// -----------------------------------------------------------------------------
// Retrieval Scoring Configuration
// -----------------------------------------------------------------------------

export interface ScoringWeights {
  semantic: number      // Default: 0.4
  recency: number       // Default: 0.3
  importance: number    // Default: 0.2
  confidence: number    // Default: 0.1
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  semantic: 0.4,
  recency: 0.3,
  importance: 0.2,
  confidence: 0.1,
}

export interface ScoringConfig {
  weights: ScoringWeights
  recency_decay_days: number    // Default: 90
  min_similarity_threshold: number  // Default: 0.3
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: DEFAULT_SCORING_WEIGHTS,
  recency_decay_days: 90,
  min_similarity_threshold: 0.3,
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Calculate combined retrieval score for a memory.
 * Matches the SQL function `calculate_memory_score`.
 */
export const calculateMemoryScore = (
  semanticSimilarity: number,
  createdAt: Date,
  importance: number,
  confidence: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number => {
  // Calculate recency score (exponential decay)
  const daysOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  const recencyScore = Math.exp(-daysOld / config.recency_decay_days)

  // Weighted combination
  return (
    semanticSimilarity * config.weights.semantic +
    recencyScore * config.weights.recency +
    importance * config.weights.importance +
    confidence * config.weights.confidence
  )
}

/**
 * Format memory for LLM context injection.
 * Returns a concise string representation.
 */
export const formatMemoryForContext = (memory: UserMemory): string => {
  const prefix = {
    fact: 'Fact',
    preference: 'Preference',
    entity: `Entity (${memory.entity_type})`,
    summary: 'Summary',
    insight: 'Insight',
  }[memory.memory_type]

  const confidence = memory.confidence < 0.7 ? ' [uncertain]' : ''
  return `[${prefix}${confidence}] ${memory.content}`
}

/**
 * Format multiple memories for context injection.
 * Groups by type for cleaner prompts.
 */
export const formatMemoriesForPrompt = (memories: UserMemory[]): string => {
  const grouped = memories.reduce(
    (acc, m) => {
      acc[m.memory_type] = acc[m.memory_type] || []
      acc[m.memory_type].push(m)
      return acc
    },
    {} as Record<MemoryType, UserMemory[]>
  )

  const sections: string[] = []

  // Order: entities first, then facts, preferences, insights, summaries
  const typeOrder: MemoryType[] = ['entity', 'fact', 'preference', 'insight', 'summary']

  for (const type of typeOrder) {
    const items = grouped[type]
    if (!items?.length) continue

    const header = {
      entity: '## Known Entities',
      fact: '## Facts About User',
      preference: '## User Preferences',
      insight: '## Observed Patterns',
      summary: '## Conversation Context',
    }[type]

    const content = items.map((m) => `- ${m.content}`).join('\n')
    sections.push(`${header}\n${content}`)
  }

  return sections.join('\n\n')
}
