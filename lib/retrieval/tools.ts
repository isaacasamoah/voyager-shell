// Retrieval Tools for Agentic Search
// Voyager decides how to retrieve - not a fixed pipeline, intelligence
//
// Philosophy: Chain strategies for pinpoint accuracy
// semantic_search → found topic → get_connected → keyword_grep
//
// These tools are executed by Claude during response generation
// using Vercel AI SDK's tool calling capability.

import { tool } from 'ai'
import { z } from 'zod'
import {
  searchKnowledge,
  keywordGrep,
  getConnectedKnowledge,
  getKnowledgeByIds,
  type KnowledgeNode,
  type GrepResult,
} from '@/lib/knowledge'
import { getAdminClient } from '@/lib/supabase/admin'
import { enqueueAgentTask, completeTask, failTask } from '@/lib/agents/queue'
import { executeRetrievalCode } from '@/lib/agents/executor'

// Resolve short ID (8 chars) to full UUID
const resolveNodeId = async (shortOrFullId: string): Promise<string | null> => {
  // If it's already a full UUID (36 chars with dashes), return as-is
  if (shortOrFullId.length === 36 && shortOrFullId.includes('-')) {
    return shortOrFullId
  }

  // Otherwise, look up by prefix
  const supabase = getAdminClient()
  
  const { data } = await (supabase as any)
    .from('knowledge_current')
    .select('event_id')
    .ilike('event_id', `${shortOrFullId}%`)
    .limit(1)
    .single()

  return (data as { event_id: string } | null)?.event_id ?? null
}

// =============================================================================
// Tool Context (passed to tool executors)
// =============================================================================

export interface ToolContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
  /** Vercel waitUntil for background execution without blocking response */
  waitUntil?: (promise: Promise<unknown>) => void
}

// =============================================================================
// Result Formatters
// =============================================================================

const formatKnowledgeResult = (nodes: KnowledgeNode[]): string => {
  if (nodes.length === 0) {
    return 'No results found. NOW RESPOND TO THE USER - tell them what you searched for and that you found nothing relevant. Do not call more tools without responding first.'
  }

  return nodes
    .map((node, i) => {
      const shortId = node.eventId.slice(0, 8) // Short ID for readability
      const pinned = node.isPinned ? ' [PINNED]' : ''
      const similarity = node.similarity ? ` (${(node.similarity * 100).toFixed(0)}%)` : ''
      const connected = node.connectedTo?.length ? ` [${node.connectedTo.length} connections]` : ''
      return `[${i + 1}] id:${shortId}${pinned}${similarity}${connected}\n${node.content}`
    })
    .join('\n\n')
}

const formatGrepResult = (results: GrepResult[]): string => {
  if (results.length === 0) {
    return 'No exact matches found. NOW RESPOND TO THE USER with what you have so far.'
  }

  return results
    .map((r, i) => {
      const shortId = r.eventId.slice(0, 8)
      const pinned = r.isPinned ? ' [PINNED]' : ''
      const connected = r.connectedTo?.length ? ` [${r.connectedTo.length} connections]` : ''
      return `[${i + 1}] id:${shortId}${pinned}${connected}\n...${r.highlight}...`
    })
    .join('\n\n')
}

// =============================================================================
// Input Schemas (Zod)
// =============================================================================

const semanticSearchSchema = z.object({
  query: z.string().describe('The semantic search query'),
  limit: z.number().optional().default(10).describe('Max results (1-20)'),
  threshold: z.number().optional().default(0.6).describe('Min similarity (0-1)'),
})

const keywordGrepSchema = z.object({
  pattern: z.string().describe('Exact phrase or keyword to find'),
  caseSensitive: z.boolean().optional().default(false),
  limit: z.number().optional().default(10).describe('Max results'),
})

const getConnectedSchema = z.object({
  nodeId: z.string().describe('The event ID (or first 8 chars) from search results, e.g. "abc12345"'),
})

const getNodesSchema = z.object({
  nodeIds: z.array(z.string()).describe('Array of event IDs to retrieve'),
})

const searchByTimeSchema = z.object({
  since: z.string().describe('Start date: ISO string (2024-01-15) or relative (yesterday, last week, 3 days ago)'),
  until: z.string().optional().describe('End date: ISO string or relative. Defaults to now.'),
  query: z.string().optional().describe('Optional semantic query to filter results'),
  limit: z.number().optional().default(15).describe('Max results'),
})

const spawnBackgroundAgentSchema = z.object({
  task: z.string().describe('Human description of what to find'),
  code: z.string().describe('JavaScript code using retrieval functions'),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
})

// =============================================================================
// Time Parsing Helper
// =============================================================================

