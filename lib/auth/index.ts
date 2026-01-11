// Auth service for Slice 3
// Magic link authentication via Supabase

import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Types
// =============================================================================

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

// =============================================================================
// Magic Link Auth
// =============================================================================

/**
 * Send a magic link to the user's email.
 * Works for both sign-up and login (Supabase handles both cases).
 */
export const sendMagicLink = async (email: string): Promise<AuthResult> => {
  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Redirect back to our callback route after magic link click
        emailRedirectTo: `${getBaseUrl()}/auth/callback`,
      },
    });

    if (error) {
      console.error('[Auth] Magic link error:', error);
      return { success: false, error: error.message };
    }

    console.log('[Auth] Magic link sent to:', email);
    return { success: true };
  } catch (error) {
    console.error('[Auth] sendMagicLink error:', error);
    return { success: false, error: 'Failed to send magic link' };
  }
};

/**
 * Get the current authenticated user.
 * Returns null if not authenticated.
 */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    // Get profile data for display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email ?? '',
      displayName: (profile as { display_name: string | null } | null)?.display_name ?? null,
    };
  } catch (error) {
    console.error('[Auth] getCurrentUser error:', error);
    return null;
  }
};

/**
 * Sign out the current user.
 */
export const signOut = async (): Promise<AuthResult> => {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[Auth] Sign out error:', error);
      return { success: false, error: error.message };
    }

    console.log('[Auth] User signed out');
    return { success: true };
  } catch (error) {
    console.error('[Auth] signOut error:', error);
    return { success: false, error: 'Failed to sign out' };
  }
};

// =============================================================================
// API Route Helpers
// =============================================================================

/**
 * Get the authenticated user ID from the request.
 * Returns null if not authenticated.
 * Use this in API routes to get the real user ID.
 */
export const getAuthenticatedUserId = async (): Promise<string | null> => {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.error('[Auth] getAuthenticatedUserId error:', error);
    return null;
  }
};

/**
 * Require authentication in an API route.
 * Returns user ID or throws error response.
 */
export const requireAuth = async (): Promise<string> => {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the base URL for redirects.
 * Uses NEXT_PUBLIC_APP_URL or falls back to localhost.
 */
const getBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
};

// Re-export context hook and provider for client components
export { AuthProvider, useAuth } from './context';
export type { AuthUser as ClientAuthUser } from './context';
