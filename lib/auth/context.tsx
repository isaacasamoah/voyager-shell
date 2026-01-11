'use client';

// Auth context provider
// Provides auth state to client components

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sendMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: AuthUser | null;
}

export const AuthProvider = ({ children, initialUser = null }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState(!initialUser);

  const supabase = createClient();

  // Transform Supabase user to our AuthUser type
  const toAuthUser = (user: User | null): AuthUser | null => {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? '',
    };
  };

  // Refresh auth state
  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(toAuthUser(user));
    } catch (error) {
      console.error('[Auth] Refresh error:', error);
      setUser(null);
    }
  }, [supabase]);

  // Initial auth check and subscription
  useEffect(() => {
    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(toAuthUser(session?.user ?? null));
      } catch (error) {
        console.error('[Auth] Init error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        console.log('[Auth] State change:', _event);
        setUser(toAuthUser(session?.user ?? null));
        setIsLoading(false);

        // Broadcast to other tabs when signed in (magic link flow)
        if (_event === 'SIGNED_IN' && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const channel = new BroadcastChannel('voyager-auth');
          channel.postMessage({ type: 'auth_complete' });
          channel.close();
          console.log('[Auth] Broadcasted auth_complete to other tabs');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Listen for auth completion from other tabs (magic link flow)
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('voyager-auth');
    channel.onmessage = (event) => {
      if (event.data?.type === 'auth_complete') {
        console.log('[Auth] Received auth_complete from another tab');
        refresh(); // Refresh auth state in this tab
      }
    };

    return () => channel.close();
  }, [refresh]);

  // Send magic link
  const sendMagicLink = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
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
  }, [supabase]);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      console.log('[Auth] Signed out');
    } catch (error) {
      console.error('[Auth] Sign out error:', error);
    }
  }, [supabase]);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    sendMagicLink,
    signOut,
    refresh,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// =============================================================================
// Hook
// =============================================================================

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
