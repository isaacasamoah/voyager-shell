'use client';

// Invite landing page
// Shows voyage preview and join button

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';

interface VoyagePreview {
  slug: string;
  name: string;
  description: string | null;
}

interface JoinPageProps {
  params: Promise<{ code: string }>;
}

export default function JoinPage({ params }: JoinPageProps) {
  const { code } = use(params);
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [voyage, setVoyage] = useState<VoyagePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<{
    alreadyMember: boolean;
    slug: string;
  } | null>(null);

  // Fetch voyage preview
  useEffect(() => {
    const fetchVoyage = async () => {
      try {
        const res = await fetch(`/api/voyages/join/${code}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Invalid invite link');
          return;
        }

        setVoyage(data.voyage);
      } catch (err) {
        console.error('Failed to fetch voyage:', err);
        setError('Failed to load invite');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVoyage();
  }, [code]);

  const handleJoin = async () => {
    if (!isAuthenticated) {
      // Store invite code and redirect to sign up
      localStorage.setItem('pendingInvite', code);
      router.push('/?action=signup');
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const res = await fetch(`/api/voyages/join/${code}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to join');
        return;
      }

      setJoinResult({
        alreadyMember: data.alreadyMember,
        slug: data.voyage.slug,
      });

      // Redirect to main app after short delay
      setTimeout(() => {
        router.push(`/?voyage=${data.voyage.slug}`);
      }, 2000);
    } catch (err) {
      console.error('Failed to join voyage:', err);
      setError('Failed to join voyage');
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-gray-400 font-mono">Loading...</div>
      </div>
    );
  }

  if (error && !voyage) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 font-mono mb-4">{error}</div>
          <button
            onClick={() => router.push('/')}
            className="text-indigo-400 hover:text-indigo-300 font-mono text-sm"
          >
            ← Back to Voyager
          </button>
        </div>
      </div>
    );
  }

  if (joinResult) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <div className="text-green-400 font-mono text-lg mb-2">
            {joinResult.alreadyMember
              ? `You're already a member of ${voyage?.name}!`
              : `Welcome to ${voyage?.name}!`}
          </div>
          <div className="text-gray-500 font-mono text-sm">
            Redirecting...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Invite card */}
        <div className="border border-gray-800 rounded-lg p-6 bg-[#0a0a0a]">
          <div className="text-gray-500 font-mono text-xs mb-4 uppercase tracking-wide">
            You&apos;ve been invited to join
          </div>

          <h1 className="text-white font-mono text-2xl font-bold mb-2">
            {voyage?.name}
          </h1>

          {voyage?.description && (
            <p className="text-gray-400 font-mono text-sm mb-6">
              {voyage.description}
            </p>
          )}

          {error && (
            <div className="text-red-400 font-mono text-sm mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800
                       disabled:cursor-not-allowed text-white font-mono py-3 px-4
                       rounded transition-colors"
          >
            {isJoining
              ? 'Joining...'
              : isAuthenticated
                ? 'Join Voyage'
                : 'Sign up to join'}
          </button>

          {!isAuthenticated && (
            <div className="text-gray-500 font-mono text-xs mt-4 text-center">
              Already have an account?{' '}
              <button
                onClick={() => {
                  localStorage.setItem('pendingInvite', code);
                  router.push('/?action=login');
                }}
                className="text-indigo-400 hover:text-indigo-300"
              >
                Log in
              </button>
            </div>
          )}
        </div>

        {/* Voyager branding */}
        <div className="text-center mt-6">
          <div className="text-gray-600 font-mono text-xs">
            Powered by{' '}
            <span className="text-indigo-500">Voyager</span>
          </div>
        </div>
      </div>
    </div>
  );
}
