// End-of-session memory extraction endpoint
// POST with messages array to extract and store memories

import { NextResponse } from 'next/server'
import { extractAndStoreMemories } from '@/lib/extraction'

// Placeholder user ID until auth is wired up
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'

interface ExtractRequest {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  sessionId?: string
}

export const POST = async (req: Request) => {
  try {
    const body = await req.json() as ExtractRequest

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: 'messages array required' },
        { status: 400 }
      )
    }

    // Filter to only user and assistant messages with content
    const messages = body.messages.filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )

    if (messages.length < 2) {
      return NextResponse.json({
        success: true,
        stored: 0,
        skipped: 0,
        summary: 'Not enough conversation to extract from',
      })
    }

    console.log('[Extract API] Processing', messages.length, 'messages')

    const result = await extractAndStoreMemories(
      DEV_USER_ID,
      messages,
      body.sessionId
    )

    console.log('[Extract API] Result:', result)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[Extract API] Error:', error)
    return NextResponse.json(
      { error: 'Extraction failed' },
      { status: 500 }
    )
  }
}
