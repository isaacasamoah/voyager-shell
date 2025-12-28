import { createClient } from '@supabase/supabase-js'
import { type Database } from './types'

// Admin client - bypasses RLS, use only server-side
// For operations that don't have an authenticated user context

let _adminClient: ReturnType<typeof createClient<Database>> | null = null

export const getAdminClient = () => {
  if (_adminClient) return _adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url || !secretKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY for admin client')
  }

  _adminClient = createClient<Database>(url, secretKey)
  return _adminClient
}
