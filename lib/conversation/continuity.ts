// Continuity retrieval for conversation context
// Detect implicit references, retrieve silently

import type { ConversationMessage } from './index'
import { searchKnowledge } from '@/lib/knowledge/search'

export type ReferenceType = 'implicit' | 'temporal' | 'cross-session'

export interface ReferenceSignal {
  type: ReferenceType
  trigger: string      // The phrase that triggered detection
  confidence: number   // 0-1, higher = more certain
}

// Pattern definitions with type annotations
interface PatternDef {
  pattern: RegExp
  type: ReferenceType
}

// Implicit: "that thing", "you know", "like we discussed"
const IMPLICIT_PATTERNS: PatternDef[] = [
  { pattern: /\bthat (thing|issue|topic|discussion|problem|idea)\b/i, type: 'implicit' },
  { pattern: /\bthe (thing|issue|topic|discussion|problem|idea) (we|I)\b/i, type: 'implicit' },
  { pattern: /\blike (we|I) (said|mentioned|discussed|talked about)\b/i, type: 'implicit' },
  { pattern: /\bwhat (we|I) (talked|spoke|chatted) about\b/i, type: 'implicit' },
  { pattern: /\byou (know|remember) (what|the)\b/i, type: 'implicit' },
  { pattern: /\bwhat I (was|am) (saying|talking about)\b/i, type: 'implicit' },
]

// Temporal: "earlier", "before", "previously"
const TEMPORAL_PATTERNS: PatternDef[] = [
  { pattern: /\bearlier (in this|today|we)\b/i, type: 'temporal' },
  { pattern: /\bbefore (when|we|I)\b/i, type: 'temporal' },
  { pattern: /\blast time\b/i, type: 'temporal' },
  { pattern: /\bpreviously\b/i, type: 'temporal' },
  { pattern: /\ba (few|couple) (minutes|messages) ago\b/i, type: 'temporal' },
  { pattern: /\bjust now\b/i, type: 'temporal' },
]

// Cross-session: "remember when", "we discussed last week"
const CROSS_SESSION_PATTERNS: PatternDef[] = [
  { pattern: /\bremember when\b/i, type: 'cross-session' },
  { pattern: /\bwe (talked|discussed|chatted) (about )?(last|yesterday|the other day)\b/i, type: 'cross-session' },
  { pattern: /\bour (conversation|discussion|chat) (about|on|regarding)\b/i, type: 'cross-session' },
  { pattern: /\b(last|previous) (time|session|conversation)\b/i, type: 'cross-session' },
  { pattern: /\byesterday (we|I|you)\b/i, type: 'cross-session' },
  { pattern: /\blast week\b/i, type: 'cross-session' },
]

const ALL_PATTERNS = [...IMPLICIT_PATTERNS, ...TEMPORAL_PATTERNS, ...CROSS_SESSION_PATTERNS]

/**
 * Detect reference signals in a message.
 * Returns signals indicating the user may be referencing old context.
 */
export const detectReferenceSignals = (message: string): ReferenceSignal[] => {
  const signals: ReferenceSignal[] = []

  for (const { pattern, type } of ALL_PATTERNS) {
    const match = message.match(pattern)
    if (match) {
      signals.push({
        type,
        trigger: match[0],
        confidence: getConfidence(type, match[0]),
      })
    }
  }

  return signals
}

/**
 * Determine confidence based on signal type and specificity.
 */
const getConfidence = (type: ReferenceType, trigger: string): number => {
  // Cross-session references are usually intentional
  if (type === 'cross-session') return 0.9

  // Longer, more specific triggers are more confident
  if (trigger.length > 15) return 0.8

  // Base confidence
  return 0.7
}

/**
 * Check if any signals were detected.
 */
export const hasReferenceSignals = (message: string): boolean => {
  return detectReferenceSignals(message).length > 0
}

/**
 * Context for continuity retrieval.
 */
export interface ContinuityContext {
  userId?: string
  voyageSlug?: string
  conversationId: string
}

/**
 * Retrieve context for continuity based on detected signals.
 *
 * Strategy:
 * - Implicit/temporal: Search within truncated messages from current conversation
 * - Cross-session: Search knowledge base for past conversations
 */
export const retrieveForContinuity = async (
  signals: ReferenceSignal[],
  currentMessage: string,
  truncatedMessages: ConversationMessage[],
  context: ContinuityContext
): Promise<string | null> => {
  if (signals.length === 0) return null

  const hasImplicit = signals.some((s) => s.type === 'implicit' || s.type === 'temporal')
  const hasCrossSession = signals.some((s) => s.type === 'cross-session')

  const results: string[] = []

  // Search within truncated messages (dropped from window)
  if (hasImplicit && truncatedMessages.length > 0) {
    const relevant = searchWithinMessages(truncatedMessages, currentMessage)
    if (relevant) {
      results.push(`[Earlier in this conversation]:\n${relevant}`)
    }
  }

  // Search knowledge base for cross-session context
  if (hasCrossSession && context.userId) {
    try {
      const knowledge = await searchKnowledge(context.userId, currentMessage, {
        voyageSlug: context.voyageSlug,
        limit: 3,
        threshold: 0.6, // Slightly lower threshold for conversational context
      })

      if (knowledge.length > 0) {
        const formatted = knowledge
          .map((k) => `- ${k.content.slice(0, 200)}${k.content.length > 200 ? '...' : ''}`)
          .join('\n')
        results.push(`[From previous conversations]:\n${formatted}`)
      }
    } catch (error) {
      console.error('[Continuity] Knowledge search error:', error)
      // Don't fail - just skip cross-session context
    }
  }

  return results.length > 0 ? results.join('\n\n') : null
}

/**
 * Simple semantic search within a set of messages.
 * Uses keyword overlap for now - could upgrade to embeddings.
 */
const searchWithinMessages = (
  messages: ConversationMessage[],
  query: string
): string | null => {
  // Extract keywords from query (simple tokenization)
  const queryWords = new Set(
    query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3) // Skip short words
      .filter((w) => !STOP_WORDS.has(w))
  )

  if (queryWords.size === 0) return null

  // Score each message by keyword overlap
  const scored = messages.map((msg) => {
    const msgWords = new Set(
      msg.content
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    )

    let overlap = 0
    Array.from(queryWords).forEach((word) => {
      if (msgWords.has(word)) overlap++
    })

    return {
      message: msg,
      score: overlap / queryWords.size,
    }
  })

  // Filter to messages with meaningful overlap
  const relevant = scored
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3) // Top 3 most relevant

  if (relevant.length === 0) return null

  // Format as context
  return relevant
    .map((r) => {
      const preview = r.message.content.slice(0, 150)
      const suffix = r.message.content.length > 150 ? '...' : ''
      return `[${r.message.role}]: ${preview}${suffix}`
    })
    .join('\n')
}

// Common stop words to ignore in search
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'dare', 'ought', 'used', 'that', 'this', 'these', 'those', 'what',
  'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  'about', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'again', 'further', 'then', 'once',
])
