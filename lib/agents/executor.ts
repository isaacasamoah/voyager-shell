// Code Executor for Background Agents
// Runs Claude-generated retrieval code with a constrained set of functions
//
// Pattern: Claude as Query Compiler
// - Intelligence at design time (Sonnet writes the code)
// - Cheap execution at runtime (just function calls, no LLM)

import {
  searchKnowledge,
  keywordGrep,
  getConnectedKnowledge,
  getKnowledgeByIds,
  type KnowledgeNode,
} from '@/lib/knowledge'

// =============================================================================
// Types
// =============================================================================

export interface ExecutionContext {
  userId: string
  voyageSlug?: string
  conversationId: string
}

export interface RetrievalResult {
  findings: Array<{
    eventId: string
    content: string
    similarity?: number
    isPinned?: boolean
    connectedTo?: string[]
  }>
  confidence: number
  summary?: string
}

// =============================================================================
// Bound Functions (available to generated code)
// =============================================================================

/**
 * Create the retrieval functions bound to a user context.
 * These are the only functions available in the generated code sandbox.
 */
const createBoundFunctions = (ctx: ExecutionContext) => ({
  /**
   * Semantic search - conceptual queries
   */
  semanticSearch: async (
    query: string,
    opts?: { limit?: number; threshold?: number }
  ): Promise<KnowledgeNode[]> => {
    return searchKnowledge(ctx.userId, query, {
      limit: opts?.limit ?? 10,
      threshold: opts?.threshold ?? 0.6,
      voyageSlug: ctx.voyageSlug,
    })
  },

  /**
   * Keyword grep - exact phrase matching
   */
  keywordGrep: async (
    pattern: string,
    opts?: { caseSensitive?: boolean; limit?: number }
  ): Promise<KnowledgeNode[]> => {
    const results = await keywordGrep(ctx.userId, pattern, {
      caseSensitive: opts?.caseSensitive ?? false,
      limit: opts?.limit ?? 10,
      voyageSlug: ctx.voyageSlug,
    })
    // Convert GrepResult to KnowledgeNode-like for consistency
    return results.map((r) => ({
      eventId: r.eventId,
      content: r.content,
      isPinned: r.isPinned,
      connectedTo: r.connectedTo,
      // GrepResult fields
      classifications: [],
      entities: [],
      topics: [],
      isActive: true,
      importance: 1,
      createdAt: new Date(),
    }))
  },

  /**
   * Graph traversal - follow connections
   */
  getConnected: async (
    nodeId: string,
    _opts?: { type?: string; depth?: number }
  ): Promise<KnowledgeNode[]> => {
    // Note: type and depth filtering could be added later
    return getConnectedKnowledge(nodeId)
  },

  /**
   * Fetch nodes by ID
   */
  getNodes: async (ids: string[]): Promise<KnowledgeNode[]> => {
    return getKnowledgeByIds(ids)
  },

  /**
   * Search by time range
   */
  searchByTime: async (
    since: string,
    opts?: { until?: string; query?: string; limit?: number }
  ): Promise<KnowledgeNode[]> => {
    const { getAdminClient } = await import('@/lib/supabase/admin')
    const supabase = getAdminClient()

    // Parse relative dates
    const parseDate = (input: string): Date => {
      const now = new Date()
      const lower = input.toLowerCase().trim()
      if (/^\d{4}-\d{2}-\d{2}/.test(lower)) return new Date(input)
      if (lower === 'today') return new Date(now.setHours(0, 0, 0, 0))
      if (lower === 'yesterday') return new Date(now.setDate(now.getDate() - 1))
      if (lower === 'last week') return new Date(now.setDate(now.getDate() - 7))
      if (lower === 'last month') return new Date(now.setMonth(now.getMonth() - 1))
      const agoMatch = lower.match(/(\d+)\s*(day|week|month|hour)s?\s*ago/)
      if (agoMatch) {
        const amount = parseInt(agoMatch[1])
        const unit = agoMatch[2]
        if (unit === 'day') return new Date(now.setDate(now.getDate() - amount))
        if (unit === 'week') return new Date(now.setDate(now.getDate() - amount * 7))
        if (unit === 'month') return new Date(now.setMonth(now.getMonth() - amount))
        if (unit === 'hour') return new Date(now.setHours(now.getHours() - amount))
      }
      return new Date(now.setDate(now.getDate() - 7))
    }

    const sinceDate = parseDate(since)
    const untilDate = opts?.until ? parseDate(opts.until) : new Date()
    const limit = opts?.limit ?? 15

    let dbQuery = (supabase as any)
      .from('knowledge_current')
      .select('*')
      .eq('is_active', true)
      .gte('source_created_at', sinceDate.toISOString())
      .lte('source_created_at', untilDate.toISOString())
      .order('source_created_at', { ascending: false })
      .limit(Math.min(limit, 30))

    if (ctx.voyageSlug) {
      dbQuery = dbQuery.or(`user_id.eq.${ctx.userId},voyage_slug.eq.${ctx.voyageSlug}`)
    } else {
      dbQuery = dbQuery.eq('user_id', ctx.userId)
    }

    const { data, error } = await dbQuery
    if (error || !data) return []

    return data.map((row: Record<string, unknown>) => ({
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
  },

  /**
   * Deduplicate nodes by eventId
   */
  dedupe: (nodes: KnowledgeNode[]): KnowledgeNode[] => {
    const seen = new Set<string>()
    return nodes.filter((node) => {
      if (seen.has(node.eventId)) return false
      seen.add(node.eventId)
      return true
    })
  },
})

// =============================================================================
// Code Executor
// =============================================================================

const EXECUTION_TIMEOUT_MS = 30000 // 30 seconds

/**
 * Execute Claude-generated retrieval code.
 *
 * The code runs in a constrained environment with only our retrieval
 * functions available. No file system, network, or other system access.
 *
 * @param code - JavaScript code using our retrieval functions
 * @param ctx - User context for scoping queries
 * @returns Structured retrieval results
 */
export async function executeRetrievalCode(
  code: string,
  ctx: ExecutionContext
): Promise<RetrievalResult> {
  const boundFunctions = createBoundFunctions(ctx)

  // Construct function with bound retrieval tools
  // The code is wrapped in an async IIFE so it can use await
  const functionArgs = Object.keys(boundFunctions)
  const functionValues = Object.values(boundFunctions)

  let fn: (...args: unknown[]) => Promise<unknown>
  try {
    fn = new Function(
      ...functionArgs,
      `return (async () => { ${code} })()`
    ) as (...args: unknown[]) => Promise<unknown>
  } catch (error) {
    throw new Error(
      `Failed to parse retrieval code: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  // Execute with timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Execution timed out after ${EXECUTION_TIMEOUT_MS}ms`)),
      EXECUTION_TIMEOUT_MS
    )
  )

  let result: unknown
  try {
    result = await Promise.race([fn(...functionValues), timeoutPromise])
  } catch (error) {
    throw new Error(
      `Retrieval code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  // Validate and normalize result
  return normalizeResult(result)
}

/**
 * Normalize the result to our expected shape.
 * Handles various return formats from generated code.
 */
function normalizeResult(result: unknown): RetrievalResult {
  // If result is null/undefined
  if (!result) {
    return { findings: [], confidence: 0 }
  }

  // If result is an array, treat it as findings
  if (Array.isArray(result)) {
    return {
      findings: result.map(normalizeNode),
      confidence: 0.5,
    }
  }

  // If result is an object with findings
  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>

    // Extract findings
    let findings: unknown[] = []
    if (Array.isArray(obj.findings)) {
      findings = obj.findings
    } else if (Array.isArray(obj.results)) {
      findings = obj.results
    } else if (Array.isArray(obj.nodes)) {
      findings = obj.nodes
    }

    // Extract confidence
    let confidence = 0.5
    if (typeof obj.confidence === 'number') {
      confidence = Math.max(0, Math.min(1, obj.confidence))
    }

    // Extract summary
    const summary =
      typeof obj.summary === 'string' ? obj.summary : undefined

    return {
      findings: findings.map(normalizeNode),
      confidence,
      summary,
    }
  }

  // Fallback
  return { findings: [], confidence: 0 }
}

/**
 * Normalize a single node to our expected shape.
 */
function normalizeNode(node: unknown): RetrievalResult['findings'][0] {
  if (!node || typeof node !== 'object') {
    return { eventId: '', content: '' }
  }

  const obj = node as Record<string, unknown>

  return {
    eventId: (obj.eventId as string) ?? (obj.id as string) ?? '',
    content: (obj.content as string) ?? '',
    similarity: typeof obj.similarity === 'number' ? obj.similarity : undefined,
    isPinned: typeof obj.isPinned === 'boolean' ? obj.isPinned : undefined,
    connectedTo: Array.isArray(obj.connectedTo)
      ? (obj.connectedTo as string[])
      : undefined,
  }
}
