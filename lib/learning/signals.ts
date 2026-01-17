// Learning signals for conversation improvement
// Track corrections and re-explanations to measure clarity and continuity

import { getAdminClient } from '@/lib/supabase/admin'

export type SignalType =
  | 'correction'      // "no, I meant..."
  | 're-explanation'  // "like I said earlier..."
  | 'clarification'   // "to clarify..."
  | 'frustration'     // "I already told you..."
  | 'positive'        // Implicit approval (no friction)

export interface LearningSignal {
  type: SignalType
  conversationId: string
  messageId?: string
  userId?: string
  voyageSlug?: string
  context: string      // What triggered the signal (snippet)
  timestamp: Date
}

// Pattern definitions for signal detection
const CORRECTION_PATTERNS = [
  /\bno,?\s*(I|we|that|it)\s*(meant|was|is|should)\b/i,
  /\bthat'?s not (what|right|correct)\b/i,
  /\bI (said|meant|was saying)\b/i,
  /\bactually,?\s*(I|we|it|that)\b/i,
  /\bnot what I (asked|meant|said)\b/i,
  /\bwrong,?\s*(I|we|that|it)\b/i,
]

const RE_EXPLANATION_PATTERNS = [
  /\blike I (said|mentioned|told you)\b/i,
  /\bas I (said|mentioned|explained)\b/i,
  /\bI already (told|said|explained|mentioned)\b/i,
  /\bremember,?\s*(I|we|that)\b/i,
  /\bI (just|literally) (said|told you)\b/i,
  /\bagain,?\s*(I|we|the)\b/i,
]

const CLARIFICATION_PATTERNS = [
  /\bto clarify\b/i,
  /\bwhat I mean is\b/i,
  /\blet me (explain|rephrase|be clear)\b/i,
  /\bin other words\b/i,
  /\bto be (clear|specific)\b/i,
]

const FRUSTRATION_PATTERNS = [
  /\bI already told you\b/i,
  /\bhow many times\b/i,
  /\bI keep (saying|telling|explaining)\b/i,
  /\bare you (listening|paying attention)\b/i,
  /\byou'?re not (listening|understanding)\b/i,
]

/**
 * Detect learning signals in a user message.
 * Returns the signal type if detected, null otherwise.
 */
export const detectLearningSignal = (message: string): SignalType | null => {
  // Check patterns in order of severity
  for (const pattern of FRUSTRATION_PATTERNS) {
    if (pattern.test(message)) return 'frustration'
  }

  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(message)) return 'correction'
  }

  for (const pattern of RE_EXPLANATION_PATTERNS) {
    if (pattern.test(message)) return 're-explanation'
  }

  for (const pattern of CLARIFICATION_PATTERNS) {
    if (pattern.test(message)) return 'clarification'
  }

  return null
}

/**
 * Record a learning signal for analysis.
 * Fire-and-forget pattern - don't block the conversation.
 */
export const recordSignal = async (signal: LearningSignal): Promise<void> => {
  try {
    const supabase = getAdminClient()

    // Note: learning_signals table created in migration 017
    // Type cast needed until Supabase types are regenerated
    await (supabase as any).from('learning_signals').insert({
      type: signal.type,
      conversation_id: signal.conversationId,
      message_id: signal.messageId,
      user_id: signal.userId,
      voyage_slug: signal.voyageSlug,
      context: signal.context.slice(0, 500), // Limit context size
      created_at: signal.timestamp.toISOString(),
    })

    console.log('[Learning] Signal recorded:', signal.type)
  } catch (error) {
    // Don't fail the conversation for signal tracking
    console.error('[Learning] Failed to record signal:', error)
  }
}

/**
 * Fire-and-forget signal recording.
 * Use this in the chat flow to avoid blocking.
 */
export const emitSignal = (signal: LearningSignal): void => {
  recordSignal(signal).catch((error) => {
    console.error('[Learning] emitSignal error (non-blocking):', error)
  })
}

export interface SignalStats {
  corrections: number
  reExplanations: number
  clarifications: number
  frustrations: number
  total: number
  clarityScore: number      // 0-100, higher = better
  continuityScore: number   // 0-100, higher = better
}

/**
 * Get signal statistics for analysis.
 * Useful for monitoring and improving retrieval.
 */
export const getSignalStats = async (
  options?: {
    userId?: string
    voyageSlug?: string
    days?: number
  }
): Promise<SignalStats> => {
  const supabase = getAdminClient()
  const days = options?.days ?? 7

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Note: learning_signals table created in migration 017
  // Type cast needed until Supabase types are regenerated
  let query = (supabase as any)
    .from('learning_signals')
    .select('type')
    .gte('created_at', since.toISOString())

  if (options?.userId) query = query.eq('user_id', options.userId)
  if (options?.voyageSlug) query = query.eq('voyage_slug', options.voyageSlug)

  const { data, error } = await query

  if (error) {
    console.error('[Learning] getSignalStats error:', error)
    return {
      corrections: 0,
      reExplanations: 0,
      clarifications: 0,
      frustrations: 0,
      total: 0,
      clarityScore: 100,
      continuityScore: 100,
    }
  }

  const signals = (data ?? []) as Array<{ type: string }>
  const corrections = signals.filter((s) => s.type === 'correction').length
  const reExplanations = signals.filter((s) => s.type === 're-explanation').length
  const clarifications = signals.filter((s) => s.type === 'clarification').length
  const frustrations = signals.filter((s) => s.type === 'frustration').length
  const total = signals.length || 1 // Avoid division by zero

  // Calculate scores (lower failure signals = higher score)
  // Corrections indicate clarity failures
  // Re-explanations indicate continuity failures
  // Frustrations are weighted heavily (2x)
  const clarityFailures = corrections + frustrations * 2
  const continuityFailures = reExplanations + frustrations * 2

  const clarityScore = Math.max(0, Math.round(100 - (clarityFailures / total) * 100))
  const continuityScore = Math.max(0, Math.round(100 - (continuityFailures / total) * 100))

  return {
    corrections,
    reExplanations,
    clarifications,
    frustrations,
    total: signals.length,
    clarityScore,
    continuityScore,
  }
}

/**
 * Check if we should be more aggressive with retrieval.
 * Based on recent signal patterns.
 */
export const shouldBoostRetrieval = async (
  userId?: string,
  voyageSlug?: string
): Promise<boolean> => {
  const stats = await getSignalStats({ userId, voyageSlug, days: 1 })

  // Boost if continuity score is low or we've had recent frustrations
  return stats.continuityScore < 70 || stats.frustrations > 0
}
