// Agent Primitives
// Declarative agent definitions for Voyager
//
// This is the single source of truth for agent configurations.
// Prompts extracted here can be imported by implementation files.

import type { ModelRequirements } from '@/lib/models/router'
import { generateHowStrategyPrompt } from './retrieval-tools'

// =============================================================================
// Types
// =============================================================================

/**
 * Agent type taxonomy:
 * - primary: Owns conversation, talks to user (Voyager)
 * - background: Heavy lifting, reports to primary via realtime (Retrieval)
 * - event: Triggered by system events, no user interaction (Curator)
 * - scheduled: Runs on cron, no user interaction (Quartermaster)
 */
export type AgentType = 'primary' | 'background' | 'event' | 'scheduled'

/**
 * Event trigger for event-driven agents.
 */
export interface EventTrigger {
  event: 'knowledge.created' | 'knowledge.updated' | 'conversation.ended'
  filter?: Record<string, unknown>
}

export interface AgentDefinition {
  id: string
  name: string
  description: string
  type: AgentType
  model: ModelRequirements
  tools: string[]
  systemPrompt: string | ((ctx: AgentContext) => string | Promise<string>)
  maxTokens?: number
  timeout?: number
  // Primary agent properties
  canSpawn?: string[]           // Agent IDs this agent can spawn (primary only)
  // Background agent properties
  reportsTo?: string            // Parent agent ID (background only)
  tokenBudget?: number          // Max tokens for this agent's work
  // Event agent properties
  trigger?: EventTrigger        // What triggers this agent (event only)
  // Scheduled agent properties
  schedule?: string             // Cron expression (scheduled only)
}

export interface AgentContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
  previousMessages?: Array<{ role: string; content: string }>
  additionalContext?: Record<string, unknown>
}

// =============================================================================
// Extracted Prompts
// =============================================================================

/**
 * IF Decision prompt - Gemini Flash decides if deep retrieval is needed.
 * Fast and cheap. Conservative: only YES when deeper search adds value.
 */
export const IF_DECISION_PROMPT = `You decide if a query needs deep retrieval beyond what was already pre-fetched.

Say NO for:
- Greetings, acknowledgments, simple thank yous
- Questions where pre-retrieval found strong matches (similarity > 0.75)
- Follow-up questions about information already in the conversation
- Simple factual questions already answered in context

Say YES for:
- Complex queries spanning multiple topics or time periods
- Requests for comprehensive summaries or overviews
- Questions about history, timelines, or changes over time
- When pre-retrieval found weak or no matches
- Explicit requests to "find more" or "search deeper"

Be conservative. Only say YES when deeper search would actually add value.`

/**
 * HOW Strategy prompt - Claude generates retrieval code.
 * The "Claude as Query Compiler" pattern.
 *
 * Now dynamically generated from structured tool definitions.
 * See lib/agents/retrieval-tools.ts for tool definitions and patterns.
 */
export const HOW_STRATEGY_PROMPT = generateHowStrategyPrompt()

/**
 * Clustering prompt - Gemini Flash groups findings by theme.
 * Two-stage compression for progressive disclosure.
 */
export const CLUSTERING_PROMPT = `You cluster knowledge findings by theme.

Input format: Each finding is numbered (0, 1, 2...). Use these NUMBERS as findingIds.

Rules:
- Max 5 clusters, minimum 2 findings per cluster
- Each finding belongs to exactly one cluster
- Cluster names: 2-4 words (e.g., "Pricing Decisions", "Technical Architecture")
- If a finding doesn't fit any theme, add its NUMBER to "unclustered"
- Write a 1-sentence summary for each cluster
- Prioritize pinned findings (marked PINNED)

Output JSON only (no markdown, no explanation):
{
  "clusters": [
    { "theme": "Theme Name", "summary": "One sentence about this cluster.", "findingIds": ["0", "1", "5"] }
  ],
  "unclustered": ["3", "7"]
}`

/**
 * Synthesis prompt - Claude writes conversational follow-up.
 * Maintains "same Voyager voice" across fast and deep paths.
 */
export const SYNTHESIS_PROMPT = `You are Voyager, continuing a conversation.
The user asked a question and you already gave an initial response.
Now you have additional context from a deeper search.

Write a brief, natural follow-up (2-4 sentences).
Start with "I found more context..." or "Also relevant..." or "Looking deeper, I found..."
Don't repeat what was likely in the initial response.
Speak conversationally, not as a list.
If the findings add significant new information, highlight it.
If the findings mostly confirm the initial response, say so briefly.`

// =============================================================================
// Agent Registry
// =============================================================================

