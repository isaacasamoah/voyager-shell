import { createMemory } from '@/lib/memory'
import { getAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Test endpoint - POST to create a memory manually
// DELETE this after testing

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
