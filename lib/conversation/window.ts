// Sliding window for conversation context
// Token-budgeted, no compaction - just smart windowing

import type { ConversationMessage } from './index'

export interface WindowConfig {
  maxTokens: number        // Total token budget for messages
  minMessages: number      // Always keep at least N recent messages
  reserveForContext: number // Reserve tokens for pre-retrieval injection
}

export const DEFAULT_WINDOW: WindowConfig = {
  maxTokens: 8000,         // ~4k words of conversation
  minMessages: 5,          // Always keep last 5
  reserveForContext: 2000, // Reserve for retrieved knowledge
}

export interface WindowResult {
  messages: ConversationMessage[]  // Messages to include in context
  truncatedCount: number           // How many were dropped from start
  tokenCount: number               // Actual tokens used
  hasMoreHistory: boolean          // True if there's history beyond window
}

/**
 * Compute a token-budgeted sliding window over conversation messages.
 *
 * Strategy:
 * - Start from most recent, work backwards
 * - Always include minimum messages (even if over budget)
 * - Stop when budget exhausted
 * - Reserve space for retrieved context injection
 */
export const computeWindow = (
  allMessages: ConversationMessage[],
  config: WindowConfig = DEFAULT_WINDOW
): WindowResult => {
  if (allMessages.length === 0) {
    return {
      messages: [],
      truncatedCount: 0,
      tokenCount: 0,
      hasMoreHistory: false,
    }
  }

  // Work backwards from most recent
  const reversed = [...allMessages].reverse()
  const included: ConversationMessage[] = []
  let tokenCount = 0

  const availableBudget = config.maxTokens - config.reserveForContext

  for (let i = 0; i < reversed.length; i++) {
    const msg = reversed[i]
    const msgTokens = estimateTokens(msg.content)

    // Always include minimum messages (guarantees recent context)
    if (i < config.minMessages) {
      included.unshift(msg)
      tokenCount += msgTokens
      continue
    }

    // Check if we have room within budget
    if (tokenCount + msgTokens <= availableBudget) {
      included.unshift(msg)
      tokenCount += msgTokens
    } else {
      // Budget exhausted
      break
    }
  }

  const truncatedCount = allMessages.length - included.length

  return {
    messages: included,
    truncatedCount,
    tokenCount,
    hasMoreHistory: truncatedCount > 0,
  }
}

/**
 * Estimate token count for text.
 * Uses ~4 chars per token heuristic (refine with tiktoken if needed).
 */
export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4)
}

/**
 * Get messages that were truncated (for continuity retrieval).
 */
export const getTruncatedMessages = (
  allMessages: ConversationMessage[],
  windowResult: WindowResult
): ConversationMessage[] => {
  if (windowResult.truncatedCount === 0) {
    return []
  }

  // Return the messages that didn't make it into the window
  return allMessages.slice(0, windowResult.truncatedCount)
}

/**
 * Check if the window is under pressure (close to budget).
 * Useful for deciding when to be more aggressive with retrieval.
 */
export const isWindowUnderPressure = (
  windowResult: WindowResult,
  config: WindowConfig = DEFAULT_WINDOW
): boolean => {
  const availableBudget = config.maxTokens - config.reserveForContext
  const usageRatio = windowResult.tokenCount / availableBudget

  // Consider under pressure if >80% of budget used
  return usageRatio > 0.8
}
