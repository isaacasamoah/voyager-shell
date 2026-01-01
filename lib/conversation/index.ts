// Conversation service for Slice 3: Conversation Continuity
// Manages session lifecycle, message persistence, and conversation resumption

import { getAdminClient } from '@/lib/supabase/admin'
import type {
  Message,
  ExtendedSession,
  ResumableSession,
  SessionStatus,
  MessageRole,
} from '@/lib/supabase/types'

// Use admin client for conversation operations (bypasses RLS)
// TODO: Switch to user-scoped client once auth is wired up
const getClient = () => getAdminClient()

// Re-export types for convenience
export type { ExtendedSession, ResumableSession, SessionStatus, MessageRole }

// =============================================================================
// Conversation Interface Types
// =============================================================================

export interface Conversation {
  id: string
  userId: string | null
  title: string | null
  status: SessionStatus
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface ConversationMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: Date
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[]
}

export interface ResumableConversation {
  id: string
  title: string | null
  status: SessionStatus
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  preview: string | null
}

// =============================================================================
// Transform Functions
// =============================================================================

const transformSession = (row: ExtendedSession): Conversation => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  status: row.status,
  messageCount: row.message_count,
  lastMessageAt: new Date(row.last_message_at),
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

const transformMessage = (row: Message): ConversationMessage => ({
  id: row.id,
  conversationId: row.session_id ?? '',
  role: row.role,
  content: row.content,
  createdAt: new Date(row.created_at),
})

const transformResumable = (row: ResumableSession): ResumableConversation => ({
  id: row.id,
  title: row.title,
  status: row.status,
  messageCount: row.message_count,
  lastMessageAt: new Date(row.last_message_at),
  createdAt: new Date(row.created_at),
  preview: row.preview,
})

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Get or create the user's active conversation.
 * Returns the session with its messages loaded.
 */
export const getOrCreateActiveConversation = async (
  userId: string
): Promise<ConversationWithMessages | null> => {
  const supabase = getClient()
  console.log('[Conversation] Getting or creating active conversation for user:', userId)

  try {
    // Call the database function to get/create active session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessionId, error: rpcError } = await (supabase as any).rpc(
      'get_or_create_active_session',
      { p_user_id: userId }
    )

    if (rpcError) {
      console.error('[Conversation] get_or_create_active_session error:', rpcError)
      return null
    }

    if (!sessionId) {
      console.error('[Conversation] No session ID returned')
      return null
    }

    console.log('[Conversation] Active session ID:', sessionId)

    // Fetch the full session data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session, error: sessionError } = await (supabase as any)
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError) {
      console.error('[Conversation] Session fetch error:', sessionError)
      return null
    }

    // Fetch messages for this session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: messages, error: messagesError } = await (supabase as any)
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('[Conversation] Messages fetch error:', messagesError)
      return null
    }

    const conversation = transformSession(session as ExtendedSession)
    const conversationMessages = (messages as Message[]).map(transformMessage)

    console.log(
      '[Conversation] Loaded conversation with',
      conversationMessages.length,
      'messages'
    )

    return {
      ...conversation,
      messages: conversationMessages,
    }
  } catch (error) {
    console.error('[Conversation] getOrCreateActiveConversation error:', error)
    return null
  }
}

/**
 * Load messages for a conversation.
 * Returns messages ordered by creation time (oldest first).
 */
export const loadConversationMessages = async (
  conversationId: string,
  limit = 100
): Promise<ConversationMessage[]> => {
  const supabase = getClient()
  console.log('[Conversation] Loading messages for:', conversationId, 'limit:', limit)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('messages')
      .select('*')
      .eq('session_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('[Conversation] loadConversationMessages error:', error)
      return []
    }

    const messages = (data as Message[]).map(transformMessage)
    console.log('[Conversation] Loaded', messages.length, 'messages')

    return messages
  } catch (error) {
    console.error('[Conversation] loadConversationMessages error:', error)
    return []
  }
}

/**
 * Save a message to a conversation.
 * The database trigger will auto-update session metadata.
 */
export const saveMessage = async (
  conversationId: string,
  role: MessageRole,
  content: string
): Promise<ConversationMessage | null> => {
  const supabase = getClient()
  console.log('[Conversation] Saving message to:', conversationId, 'role:', role)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('messages')
      .insert({
        session_id: conversationId,
        role,
        content,
      })
      .select()
      .single()

    if (error) {
      console.error('[Conversation] saveMessage error:', error)
      return null
    }

    const message = transformMessage(data as Message)
    console.log('[Conversation] Message saved:', message.id)

    return message
  } catch (error) {
    console.error('[Conversation] saveMessage error:', error)
    return null
  }
}

/**
 * Archive a conversation (mark as historical).
 * This makes the conversation available for resume but no longer active.
 * Memory extraction can be triggered separately.
 */
