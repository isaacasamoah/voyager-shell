// Knowledge Search service for Slice 2 Phase 1
// Semantic search over the event-sourced knowledge system
//
// Philosophy: "Curation is subtraction, not extraction"
// - Searches knowledge_current (computed state from source events)
// - Respects attention state (quiet vs active)
// - Pinned items are always surfaced first

import OpenAI from 'openai'
import { getAdminClient } from '@/lib/supabase/admin'
import type { Classification } from './events'

// Use admin client for knowledge operations (bypasses RLS)
// TODO: Switch to user-scoped client once auth is wired up
const getClient = () => getAdminClient()

// Lazy-initialize OpenAI client to avoid build-time errors
let _openai: OpenAI | null = null
const getOpenAI = (): OpenAI => {
  if (!_openai) {
    _openai = new OpenAI()
  }
  return _openai
}

// =============================================================================
// Types (matching 010_knowledge_events.sql schema)
// =============================================================================

/**
 * A knowledge node from knowledge_current.
 * Represents a source event with computed attention state.
 */
export interface KnowledgeNode {
  eventId: string             // Source event ID (primary key)
  content: string             // THE ACTUAL KNOWLEDGE (preserved exactly)
  classifications: string[]   // Metadata: fact, decision, preference, etc.
  entities: string[]          // Metadata: people, systems, projects
  topics: string[]            // Metadata: domain topics
  isActive: boolean           // Attention: false = quieted (noise)
  isPinned: boolean           // Attention: true = elevated importance
  importance: number          // Attention: 0.0-1.0 weight
  connectedTo: string[]       // Graph: related event IDs
  createdAt: Date             // When the source event was created
  similarity?: number         // Search relevance score
}

export interface SearchOptions {
  /** Minimum similarity threshold (0-1). Default: 0.6 */
  threshold?: number
  /** Maximum results to return. Default: 20 */
  limit?: number
  /** Filter by classification types */
  classifications?: Classification[]
  /** Filter by voyage slug */
  voyageSlug?: string
  /** Include quiet (inactive) content. Default: false */
  includeQuiet?: boolean
  /** Minimum importance. Default: 0.0 */
  minImportance?: number
}

// RPC result type (matching search_knowledge function in schema)
interface SearchKnowledgeResult {
  event_id: string
  content: string
  classifications: string[]
  entities: string[]
  topics: string[]
  is_active: boolean
  is_pinned: boolean
  importance: number
  connected_to: string[]
  source_created_at: string
  similarity: number
}

// =============================================================================
// Embedding Generation
// =============================================================================

