// Voyages API
// GET - List user's voyages
// POST - Create new voyage

import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  getUserVoyages,
  createVoyage,
  generateSlug,
  isSlugAvailable,
  getInviteUrl,
} from '@/lib/voyage';

// Fallback for development (will be removed once auth is fully tested)
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/voyages
 * List all voyages the current user is a member of.
 */
export const GET = async () => {
  console.log('[Voyages API] GET - Listing user voyages');

  try {
    // Get authenticated user ID, fall back to dev user if not authenticated
    const userId = await getAuthenticatedUserId() ?? DEV_USER_ID;

    const voyages = await getUserVoyages(userId);

    console.log('[Voyages API] Found', voyages.length, 'voyages:', voyages.map(v => `${v.name} (${v.slug})`).join(', '));

    return NextResponse.json({
      voyages: voyages.map((v) => ({
        id: v.voyageId,
        slug: v.slug,
        name: v.name,
        role: v.role,
        joinedAt: v.joinedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Voyages API] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};

interface CreateVoyageRequest {
  name: string;
  slug?: string;
  description?: string;
}

/**
 * POST /api/voyages
 * Create a new voyage. The creator becomes the captain.
 */
export const POST = async (req: Request) => {
  console.log('[Voyages API] POST - Creating voyage');

  try {
    // Get authenticated user ID, fall back to dev user if not authenticated
    const userId = await getAuthenticatedUserId() ?? DEV_USER_ID;

    const body = await req.json() as CreateVoyageRequest;

    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Generate slug if not provided
    const slug = body.slug?.trim() || generateSlug(body.name);

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: 'Slug must contain only lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    // Check slug availability
    if (!(await isSlugAvailable(slug))) {
      return NextResponse.json(
        { error: 'This slug is already taken. Please choose another.' },
        { status: 409 }
      );
    }

    // Create the voyage
    const voyage = await createVoyage(
      {
        name: body.name.trim(),
        slug,
        description: body.description?.trim(),
      },
      userId
    );

    if (!voyage) {
      console.error('[Voyages API] Failed to create voyage');
      return NextResponse.json(
        { error: 'Failed to create voyage' },
        { status: 500 }
      );
    }

    console.log('[Voyages API] Created voyage:', voyage.slug);

    return NextResponse.json({
      voyage: {
        id: voyage.id,
        slug: voyage.slug,
        name: voyage.name,
        description: voyage.description,
        inviteCode: voyage.inviteCode,
        inviteUrl: voyage.inviteCode ? getInviteUrl(voyage.inviteCode) : null,
        createdAt: voyage.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    console.error('[Voyages API] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