export const archiveConversation = async (
  conversationId: string
): Promise<boolean> => {
  const supabase = getClient()
  console.log('[Conversation] Archiving conversation:', conversationId)

  try {
    // For admin client, we bypass auth.uid() check by updating directly
    // TODO: Use transition_session RPC once auth is wired up
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('sessions')
      .update({
        status: 'historical' as SessionStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    if (error) {
      console.error('[Conversation] archiveConversation error:', error)
      return false
    }

    console.log('[Conversation] Conversation archived successfully')
    return true
  } catch (error) {
    console.error('[Conversation] archiveConversation error:', error)
    return false
  }
}

/**
 * Get resumable conversations for a user.
 * Returns conversations ordered by recency with preview text.
 */
export const getResumableConversations = async (
  userId: string,
  limit = 10
): Promise<ResumableConversation[]> => {
  const supabase = getClient()
  console.log('[Conversation] Getting resumable conversations for user:', userId)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_resumable_sessions', {
      p_user_id: userId,
      p_limit: limit,
    })

    if (error) {
      console.error('[Conversation] getResumableConversations error:', error)
      return []
    }

    const results = data as ResumableSession[] | null
    if (!results || results.length === 0) {
      console.log('[Conversation] No resumable conversations found')
      return []
    }

    const conversations = results.map(transformResumable)
    console.log('[Conversation] Found', conversations.length, 'resumable conversations')

    return conversations
  } catch (error) {
    console.error('[Conversation] getResumableConversations error:', error)
    return []
  }
}

/**
 * Resume a historical conversation.
 * Archives the current active conversation and makes the target conversation active.
 */
export const resumeConversation = async (
  conversationId: string,
  userId: string
): Promise<ConversationWithMessages | null> => {
  const supabase = getClient()
  console.log('[Conversation] Resuming conversation:', conversationId)

  try {
    // For admin client, we handle the resume logic directly
    // TODO: Use resume_session RPC once auth is wired up

    // First, check the target conversation exists and belongs to user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: targetSession, error: targetError } = await (supabase as any)
      .from('sessions')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (targetError || !targetSession) {
      console.error('[Conversation] Target conversation not found:', targetError)
      return null
    }

    const target = targetSession as ExtendedSession

    // Can't resume archived conversations
    if (target.status === 'archived') {
      console.error('[Conversation] Cannot resume archived conversation')
      return null
    }

    // If already active, just return it with messages
    if (target.status === 'active') {
      console.log('[Conversation] Conversation already active')
      const messages = await loadConversationMessages(conversationId)
      return {
        ...transformSession(target),
        messages,
      }
    }

    // Archive current active session (if any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('sessions')
      .update({
        status: 'historical' as SessionStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('status', 'active')

    // Make target session active
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: activateError } = await (supabase as any)
      .from('sessions')
      .update({
        status: 'active' as SessionStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    if (activateError) {
      console.error('[Conversation] Failed to activate conversation:', activateError)
      return null
    }

    // Fetch updated session and messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedSession } = await (supabase as any)
      .from('sessions')
      .select('*')
      .eq('id', conversationId)
      .single()

    const messages = await loadConversationMessages(conversationId)

    console.log('[Conversation] Conversation resumed successfully')

    return {
      ...transformSession(updatedSession as ExtendedSession),
      messages,
    }
  } catch (error) {
    console.error('[Conversation] resumeConversation error:', error)
    return null
  }
}

/**
 * Set a semantic title for a conversation.
 * Typically called after AI generates a title based on conversation content.
 */
export const setConversationTitle = async (
  conversationId: string,
  title: string
): Promise<boolean> => {
  const supabase = getClient()
  console.log('[Conversation] Setting title for:', conversationId, 'title:', title)

  try {
    // For admin client, update directly
    // TODO: Use set_session_title RPC once auth is wired up
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('sessions')
      .update({
        title,
        title_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    if (error) {
      console.error('[Conversation] setConversationTitle error:', error)
      return false
    }

    console.log('[Conversation] Title set successfully')
    return true
  } catch (error) {
    console.error('[Conversation] setConversationTitle error:', error)
    return false
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a single conversation by ID.
 */
export const getConversation = async (
  conversationId: string
): Promise<Conversation | null> => {
  const supabase = getClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('sessions')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (error) {
      console.error('[Conversation] getConversation error:', error)
      return null
    }

    return transformSession(data as ExtendedSession)
  } catch (error) {
    console.error('[Conversation] getConversation error:', error)
    return null
  }
}

/**
 * Mark a conversation as having had its memories extracted.
 * Called after memory extraction process completes.
 */
export const markConversationExtracted = async (
  conversationId: string
): Promise<boolean> => {
  const supabase = getClient()
  console.log('[Conversation] Marking conversation as extracted:', conversationId)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('sessions')
      .update({
        extracted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    if (error) {
      console.error('[Conversation] markConversationExtracted error:', error)
      return false
    }

    console.log('[Conversation] Conversation marked as extracted')
    return true
  } catch (error) {
    console.error('[Conversation] markConversationExtracted error:', error)
    return false
  }
}

/**
 * Check if a conversation needs a title (has enough messages but no title).
 */
export const needsTitle = async (conversationId: string): Promise<boolean> => {
  const supabase = getClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('sessions')
      .select('title, message_count')
      .eq('id', conversationId)
      .single()

    if (error || !data) {
      return false
    }

    // Conversation needs title if it has 4+ messages and no title
    return data.title === null && data.message_count >= 4
  } catch {
    return false
  }
}

/**
 * Get conversations that need memory extraction.
 * Returns historical conversations that haven't been extracted yet.
 */
export const getConversationsNeedingExtraction = async (
  userId: string,
  limit = 10
): Promise<Conversation[]> => {
  const supabase = getClient()
  console.log('[Conversation] Getting conversations needing extraction for user:', userId)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'historical')
      .is('extracted_at', null)
      .order('last_message_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Conversation] getConversationsNeedingExtraction error:', error)
      return []
    }

    const conversations = (data as ExtendedSession[]).map(transformSession)
    console.log('[Conversation] Found', conversations.length, 'conversations needing extraction')

    return conversations
  } catch (error) {
    console.error('[Conversation] getConversationsNeedingExtraction error:', error)
    return []
  }
}
