import { createMemory } from '@/lib/memory'
import { getAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Test endpoint - GET to debug knowledge, POST to create memory
// DELETE this after testing

// GET - Debug knowledge distribution
export const GET = async (req: Request) => {
  const admin = getAdminClient()
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')

  // Get distribution by user/voyage
  const { data: distribution } = await (admin as any)
    .from('knowledge_events')
    .select('user_id, voyage_slug, event_type, created_at, content')
    .order('created_at', { ascending: false })
    .limit(100)

  // Get unique user IDs for debugging
  const uniqueUsers = Array.from(new Set(distribution?.map((r: any) => r.user_id).filter(Boolean)))

  // Summarize
  const summary: Record<string, number> = {}
  distribution?.forEach((row: any) => {
    const key = `${row.user_id?.slice(0,8) || 'null'}|${row.voyage_slug || 'personal'}`
    summary[key] = (summary[key] || 0) + 1
  })

  // If userId specified, get their recent content
  let userContent = null
  if (userId) {
    const { data, error } = await (admin as any)
      .from('knowledge_current')
      .select('event_id, content, voyage_slug, is_active, source_created_at')
      .eq('user_id', userId)
      .order('source_created_at', { ascending: false })
      .limit(20)
    if (error) {
      console.error('[Memory Test] Error:', error)
    }
    userContent = data?.map((r: any) => ({
      id: r.event_id.slice(0, 8),
      content: r.content?.slice(0, 60),
      voyage: r.voyage_slug || 'personal',
      active: r.is_active,
    }))
  }

  return NextResponse.json({ summary, userContent, uniqueUsers, total: distribution?.length })
}

// Dev UUID - consistent across tests
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_EMAIL = 'dev@voyager.test'

// Ensure dev user exists
const ensureDevUser = async () => {
  const admin = getAdminClient()

  // Check if user exists
  const { data: existing } = await admin.auth.admin.getUserById(DEV_USER_ID)
  if (existing?.user) {
    console.log('[Memory Test] Dev user exists')
    return
  }

  // Create dev user
  console.log('[Memory Test] Creating dev user...')
  const { error } = await admin.auth.admin.createUser({
    id: DEV_USER_ID,
    email: DEV_EMAIL,
    email_confirm: true,
    password: 'dev-password-not-for-prod',
  })

  if (error && !error.message.includes('already exists')) {
    console.error('[Memory Test] Failed to create dev user:', error)
    throw error
  }
  console.log('[Memory Test] Dev user created')
}

export const POST = async (req: Request) => {
  try {
    // Ensure dev user exists first
    await ensureDevUser()

    const { content, type = 'fact' } = await req.json()

    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }

    console.log('[Memory Test] Creating memory:', { content, type })

    const memory = await createMemory({
      userId: DEV_USER_ID,
      type,
      content,
      importance: 0.8,
      confidence: 1.0,
    })

    console.log('[Memory Test] Created:', memory.id)

    return NextResponse.json({ success: true, memory })
  } catch (error) {
    console.error('[Memory Test] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
