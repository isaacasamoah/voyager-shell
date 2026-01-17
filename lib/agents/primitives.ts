// Agent Primitives
// Declarative agent definitions for Voyager
//
// This is the single source of truth for agent configurations.
// Prompts extracted here can be imported by implementation files.

import type { ModelRequirements } from '@/lib/models/router'

// =============================================================================
// Types
// =============================================================================

export interface AgentDefinition {
  id: string
  name: string
  description: string
  model: ModelRequirements
  tools: string[]
  systemPrompt: string | ((ctx: AgentContext) => string | Promise<string>)
  maxTokens?: number
  timeout?: number
  type: 'conversational' | 'decision' | 'background'
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
 */
export const HOW_STRATEGY_PROMPT = `You are a retrieval specialist. Generate JavaScript code to deeply search knowledge for the user's query.

Available functions:
- semanticSearch(query, { limit?, threshold? }) - Returns nodes with: eventId, content, similarity
- keywordGrep(pattern, { caseSensitive?, limit? }) - Returns nodes with: eventId, content
- getConnected(nodeId) - Follow graph edges. IMPORTANT: Pass node.eventId (not node.id)
- searchByTime(since, { until?, query?, limit? }) - Temporal queries ("last week", "yesterday")
- getNodes(ids) - Fetch nodes by ID array
- dedupe(nodes) - Remove duplicates by eventId

Node properties: { eventId, content, similarity?, isPinned?, connectedTo? }
Use node.eventId when calling getConnected, not node.id.

Strategy chains:
- semantic → getConnected → keywordGrep (concept → context → precision)
- searchByTime → semantic (when → what)

Return: { findings: [...nodes], confidence: 0-1, summary?: "brief explanation" }

Write clean, async JavaScript. Focus on effectiveness.`

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
 */
export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  /**
   * Main Voyager conversational agent.
   * Uses pre-fetched context, no retrieval tools.
   */
  voyager: {
    id: 'voyager',
    name: 'Voyager',
    description: 'Main conversational agent with pre-fetched context',
    model: {
      task: 'chat',
      quality: 'balanced',
      streaming: true,
      toolUse: false,
    },
    tools: [], // Primary Voyager has NO tools - forces use of pre-fetched context
    systemPrompt: 'core', // Uses CORE_PROMPT from lib/prompts/core.ts
    type: 'conversational',
  },

  /**
   * IF Decision agent - fast decision on retrieval need.
   * Gemini Flash for speed and cost.
   */
  ifDecision: {
    id: 'if-decision',
    name: 'IF Decision',
    description: 'Fast decision on whether deep retrieval is needed',
    model: {
      task: 'decision',
      quality: 'fast',
      maxLatencyMs: 500,
    },
    tools: [],
    systemPrompt: IF_DECISION_PROMPT,
    maxTokens: 100,
    type: 'decision',
  },

  /**
   * HOW Strategy agent - generates retrieval code.
   * Claude Sonnet for reasoning capability.
   */
  howStrategy: {
    id: 'how-strategy',
    name: 'HOW Strategy',
    description: 'Generates retrieval strategy as executable code',
    model: {
      task: 'synthesis',
      quality: 'balanced',
    },
    tools: [],
    systemPrompt: HOW_STRATEGY_PROMPT,
    type: 'decision',
  },

  /**
   * Background executor - runs retrieval strategies.
   * Has access to all retrieval tools.
   */
  backgroundExecutor: {
    id: 'background-executor',
    name: 'Background Executor',
    description: 'Executes retrieval strategies with tool access',
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
    ],
    systemPrompt: '', // Executor runs generated code, no system prompt needed
    type: 'background',
  },

  /**
   * Synthesis agent - writes conversational follow-ups.
   * Same voice as Voyager, summarizes findings.
   */
  synthesis: {
    id: 'synthesis',
    name: 'Synthesis',
    description: 'Synthesizes findings into conversational follow-up',
    model: {
      task: 'synthesis',
      quality: 'balanced',
    },
    tools: [],
    systemPrompt: SYNTHESIS_PROMPT,
    type: 'decision',
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