const parseRelativeDate = (input: string): Date => {
  const now = new Date()
  const lower = input.toLowerCase().trim()

  // Check for ISO date format first
  if (/^\d{4}-\d{2}-\d{2}/.test(lower)) {
    return new Date(input)
  }

  // Relative date parsing
  if (lower === 'today') return new Date(now.setHours(0, 0, 0, 0))
  if (lower === 'yesterday') return new Date(now.setDate(now.getDate() - 1))
  if (lower === 'last week') return new Date(now.setDate(now.getDate() - 7))
  if (lower === 'last month') return new Date(now.setMonth(now.getMonth() - 1))

  // Parse "X days/weeks ago"
  const agoMatch = lower.match(/(\d+)\s*(day|week|month|hour)s?\s*ago/)
  if (agoMatch) {
    const amount = parseInt(agoMatch[1])
    const unit = agoMatch[2]
    if (unit === 'day') return new Date(now.setDate(now.getDate() - amount))
    if (unit === 'week') return new Date(now.setDate(now.getDate() - amount * 7))
    if (unit === 'month') return new Date(now.setMonth(now.getMonth() - amount))
    if (unit === 'hour') return new Date(now.setHours(now.getHours() - amount))
  }

  // Default to 7 days ago if parsing fails
  return new Date(now.setDate(now.getDate() - 7))
}

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Creates the retrieval tools bound to a specific context.
 * Call this in the chat route to get executable tools for the request.
 */