/**
 * All agent definitions in one place.
 * Implementation files import these to ensure consistency.
 *
 * Agent Type Taxonomy:
 * - primary: Owns conversation (Voyager)
 * - background: Heavy lifting, reports to primary (Retrieval)
 * - event: System-triggered (Curator)
 * - scheduled: Cron-triggered (Quartermaster)
 */
export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  // =========================================================================
  // PRIMARY AGENTS (own the conversation)
  // =========================================================================

  /**
   * Voyager - the primary conversational agent.
   * Has two tools: spawn_background_agent and web_search.
   * Uses pre-fetched context for quick responses.
   */
  voyager: {
    id: 'voyager',
    name: 'Voyager',
    description: 'Primary conversational agent. Owns the relationship with user.',
    type: 'primary',
    model: {
      task: 'chat',
      quality: 'balanced',
      streaming: true,
      toolUse: true,
    },
    tools: ['spawn_background_agent', 'web_search'],
    canSpawn: ['retrieval'],
    systemPrompt: 'core', // Uses CORE_PROMPT from lib/prompts/core.ts
  },

  // =========================================================================
  // BACKGROUND AGENTS (heavy lifting, reports to primary)
  // =========================================================================

  /**
   * Retrieval agent - deep search and synthesis.
   * Spawned by Voyager for comprehensive queries.
   * Reports progress and results via realtime.
   */
  retrieval: {
    id: 'retrieval',
    name: 'Retrieval',
    description: 'Deep search agent for comprehensive queries',
    type: 'background',
    model: {
      task: 'chat',
      quality: 'balanced',
      toolUse: true,
    },
    tools: [
      'semantic_search',
      'keyword_grep',
      'get_connected',
      'get_nodes',
      'search_by_time',
      'web_search',
    ],
    reportsTo: 'voyager',
    tokenBudget: 50000,
    systemPrompt: HOW_STRATEGY_PROMPT,
    timeout: 60000, // 60s for deep work
  },

  // =========================================================================
  // EVENT AGENTS (triggered by system events)
  // =========================================================================

  /**
   * Curator - learns importance from usage.
   * Triggered when knowledge is created.
   * Adjusts importance scores based on citations.
   */
  curator: {
    id: 'curator',
    name: 'Curator',
    description: 'Learns importance from citations and usage patterns',
    type: 'event',
    model: {
      task: 'decision',
      quality: 'fast',
    },
    tools: [],
    trigger: { event: 'knowledge.created' },
    tokenBudget: 5000,
    systemPrompt: `You analyze knowledge events and determine importance.
Look at: citations, recency, user engagement.
Output: importance_score (0-1), decay_rate, tags.`,
  },

  // =========================================================================
  // SCHEDULED AGENTS (cron-triggered)
  // =========================================================================

  /**
   * Quartermaster - nightly maintenance.
   * Runs at 3am daily.
   * Compaction, optimization, cleanup.
   */
  quartermaster: {
    id: 'quartermaster',
    name: 'Quartermaster',
    description: 'Nightly maintenance: compaction, optimization, cleanup',
    type: 'scheduled',
    model: {
      task: 'synthesis',
      quality: 'balanced',
    },
    tools: [],
    schedule: '0 3 * * *', // 3am daily
    tokenBudget: 100000,
    systemPrompt: `You perform nightly maintenance on the knowledge graph.
Tasks: identify stale knowledge, suggest compaction, optimize retrieval.`,
  },

  // =========================================================================
  // HELPER AGENTS (used internally by other agents)
  // =========================================================================

  /**
   * Synthesis agent - writes conversational follow-ups.
   * Used by retrieval to maintain Voyager's voice.
   */
  synthesis: {
    id: 'synthesis',
    name: 'Synthesis',
    description: 'Synthesizes findings into conversational follow-up',
    type: 'background',
    model: {
      task: 'synthesis',
      quality: 'balanced',
    },
    tools: [],
    reportsTo: 'retrieval',
    systemPrompt: SYNTHESIS_PROMPT,
  },
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get an agent definition by ID.
 */
export const getAgent = (id: string): AgentDefinition | undefined => {
  return AGENT_REGISTRY[id]
}

/**
 * Get all agent definitions.
 */
export const getAllAgents = (): AgentDefinition[] => {
  return Object.values(AGENT_REGISTRY)
}

/**
 * Get agents by type.
 */
export const getAgentsByType = (
  type: AgentDefinition['type']
): AgentDefinition[] => {
  return Object.values(AGENT_REGISTRY).filter((a) => a.type === type)
}
