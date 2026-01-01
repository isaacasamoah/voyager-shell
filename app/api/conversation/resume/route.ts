// Conversation resume API
// GET - List resumable conversations for picker
// POST - Resume a specific conversation

import { NextResponse } from 'next/server'
import {
  getResumableConversations,
  resumeConversation,
} from '@/lib/conversation'

// Placeholder user ID until auth is wired up
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * GET /api/conversation/resume
 * List resumable (historical) conversations.
 * Used by conversation picker UI.
 */
export const GET = async (req: Request) => {
  console.log('[Resume API] GET - Fetching resumable conversations')

  try {
    // Parse limit from query params (default 10)
    const url = new URL(req.url)
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 10

    const conversations = await getResumableConversations(DEV_USER_ID, limit)

    console.log('[Resume API] Found', conversations.length, 'resumable conversations')

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
        preview: c.preview,
      })),
    })
  } catch (error) {
    console.error('[Resume API] GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

interface ResumeRequest {
  conversationId: string
}

/**
 * POST /api/conversation/resume
 * Resume a specific historical conversation.
 * Archives the current active conversation and makes the target active.
 */
export const POST = async (req: Request) => {
  console.log('[Resume API] POST - Resuming conversation')

  try {
    const body = await req.json() as ResumeRequest

    if (!body.conversationId) {
      console.error('[Resume API] Missing conversationId')
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    // Validate conversationId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(body.conversationId)) {
      console.error('[Resume API] Invalid conversationId format:', body.conversationId)
      return NextResponse.json(
        { error: 'Invalid conversationId format' },
        { status: 400 }
      )
    }

    console.log('[Resume API] Resuming conversation:', body.conversationId)

    const conversation = await resumeConversation(body.conversationId, DEV_USER_ID)

    if (!conversation) {
      console.error('[Resume API] Failed to resume conversation:', body.conversationId)
      return NextResponse.json(
        { error: 'Failed to resume conversation. It may not exist or be archived.' },
        { status: 404 }
      )
    }

    console.log(
      '[Resume API] Resumed conversation:',
      conversation.id,
      'with',
      conversation.messages.length,
      'messages'
    )

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        messageCount: conversation.messageCount,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        createdAt: conversation.createdAt.toISOString(),
      },
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      console.error('[Resume API] Invalid JSON in request body')
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    console.error('[Resume API] POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
