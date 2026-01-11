'use client';

// App-level providers
// Wraps all client-side context providers
// Uses dynamic import to avoid Supabase SDK errors during static generation

import dynamic from 'next/dynamic';

// Dynamically import AuthProvider to prevent Supabase init during build
const AuthProvider = dynamic(
  () => import('@/lib/auth/context').then((mod) => mod.AuthProvider),
  {
    ssr: false, // Only load on client
    loading: () => null,
  }
);

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers = ({ children }: ProvidersProps) => {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
};
