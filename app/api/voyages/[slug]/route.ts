// Voyage by slug API
// GET - Get voyage details
// PUT - Update voyage config

import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  getVoyageBySlug,
  getUserRole,
  updateVoyage,
  getInviteUrl,
} from '@/lib/voyage';

// Fallback for development (will be removed once auth is fully tested)
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/voyages/[slug]
 * Get voyage details for a member.
 */
export const GET = async (_req: Request, { params }: RouteParams) => {
  const { slug } = await params;
  console.log('[Voyage API] GET - Getting voyage:', slug);

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

    // Return voyage details (include invite code only for captain/navigator)
    const canSeeInvite = role === 'captain' || role === 'navigator';

    return NextResponse.json({
      voyage: {
        id: voyage.id,
        slug: voyage.slug,
        name: voyage.name,
        description: voyage.description,
        isPublic: voyage.isPublic,
        config: voyage.config,
        inviteCode: canSeeInvite ? voyage.inviteCode : undefined,
        inviteUrl: canSeeInvite && voyage.inviteCode
          ? getInviteUrl(voyage.inviteCode)
          : undefined,
        createdAt: voyage.createdAt.toISOString(),
        updatedAt: voyage.updatedAt.toISOString(),
      },
      role,
    });
  } catch (error) {
    console.error('[Voyage API] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};

interface UpdateVoyageRequest {
  name?: string;
  description?: string;
  isPublic?: boolean;
  config?: Record<string, unknown>;
}

/**
 * PUT /api/voyages/[slug]
 * Update voyage settings (captain/navigator only).
 */
export const PUT = async (req: Request, { params }: RouteParams) => {
  const { slug } = await params;
  console.log('[Voyage API] PUT - Updating voyage:', slug);

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

    // Check permissions (captain or navigator can update)
    const role = await getUserRole(slug, userId);

    if (role !== 'captain' && role !== 'navigator') {
      return NextResponse.json(
        { error: 'Only captains and navigators can update voyage settings' },
        { status: 403 }
      );
    }

    const body = await req.json() as UpdateVoyageRequest;

    // Update voyage
    const updated = await updateVoyage(voyage.id, {
      name: body.name,
      description: body.description,
      isPublic: body.isPublic,
      config: body.config,
    });

    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to update voyage' },
        { status: 500 }
      );
    }

    console.log('[Voyage API] Updated voyage:', updated.slug);

    return NextResponse.json({
      voyage: {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        isPublic: updated.isPublic,
        config: updated.config,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    console.error('[Voyage API] PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