const generateEmbedding = async (text: string): Promise<number[]> => {
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

const toVectorString = (embedding: number[]): string => {
  return `[${embedding.join(',')}]`
}

// =============================================================================
// Transform Functions
// =============================================================================

const transformKnowledgeNode = (row: SearchKnowledgeResult): KnowledgeNode => ({
  eventId: row.event_id,
  content: row.content,
  classifications: row.classifications ?? [],
  entities: row.entities ?? [],
  topics: row.topics ?? [],
  isActive: row.is_active,
  isPinned: row.is_pinned,
  importance: row.importance,
  connectedTo: row.connected_to ?? [],
  createdAt: new Date(row.source_created_at),
  similarity: row.similarity,
})

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search knowledge by semantic similarity.
 * Queries the knowledge_current table (computed state from source events).
 *
 * @param userId - The user's ID (for personal knowledge scope)
 * @param query - The search query text
 * @param options - Search options (threshold, limit, filters)
 * @returns Array of matching knowledge nodes with similarity scores
 */
export const searchKnowledge = async (
  userId: string,
  query: string,
  options: SearchOptions = {}
): Promise<KnowledgeNode[]> => {
  const {
    threshold = 0.6,
    limit = 20,
    classifications,
    voyageSlug,
    includeQuiet = false,
    minImportance = 0.0,
  } = options

  try {
    console.log(
      `[Knowledge] Search: "${query.slice(0, 50)}..." threshold: ${threshold}, limit: ${limit}`
    )

    const supabase = getClient()

    // Generate embedding for the query
    const embedding = await generateEmbedding(query)

    // Call the RPC function for semantic search
    
    const { data, error } = await (supabase as any).rpc('search_knowledge', {
      query_embedding: toVectorString(embedding),
      p_user_id: userId,
      p_voyage_slug: voyageSlug ?? null,
      p_include_quiet: includeQuiet,
      p_classifications: classifications ?? null,
      p_min_importance: minImportance,
      p_match_threshold: threshold,
      p_match_count: limit,
    })

    if (error) {
      console.error('[Knowledge] Search error:', error)
      return []
    }

    const results = (data as SearchKnowledgeResult[] | null) ?? []

    console.log(`[Knowledge] Found ${results.length} results`)
    if (results.length > 0 && results.length <= 5) {
      results.forEach((r) =>
        console.log(
          `  - ${r.content.slice(0, 50)}... (sim: ${r.similarity.toFixed(3)}, pinned: ${r.is_pinned})`
        )
      )
    }

    return results.map(transformKnowledgeNode)
  } catch (error) {
    console.error('[Knowledge] searchKnowledge error:', error)
    return []
  }
}

/**
 * Get knowledge by specific event IDs.
 * Useful for following graph edges or getting context for specific nodes.
 */
export const getKnowledgeByIds = async (eventIds: string[]): Promise<KnowledgeNode[]> => {
  if (eventIds.length === 0) return []

  try {
    const supabase = getClient()

    
    const { data, error } = await (supabase as any)
      .from('knowledge_current')
      .select('*')
      .in('event_id', eventIds)

    if (error) {
      console.error('[Knowledge] getKnowledgeByIds error:', error)
      return []
    }

    return (data ?? []).map((row: SearchKnowledgeResult) =>
      transformKnowledgeNode({
        ...row,
        similarity: 1.0, // Not from search, so similarity is 1
      })
    )
  } catch (error) {
    console.error('[Knowledge] getKnowledgeByIds error:', error)
    return []
  }
}

/**
 * Get connected knowledge (follow graph edges).
 * Retrieves nodes connected to a given node.
 */
export const getConnectedKnowledge = async (eventId: string): Promise<KnowledgeNode[]> => {
  try {
    const supabase = getClient()

    // Get the node to find its connections
    
    const { data: node, error: nodeError } = await (supabase as any)
      .from('knowledge_current')
      .select('connected_to')
      .eq('event_id', eventId)
      .single()

    if (nodeError || !node) {
      console.error('[Knowledge] getConnectedKnowledge node error:', nodeError)
      return []
    }

    const connectedIds = node.connected_to as string[]
    if (!connectedIds || connectedIds.length === 0) {
      return []
    }

    return getKnowledgeByIds(connectedIds)
  } catch (error) {
    console.error('[Knowledge] getConnectedKnowledge error:', error)
    return []
  }
}

/**
 * Get recent knowledge for a user.
 * Returns recently created knowledge nodes.
 */
export const getRecentKnowledge = async (
  userId: string,
  limit = 20
): Promise<KnowledgeNode[]> => {
  try {
    const supabase = getClient()

    
    const { data, error } = await (supabase as any)
      .from('knowledge_current')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('source_created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Knowledge] getRecentKnowledge error:', error)
      return []
    }

    return (data ?? []).map((row: SearchKnowledgeResult) =>
      transformKnowledgeNode({
        ...row,
        similarity: 1.0,
      })
    )
  } catch (error) {
    console.error('[Knowledge] getRecentKnowledge error:', error)
    return []
  }
}

/**
 * Get pinned knowledge for a user/voyage.
 * Pinned items are always surfaced.
 */
export const getPinnedKnowledge = async (
  userId: string,
  voyageSlug?: string
): Promise<KnowledgeNode[]> => {
  try {
    const supabase = getClient()

    
    let query = (supabase as any)
      .from('knowledge_current')
      .select('*')
      .eq('is_pinned', true)

    if (voyageSlug) {
      query = query.eq('voyage_slug', voyageSlug)
    } else {
      query = query.eq('user_id', userId).is('voyage_slug', null)
    }

    const { data, error } = await query.order('importance', { ascending: false })

    if (error) {
      console.error('[Knowledge] getPinnedKnowledge error:', error)
      return []
    }

    return (data ?? []).map((row: SearchKnowledgeResult) =>
      transformKnowledgeNode({
        ...row,
        similarity: 1.0,
      })
    )
  } catch (error) {
    console.error('[Knowledge] getPinnedKnowledge error:', error)
    return []
  }
}

// =============================================================================
// Context Formatting (for prompt injection)
// =============================================================================

/**
 * Format knowledge nodes for prompt injection.
 * Groups by classification and formats as context.
 */
