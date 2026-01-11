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

// =============================================================================
// Tool Context (passed to tool executors)
// =============================================================================

export interface ToolContext {
  userId: string
  voyageSlug?: string
}

// =============================================================================
// Result Formatters
// =============================================================================

const formatKnowledgeResult = (nodes: KnowledgeNode[]): string => {
  if (nodes.length === 0) {
    return 'No results found.'
  }

  return nodes
    .map((node, i) => {
      const pinned = node.isPinned ? ' [PINNED]' : ''
      const similarity = node.similarity ? ` (relevance: ${(node.similarity * 100).toFixed(0)}%)` : ''
      return `[${i + 1}]${pinned}${similarity} ${node.content}`
    })
    .join('\n\n')
}

const formatGrepResult = (results: GrepResult[]): string => {
  if (results.length === 0) {
    return 'No exact matches found.'
  }

  return results
    .map((r, i) => {
      const pinned = r.isPinned ? ' [PINNED]' : ''
      return `[${i + 1}]${pinned} ...${r.highlight}...`
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
  nodeId: z.string().describe('The event ID of the node to explore from'),
})

const getNodesSchema = z.object({
  nodeIds: z.array(z.string()).describe('Array of event IDs to retrieve'),
})

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
Strategy tip: Start here, then use keyword_grep for pinpoint accuracy.`,
    inputSchema: semanticSearchSchema,
    execute: async (input) => {
      const { query, limit, threshold } = input
      const results = await searchKnowledge(ctx.userId, query, {
        threshold,
        limit: Math.min(limit, 20),
        voyageSlug: ctx.voyageSlug,
      })
      return formatKnowledgeResult(results)
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
Strategy tip: Use after finding a topic cluster to discover related decisions, facts, entities.`,
    inputSchema: getConnectedSchema,
    execute: async (input) => {
      const { nodeId } = input
      const results = await getConnectedKnowledge(nodeId)
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
})

// =============================================================================
// Tool Types (for use in chat route)
// =============================================================================

export type RetrievalTools = ReturnType<typeof createRetrievalTools>
