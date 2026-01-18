// Natural language intent detection
// Detect what user wants without explicit /commands

import { log } from '@/lib/debug';

export type UIIntent =
  | { type: 'new_conversation' }
  | { type: 'resume_conversation'; conversationId?: string }
  | { type: 'switch_voyage'; voyageSlug?: string }
  | { type: 'create_voyage'; name?: string }
  | { type: 'show_voyages' }
  | { type: 'invite_member' }
  | { type: 'sign_up' }
  | { type: 'login' }
  | { type: 'logout' }
  | { type: 'none' } // Regular chat message

interface IntentPattern {
  patterns: RegExp[]
  intent: UIIntent['type']
  extract?: (match: RegExpMatchArray, message: string) => Partial<UIIntent>
}

const INTENT_PATTERNS: IntentPattern[] = [
  // New conversation
  {
    patterns: [
      /\b(start|begin|new)\s+(a\s+)?(fresh|new|another|clean)?\s*(conversation|chat|session|thread)?\b/i,
      /\blet'?s\s+(start|begin)\s+(fresh|over|again|anew)\b/i,
      /\bfresh\s+start\b/i,
      /\bstart\s+over\b/i,
      /\bnew\s+chat\b/i,
    ],
    intent: 'new_conversation',
  },
  // Resume conversation
  {
    patterns: [
      /\b(continue|resume|pick\s*up|back\s+to|return\s+to)\s+(where|our|the|that|my)?\s*(conversation|chat|discussion|session)?\b/i,
      /\bwhat\s+were\s+we\s+(talking|discussing|chatting|working)\s+(about|on)\b/i,
      /\bwhere\s+did\s+we\s+leave\s+off\b/i,
      /\bpick\s+up\s+where\b/i,
    ],
    intent: 'resume_conversation',
  },
  // Switch voyage
  {
    patterns: [
      /\b(switch|go|move|change|jump|take\s+me)\s+to\s+(?:the\s+)?(.+?)\s*(voyage|team|workspace|community)?\s*$/i,
      /\b(open|show|load)\s+(?:the\s+)?(.+?)\s*(voyage|team|workspace|community)\b/i,
    ],
    intent: 'switch_voyage',
    extract: (match) => ({
      // Normalize: lowercase, trim, non-alphanumeric to hyphens (matching generateSlug)
      voyageSlug: match[2]?.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    }),
  },
  // Create voyage
  {
    patterns: [
      /\b(create|start|new|make|set\s*up)\s+(a\s+)?(new\s+)?(voyage|team|workspace|community)\b/i,
      /\bhelp\s+me\s+set\s*up\s+(a\s+)?(team|workspace|community)\b/i,
    ],
    intent: 'create_voyage',
  },
  // Show voyages
  {
    patterns: [
      /\b(show|list|see|view|what\s+are)\s*(all\s+)?(my\s+)?(voyages|teams|workspaces|communities)\b/i,
      /\bwhich\s+(voyages|teams|workspaces)\s+(do\s+I|am\s+I|can\s+I)\b/i,
      /\bmy\s+(voyages|teams|workspaces)\b/i,
    ],
    intent: 'show_voyages',
  },
  // Invite
  {
    patterns: [
      /\b(invite|add)\s+(someone|people|a?\s*member|team\s*mate|colleague)\b/i,
      /\b(get|share|send)\s+(an?\s+)?invite\s*(link|code)?\b/i,
      /\binvite\s+link\b/i,
    ],
    intent: 'invite_member',
  },
  // Sign up
  {
    patterns: [
      /\b(i\s+)?(want\s+to\s+)?(sign\s*up|register|create\s+an?\s+account)\b/i,
      /\b(i'?m\s+)?new\s+here\b/i,
      /\bget\s+started\b/i,
    ],
    intent: 'sign_up',
  },
  // Login
  {
    patterns: [
      /\b(i\s+)?(want\s+to\s+)?(log\s*in|sign\s*in)\b/i,
      /\b(i\s+)?(already\s+)?have\s+an?\s+account\b/i,
    ],
    intent: 'login',
  },
  // Logout
  {
    patterns: [
      /\b(log\s*out|sign\s*out)\b/i,
      /\b(i\s+)?(want\s+to\s+)?leave\b/i,
    ],
    intent: 'logout',
  },
]

/**
 * Detect intent from natural language message.
 * Returns the detected intent or { type: 'none' } for regular chat.
 */
export const detectIntent = (message: string): UIIntent => {
  const trimmed = message.trim()

  // Skip very long messages - they're likely actual content, not commands
  if (trimmed.length > 100) {
    log.intent('Skipped - message too long', { length: trimmed.length })
    return { type: 'none' }
  }

  for (const { patterns, intent, extract } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = trimmed.match(pattern)
      if (match) {
        const base = { type: intent } as UIIntent
        const result = extract ? { ...base, ...extract(match, trimmed) } as UIIntent : base
        log.intent('Matched pattern', { type: intent, input: trimmed.slice(0, 50), pattern: pattern.source.slice(0, 40) })
        return result
      }
    }
  }

  return { type: 'none' }
}

/**
 * Check if a message is likely an intent (vs regular chat).
 * Useful for deciding whether to intercept or send to LLM.
 */
export const hasIntent = (message: string): boolean => {
  return detectIntent(message).type !== 'none'
}
