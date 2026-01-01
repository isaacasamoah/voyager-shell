// Knowledge Events service for Slice 2 Phase 1
// Creates source events in the event-sourced knowledge system
//
// Philosophy: "Curation is subtraction, not extraction"
// - Messages ARE the knowledge (preserved exactly)
// - Classifications are metadata on source events
// - Fire-and-forget pattern — never blocks the chat flow

import OpenAI from 'openai'
import { getAdminClient } from '@/lib/supabase/admin'
import type { MessageRole } from '@/lib/supabase/types'

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

// Source event types — these contain THE ACTUAL KNOWLEDGE
export type SourceEventType =
  | 'message'        // Conversation message
  | 'document'       // Google Docs, Notion, etc.
  | 'slack_message'  // Slack message/thread
  | 'jira_update'    // Jira ticket/comment
  | 'explicit'       // User explicitly adds knowledge

// Attention event types — curation by subtraction
export type AttentionEventType =
  | 'quieted'           // Mark as noise (is_active = false)
  | 'activated'         // Restore from quiet
  | 'pinned'            // Elevate importance
  | 'unpinned'          // Remove elevation
  | 'importance_changed' // Adjust weight

// Understanding event types — enrich, don't replace
export type UnderstandingEventType =
  | 'summary'     // Summary referencing source events
  | 'connection'  // Link between events
  | 'superseded'  // Mark old understanding as stale

export type EventType = SourceEventType | AttentionEventType | UnderstandingEventType

// Classification types — METADATA on source events, not extraction
export type Classification =
  | 'fact'       // Message contains verified information
  | 'preference' // Message expresses preference
  | 'decision'   // Message contains a choice
  | 'procedure'  // Message describes how-to
  | 'insight'    // Message contains learning
  | 'entity'     // Message mentions key people/systems

// Actor types for attribution
export type ActorType = 'user' | 'voyager' | 'system' | 'pipeline'

// Source types for provenance
export type SourceType = 'conversation' | 'slack' | 'jira' | 'document' | 'explicit'

// Metadata for source events
export interface SourceEventMetadata {
  classifications?: Classification[]
  entities?: string[]
  topics?: string[]
  session_id?: string
  message_id?: string
}

// Metadata for attention events
export interface AttentionEventMetadata {
  target_id: string  // UUID of the knowledge event to affect
  reason?: string
  previous_value?: boolean | number
  new_importance?: number  // For importance_changed
}

// =============================================================================
// Embedding Generation (async, for search)
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
// Source Event Creation
// =============================================================================

interface CreateSourceEventParams {
  eventType: SourceEventType
  content: string
  userId?: string
  voyageSlug?: string
  metadata?: SourceEventMetadata
  sourceType?: SourceType
  sourceRef?: Record<string, unknown>
  actorId?: string
  actorType?: ActorType
}

/**
 * Create a source event in knowledge_events.
 * The trigger will automatically create the knowledge_current row.
 *
 * For Phase 1, embeddings are generated inline and updated after creation.
 * Phase 2 will move this to an async pipeline.
 */
const createSourceEvent = async (params: CreateSourceEventParams): Promise<string | null> => {
  const {
    eventType,
    content,
    userId,
    voyageSlug,
    metadata = {},
    sourceType = 'conversation',
    sourceRef,
    actorId,
    actorType = 'user',
  } = params

  try {
    const supabase = getClient()

    // Insert the source event
    // The trigger creates knowledge_current row with the content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('knowledge_events')
      .insert({
        event_type: eventType,
        content: content,
        user_id: userId,
        voyage_slug: voyageSlug,
        metadata: {
          classifications: metadata.classifications ?? [],
          entities: metadata.entities ?? [],
          topics: metadata.topics ?? [],
          session_id: metadata.session_id,
          message_id: metadata.message_id,
        },
        source_type: sourceType,
        source_ref: sourceRef,
        actor_id: actorId,
        actor_type: actorType,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Knowledge] Failed to create source event:', error)
      return null
    }

    const eventId = data.id as string
    console.log('[Knowledge] Source event created:', eventId)

    // Generate and update embedding (async but inline for v1)
    // Phase 2: Move to background job
    try {
      const embedding = await generateEmbedding(content)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc('update_knowledge_embedding', {
        p_event_id: eventId,
        p_embedding: toVectorString(embedding),
      })
      console.log('[Knowledge] Embedding updated for:', eventId)
    } catch (embedError) {
      // Log but don't fail — search will work once embedding is added
      console.error('[Knowledge] Failed to generate embedding:', embedError)
    }

    return eventId
  } catch (error) {
    console.error('[Knowledge] Error creating source event:', error)
    return null
  }
}