export const createRetrievalTools = (ctx: ToolContext) => ({
  /**
   * Semantic search across knowledge.
   * Use for conceptual queries when you don't know exact terms.
   * Returns results ranked by relevance.
   */
  semantic_search: tool({
    description: `Search knowledge by semantic similarity.
Use when: The query is conceptual or you don't know exact terms.
Returns: Results ranked by relevance with similarity scores.
IMPORTANT: After this search, respond to the user immediately with what you found. If you need deeper search, include spawn_background_agent in the SAME response as your text.`,
    inputSchema: semanticSearchSchema,
    execute: async (input) => {
      const { query, limit, threshold } = input
      const results = await searchKnowledge(ctx.userId, query, {
        threshold,
        limit: Math.min(limit, 20),
        voyageSlug: ctx.voyageSlug,
      })
      const formatted = formatKnowledgeResult(results)
      return `${formatted}\n\n---\nYou have search results. NOW RESPOND TO THE USER with a summary. If you want deeper search, output your text response AND spawn_background_agent together.`
    },
  }),

  /**
   * Exact keyword/phrase search.
   * Use for pinpoint accuracy when you know the exact terms.
   * Returns matches with highlighted context.
   */
  keyword_grep: tool({
    description: `Exact keyword/phrase search across knowledge.
Use when: You know the exact term, name, or phrase to find.
Returns: Matches with highlighted context around the match.
Strategy tip: Use after semantic_search to find specific quotes or terms.`,
    inputSchema: keywordGrepSchema,
    execute: async (input) => {
      const { pattern, caseSensitive, limit } = input
      const results = await keywordGrep(ctx.userId, pattern, {
        caseSensitive,
        limit: Math.min(limit, 20),
        voyageSlug: ctx.voyageSlug,
      })
      return formatGrepResult(results)
    },
  }),

  /**
   * Follow knowledge graph edges.
   * Use to explore connected knowledge from a starting point.
   * Returns nodes connected to the given node.
   */
  get_connected: tool({
    description: `Get knowledge connected to a specific node.
Use when: You found a relevant node and want to explore related knowledge.
Returns: Nodes connected via graph edges (supports, contradicts, supersedes, etc).
Strategy tip: Use after finding a topic cluster to discover related decisions, facts, entities.
Note: Use the short ID from search results (e.g. "abc12345").`,
    inputSchema: getConnectedSchema,
    execute: async (input) => {
      const { nodeId } = input
      const fullId = await resolveNodeId(nodeId)
      if (!fullId) {
        return `No node found matching ID "${nodeId}"`
      }
      const results = await getConnectedKnowledge(fullId)
      if (results.length === 0) {
        return `Node ${nodeId} has no connections yet.`
      }
      return formatKnowledgeResult(results)
    },
  }),

  /**
   * Get specific knowledge by IDs.
   * Use when you have node IDs from previous searches.
   */
  get_nodes: tool({
    description: `Retrieve specific knowledge nodes by their IDs.
Use when: You have event IDs from a previous result and need full content.
Returns: Full node details for the requested IDs.`,
    inputSchema: getNodesSchema,
    execute: async (input) => {
      const { nodeIds } = input
      const results = await getKnowledgeByIds(nodeIds)
      return formatKnowledgeResult(results)
    },
  }),

  /**
   * Search by time range.
   * Use for temporal queries like "what did we discuss last week?"
   */
  search_by_time: tool({
    description: `Search knowledge within a time range.
Use when: The user asks about recent discussions, or "last week", "yesterday", etc.
Returns: Knowledge from the specified time period, newest first.
Supports: ISO dates (2024-01-15) or relative (yesterday, last week, 3 days ago).`,
    inputSchema: searchByTimeSchema,
    execute: async (input) => {
      const { since, until, query, limit } = input
      const sinceDate = parseRelativeDate(since)
      const untilDate = until ? parseRelativeDate(until) : new Date()

      const supabase = getAdminClient()

      
      let dbQuery = (supabase as any)
        .from('knowledge_current')
        .select('*')
        .eq('is_active', true)
        .gte('source_created_at', sinceDate.toISOString())
        .lte('source_created_at', untilDate.toISOString())
        .order('source_created_at', { ascending: false })
        .limit(Math.min(limit, 30))

      // Scope to user/voyage
      if (ctx.voyageSlug) {
        dbQuery = dbQuery.or(`user_id.eq.${ctx.userId},voyage_slug.eq.${ctx.voyageSlug}`)
      } else {
        dbQuery = dbQuery.eq('user_id', ctx.userId)
      }

      const { data, error } = await dbQuery

      if (error) {
        return `Error searching by time: ${error.message}`
      }

      if (!data || data.length === 0) {
        return `No knowledge found between ${sinceDate.toLocaleDateString()} and ${untilDate.toLocaleDateString()}.`
      }

      // Transform to KnowledgeNode format
      const results: KnowledgeNode[] = data.map((row: Record<string, unknown>) => ({
        eventId: row.event_id as string,
        content: row.content as string,
        classifications: (row.classifications as string[]) ?? [],
        entities: (row.entities as string[]) ?? [],
        topics: (row.topics as string[]) ?? [],
        isActive: row.is_active as boolean,
        isPinned: row.is_pinned as boolean,
        importance: row.importance as number,
        connectedTo: (row.connected_to as string[]) ?? [],
        createdAt: new Date(row.source_created_at as string),
      }))

      // If query provided, could filter semantically here (future enhancement)
      const header = `Found ${results.length} items from ${sinceDate.toLocaleDateString()} to ${untilDate.toLocaleDateString()}:\n\n`
      return header + formatKnowledgeResult(results)
    },
  }),

  /**
   * Spawn a background agent for deeper retrieval.
   * Use when immediate results aren't enough and deeper exploration would help.
   * Write custom JavaScript code to chain retrieval functions.
   * Results surface via realtime when ready.
   */
  spawn_background_agent: tool({
    description: `Spawn background retrieval with custom code.
Write JavaScript that uses our retrieval functions to find comprehensive information.
The code runs async in background. Results surface via realtime when ready.

Available functions:
- semanticSearch(query, { limit?, threshold? }) - Conceptual search
- keywordGrep(pattern, { caseSensitive?, limit? }) - Exact phrase match
- getConnected(nodeId, { type?, depth? }) - Graph traversal
- searchByTime(timeframe, { query? }) - Temporal search
- getNodes(ids) - Fetch by ID
- dedupe(nodes) - Remove duplicates

Strategy pattern:
1. Start broad (semanticSearch)
2. Follow leads (getConnected)
3. Pinpoint (keywordGrep)
4. Return { findings: [...], confidence: 0-1 }

Use when:
- User asks about history/decisions that might have more context
- Topic spans multiple conversations or time periods
- You found something but suspect there's more

Example code:
const broad = await semanticSearch("pricing", { limit: 20 });
const decisions = await Promise.all(
  broad.slice(0, 3).map(n => getConnected(n.id, { type: "decision" }))
);
const exact = await keywordGrep("$79");
return { findings: dedupe([...broad, ...decisions.flat(), ...exact]), confidence: 0.85 };`,
    inputSchema: spawnBackgroundAgentSchema,
    execute: async (input) => {
      const { task, code, priority } = input

      // Validate we have a conversation context
      if (!ctx.conversationId) {
        return 'Cannot spawn background agent: no conversation context'
      }

      try {
        // Enqueue task (for audit trail + cron fallback)
        const taskId = await enqueueAgentTask({
          task,
          code,
          priority: priority ?? 'normal',
          userId: ctx.userId,
          voyageSlug: ctx.voyageSlug,
          conversationId: ctx.conversationId,
        })

        // Execute immediately via waitUntil (non-blocking)
        // Results surface via Realtime in ~1-2 seconds
        if (ctx.waitUntil) {
          const executeTask = async () => {
            const startTime = Date.now()
            try {
              const result = await executeRetrievalCode(code, {
                userId: ctx.userId,
                voyageSlug: ctx.voyageSlug,
                conversationId: ctx.conversationId!,
              })
              await completeTask(taskId, result, Date.now() - startTime)
              console.log(`[spawn_background_agent] Task ${taskId.slice(0, 8)} completed: ${result.findings.length} findings`)
            } catch (error) {
              await failTask(taskId, error instanceof Error ? error.message : 'Unknown error')
              console.error(`[spawn_background_agent] Task ${taskId.slice(0, 8)} failed:`, error)
            }
          }
          ctx.waitUntil(executeTask())
        }

        return `Background agent spawned (${taskId.slice(0, 8)}). Now respond to the user with what you found so far.`
      } catch (error) {
        console.error('[spawn_background_agent] Failed to enqueue:', error)
        return `Failed to spawn background agent: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
  }),
})

// =============================================================================
// Tool Types (for use in chat route)
// =============================================================================

export type RetrievalTools = ReturnType<typeof createRetrievalTools>