export const formatKnowledgeForPrompt = (nodes: KnowledgeNode[]): string => {
  if (nodes.length === 0) return ''

  // Group by primary classification (first in array)
  const grouped: Record<string, KnowledgeNode[]> = {}
  for (const node of nodes) {
    const primary = node.classifications[0] ?? 'other'
    if (!grouped[primary]) grouped[primary] = []
    grouped[primary].push(node)
  }

  let context = '## Relevant Knowledge\n\n'

  // Order by classification importance
  const classOrder = ['insight', 'decision', 'fact', 'preference', 'procedure', 'entity', 'other']
  const sortedKeys = Object.keys(grouped).sort(
    (a, b) => classOrder.indexOf(a) - classOrder.indexOf(b)
  )

  for (const key of sortedKeys) {
    const items = grouped[key]
    const label = key.charAt(0).toUpperCase() + key.slice(1) + 's'
    context += `### ${label}\n`

    // Sort by importance within each group
    const sorted = items.sort((a, b) => b.importance - a.importance)
    for (const item of sorted) {
      const pin = item.isPinned ? ' [pinned]' : ''
      context += `- ${item.content}${pin}\n`
    }
    context += '\n'
  }

  return context
}

// =============================================================================
// Keyword Grep (Exact Match Search)
// =============================================================================

export interface GrepOptions {
  /** Search scope. Default: 'all' */
  scope?: 'personal' | 'community' | 'all'
  /** Case sensitive match. Default: false */
  caseSensitive?: boolean
  /** Maximum results. Default: 20 */
  limit?: number
  /** Filter by voyage slug */
  voyageSlug?: string
}

export interface GrepResult extends Omit<KnowledgeNode, 'similarity'> {
  /** Highlighted excerpt showing match context */
  highlight: string
  /** Match position in content */
  matchStart: number
}

/**
 * Exact keyword/phrase search across knowledge.
 * Use for precise matching when you know the exact terms.
 * Returns matches with surrounding context.
 *
 * @param userId - The user's ID (for personal knowledge scope)
 * @param pattern - Exact phrase or keyword to find
 * @param options - Search options
 * @returns Array of matching nodes with highlights
 */
export const keywordGrep = async (
  userId: string,
  pattern: string,
  options: GrepOptions = {}
): Promise<GrepResult[]> => {
  const {
    scope = 'all',
    caseSensitive = false,
    limit = 20,
    voyageSlug,
  } = options

  if (!pattern.trim()) {
    return []
  }

  try {
    console.log(
      `[Knowledge] Grep: "${pattern}" scope: ${scope}, case: ${caseSensitive}, limit: ${limit}`
    )

    const supabase = getClient()

    // Build the query - using ILIKE for case-insensitive, LIKE for case-sensitive
    const operator = caseSensitive ? 'like' : 'ilike'
    const searchPattern = `%${pattern}%`

    
    let query = (supabase as any)
      .from('knowledge_current')
      .select('*')
      .filter('content', operator, searchPattern)
      .eq('is_active', true)

    // Apply scope filters
    if (scope === 'personal') {
      query = query.eq('user_id', userId).is('voyage_slug', null)
    } else if (scope === 'community' && voyageSlug) {
      query = query.eq('voyage_slug', voyageSlug)
    } else if (voyageSlug) {
      // 'all' with voyage context: include both personal and voyage
      query = query.or(`user_id.eq.${userId},voyage_slug.eq.${voyageSlug}`)
    } else {
      // 'all' without voyage: just personal
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query
      .order('importance', { ascending: false })
      .order('source_created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Knowledge] Grep error:', error)
      return []
    }

    const results = (data ?? []) as SearchKnowledgeResult[]

    console.log(`[Knowledge] Grep found ${results.length} matches`)

    // Transform results and add highlights
    return results.map((row) => {
      const content = row.content
      const lowerContent = caseSensitive ? content : content.toLowerCase()
      const lowerPattern = caseSensitive ? pattern : pattern.toLowerCase()
      const matchStart = lowerContent.indexOf(lowerPattern)

      // Create highlight with context (50 chars before/after)
      const start = Math.max(0, matchStart - 50)
      const end = Math.min(content.length, matchStart + pattern.length + 50)
      let highlight = content.slice(start, end)
      if (start > 0) highlight = '...' + highlight
      if (end < content.length) highlight = highlight + '...'

      return {
        eventId: row.event_id,
        content: row.content,
        classifications: row.classifications ?? [],
        entities: row.entities ?? [],
        topics: row.topics ?? [],
        isActive: row.is_active,
        isPinned: row.is_pinned,
        importance: row.importance,
        connectedTo: row.connected_to ?? [],
        createdAt: new Date(row.source_created_at),
        highlight,
        matchStart,
      }
    })
  } catch (error) {
    console.error('[Knowledge] keywordGrep error:', error)
    return []
  }
}

// =============================================================================
// Exports
// =============================================================================

export type { Classification }
