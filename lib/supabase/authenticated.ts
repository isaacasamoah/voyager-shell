// lib/supabase/authenticated.ts
// Authenticated Supabase client that respects RLS via JWT

import { createServerClient } from '@supabase/ssr'
import { type Database } from './types'
import { getAdminClient } from './admin'

export type AuthenticatedClient = ReturnType<typeof createServerClient<Database>>

export interface ServiceContext {
  userId: string
  userJwt?: string
  voyageSlug?: string
  conversationId?: string
}

export const createAuthenticatedClient = (userJwt: string): AuthenticatedClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing Supabase credentials for authenticated client')
  }

  return createServerClient<Database>(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`,
      },
    },
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  })
}

export const getClientForContext = (ctx: ServiceContext): AuthenticatedClient => {
  if (ctx.userJwt) {
    return createAuthenticatedClient(ctx.userJwt)
  }
  console.warn('[Auth] Using admin client - no userJwt in context')
  return getAdminClient() as AuthenticatedClient
}

export const requireAuthenticatedClient = (ctx: ServiceContext): AuthenticatedClient => {
  if (!ctx.userJwt) {
    throw new Error('Authenticated client required but no userJwt in context')
  }
  return createAuthenticatedClient(ctx.userJwt)
}
