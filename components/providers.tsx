'use client';

// App-level providers
// Wraps all client-side context providers

import { AuthProvider } from '@/lib/auth/context';

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
