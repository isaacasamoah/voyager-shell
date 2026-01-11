import { createBrowserClient } from '@supabase/ssr'
import { type Database } from './types'

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // During static generation, env vars may not be available
  // Return a dummy client that will be replaced on hydration
  if (!url || !key) {
    console.warn('[Supabase] Client created without credentials - static generation context')
    // Return a placeholder that won't be used during static render
    return createBrowserClient<Database>(
      'https://placeholder.supabase.co',
      'placeholder-key'
    )
  }

  return createBrowserClient<Database>(url, key)
}
