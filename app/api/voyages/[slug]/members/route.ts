// Voyage members API
// GET - List voyage members

import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  getVoyageBySlug,
  getUserRole,
  getVoyageMembers,
} from '@/lib/voyage';

// Fallback for development (will be removed once auth is fully tested)
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/voyages/[slug]/members
 * List all members of a voyage.
 */
export const GET = async (_req: Request, { params }: RouteParams) => {
  const { slug } = await params;
  console.log('[Voyage Members API] GET - Listing members for:', slug);

  try {
    // Get authenticated user ID, fall back to dev user if not authenticated
    const userId = await getAuthenticatedUserId() ?? DEV_USER_ID;

    // Get voyage
    const voyage = await getVoyageBySlug(slug);

    if (!voyage) {
      return NextResponse.json(
        { error: 'Voyage not found' },
        { status: 404 }
      );
    }

    // Check membership
    const role = await getUserRole(slug, userId);

    if (!role) {
      return NextResponse.json(
        { error: 'You are not a member of this voyage' },
        { status: 403 }
      );
    }

    // Get members
    const members = await getVoyageMembers(voyage.id);

    console.log('[Voyage Members API] Found', members.length, 'members');

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        displayName: m.displayName,
        email: m.email,
        joinedAt: m.joinedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Voyage Members API] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