/**
 * Create a message source event.
 * Called after a message is saved to the conversation.
 *
 * FIRE-AND-FORGET — should never block the chat response.
 */
export const createMessageEvent = async (
  conversationId: string,
  role: MessageRole,
  content: string,
  options?: {
    userId?: string
    voyageSlug?: string
    classifications?: Classification[]
  }
): Promise<string | null> => {
  console.log('[Knowledge] Creating message event for conversation:', conversationId)

  return createSourceEvent({
    eventType: 'message',
    content: content,
    userId: options?.userId,
    voyageSlug: options?.voyageSlug,
    metadata: {
      classifications: options?.classifications ?? [],
      session_id: conversationId,
    },
    sourceType: 'conversation',
    sourceRef: {
      conversation_id: conversationId,
      role: role,
    },
    actorType: role === 'user' ? 'user' : 'voyager',
  })
}

/**
 * Create an explicit knowledge event.
 * For when users explicitly say "remember this" or captains add knowledge.
 */
export const createExplicitEvent = async (
  content: string,
  options: {
    userId?: string
    voyageSlug?: string
    classifications?: Classification[]
  }
): Promise<string | null> => {
  console.log('[Knowledge] Creating explicit event')

  return createSourceEvent({
    eventType: 'explicit',
    content: content,
    userId: options.userId,
    voyageSlug: options.voyageSlug,
    metadata: {
      classifications: options.classifications ?? [],
    },
    sourceType: 'explicit',
    actorType: 'user',
  })
}

// =============================================================================
// Attention Event Creation (Curation by Subtraction)
// =============================================================================

/**
 * Quiet a knowledge event — mark as noise.
 * The content is still there, just not surfaced by default.
 */
export const quietKnowledge = async (
  targetId: string,
  options?: {
    userId?: string
    voyageSlug?: string
    reason?: string
  }
): Promise<boolean> => {
  try {
    const supabase = getClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('knowledge_events')
      .insert({
        event_type: 'quieted',
        user_id: options?.userId,
        voyage_slug: options?.voyageSlug,
        metadata: {
          target_id: targetId,
          reason: options?.reason,
        },
        actor_type: 'user',
      })

    if (error) {
      console.error('[Knowledge] Failed to quiet knowledge:', error)
      return false
    }

    console.log('[Knowledge] Quieted:', targetId)
    return true
  } catch (error) {
    console.error('[Knowledge] Error quieting knowledge:', error)
    return false
  }
}

/**
 * Pin a knowledge event — elevate importance.
 * Pinned items are always surfaced.
 */
export const pinKnowledge = async (
  targetId: string,
  options?: {
    userId?: string
    voyageSlug?: string
    reason?: string
  }
): Promise<boolean> => {
  try {
    const supabase = getClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('knowledge_events')
      .insert({
        event_type: 'pinned',
        user_id: options?.userId,
        voyage_slug: options?.voyageSlug,
        metadata: {
          target_id: targetId,
          reason: options?.reason,
        },
        actor_type: 'user',
      })

    if (error) {
      console.error('[Knowledge] Failed to pin knowledge:', error)
      return false
    }

    console.log('[Knowledge] Pinned:', targetId)
    return true
  } catch (error) {
    console.error('[Knowledge] Error pinning knowledge:', error)
    return false
  }
}

/**
 * Activate a quieted knowledge event — restore to active.
 */
export const activateKnowledge = async (
  targetId: string,
  options?: {
    userId?: string
    voyageSlug?: string
  }
): Promise<boolean> => {
  try {
    const supabase = getClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('knowledge_events')
      .insert({
        event_type: 'activated',
        user_id: options?.userId,
        voyage_slug: options?.voyageSlug,
        metadata: {
          target_id: targetId,
        },
        actor_type: 'user',
      })

    if (error) {
      console.error('[Knowledge] Failed to activate knowledge:', error)
      return false
    }

    console.log('[Knowledge] Activated:', targetId)
    return true
  } catch (error) {
    console.error('[Knowledge] Error activating knowledge:', error)
    return false
  }
}

// =============================================================================
// Fire-and-Forget Wrapper
// =============================================================================

/**
 * Emit a message event without blocking.
 * Use this in the chat route after saving messages.
 */
export const emitMessageEvent = (
  conversationId: string,
  role: MessageRole,
  content: string,
  options?: {
    userId?: string
    voyageSlug?: string
    classifications?: Classification[]
  }
): void => {
  // Fire and forget — don't await
  createMessageEvent(conversationId, role, content, options).catch((error) => {
    console.error('[Knowledge] emitMessageEvent error (non-blocking):', error)
  })
}
