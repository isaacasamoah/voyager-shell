// Voyage invite API
// POST - Regenerate invite code (captain only)

import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  getVoyageBySlug,
  regenerateInviteCode,
  getInviteUrl,
} from '@/lib/voyage';

// Fallback for development (will be removed once auth is fully tested)
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/voyages/[slug]/invite
 * Regenerate the voyage invite code. Captain only.
 */
export const POST = async (_req: Request, { params }: RouteParams) => {
  const { slug } = await params;
  console.log('[Voyage Invite API] POST - Regenerating invite for:', slug);

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

    // Regenerate invite code (function checks captain permission)
    const newCode = await regenerateInviteCode(voyage.id, userId);

    if (!newCode) {
      return NextResponse.json(
        { error: 'Only the captain can regenerate invite codes' },
        { status: 403 }
      );
    }

    console.log('[Voyage Invite API] Regenerated invite code for:', slug);

    return NextResponse.json({
      inviteCode: newCode,
      inviteUrl: getInviteUrl(newCode),
    });
  } catch (error) {
    console.error('[Voyage Invite API] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
