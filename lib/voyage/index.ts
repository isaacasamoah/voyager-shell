// Voyage service for Slice 4: First Community
// Manages voyages (communities), membership, and configuration

import { getAdminClient } from '@/lib/supabase/admin';
import type { VoyageConfig } from '@/lib/prompts/types';
import type {
  Voyage,
  VoyageMember,
  VoyageMembership,
  VoyageRole,
  CreateVoyageInput,
  UpdateVoyageInput,
  VoyageRow,
  VoyageMemberRow,
  UserVoyageRow,
} from './types';

// Re-export types
export * from './types';

// Admin client for voyage operations (team management, cross-user queries)
// Note: User membership checks use userId in params
const getAdminSupabase = () => getAdminClient();

// =============================================================================
// TRANSFORM FUNCTIONS
// =============================================================================

const transformVoyage = (row: VoyageRow): Voyage => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  isPublic: row.is_public,
  inviteCode: row.invite_code,
  config: row.settings as VoyageConfig | null,
  createdBy: row.created_by,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const transformMember = (row: VoyageMemberRow & { profiles?: { email?: string; display_name?: string } }): VoyageMember => ({
  id: row.id,
  voyageId: row.voyage_id,
  userId: row.user_id,
  role: row.role,
  notificationsEnabled: row.notifications_enabled,
  joinedAt: new Date(row.joined_at),
  email: row.profiles?.email,
  displayName: row.profiles?.display_name,
});

const transformMembership = (row: UserVoyageRow): VoyageMembership => ({
  voyageId: row.voyage_id,
  slug: row.slug,
  name: row.name,
  role: row.role,
  joinedAt: new Date(row.joined_at),
});

// =============================================================================
// VOYAGE CRUD
// =============================================================================

/**
 * Create a new voyage with the creator as captain.
 */
export const createVoyage = async (
  input: CreateVoyageInput,
  userId: string
): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Creating voyage:', input.name, 'by user:', userId);

  try {
    // Use the database function that creates voyage + adds captain
    
    const { data: voyageId, error: createError } = await (supabase as any).rpc(
      'create_voyage_with_captain',
      {
        p_name: input.name,
        p_slug: input.slug,
        p_description: input.description || null,
        p_user_id: userId,
      }
    );

    if (createError) {
      console.error('[Voyage] Create error:', createError);
      return null;
    }

    if (!voyageId) {
      console.error('[Voyage] No voyage ID returned');
      return null;
    }

    // Fetch the created voyage
    return getVoyageById(voyageId);
  } catch (error) {
    console.error('[Voyage] createVoyage error:', error);
    return null;
  }
};

/**
 * Get a voyage by its ID.
 */
export const getVoyageById = async (voyageId: string): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();

  try {
    
    const { data, error } = await (supabase as any)
      .from('voyages')
      .select('*')
      .eq('id', voyageId)
      .single();

    if (error) {
      console.error('[Voyage] getVoyageById error:', error);
      return null;
    }

    return transformVoyage(data as VoyageRow);
  } catch (error) {
    console.error('[Voyage] getVoyageById error:', error);
    return null;
  }
};

/**
 * Get a voyage by its slug.
 */
export const getVoyageBySlug = async (slug: string): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Getting voyage by slug:', slug);

  try {
    
    const { data, error } = await (supabase as any)
      .from('voyages')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      console.error('[Voyage] getVoyageBySlug error:', error);
      return null;
    }

    return transformVoyage(data as VoyageRow);
  } catch (error) {
    console.error('[Voyage] getVoyageBySlug error:', error);
    return null;
  }
};

/**
 * Update a voyage's settings.
 */
export const updateVoyage = async (
  voyageId: string,
  input: UpdateVoyageInput
): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Updating voyage:', voyageId);

  try {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isPublic !== undefined) updates.is_public = input.isPublic;
    if (input.config !== undefined) {
      // Merge with existing config
      const current = await getVoyageById(voyageId);
      updates.settings = { ...current?.config, ...input.config };
    }

    
    const { data, error } = await (supabase as any)
      .from('voyages')
      .update(updates)
      .eq('id', voyageId)
      .select()
      .single();

    if (error) {
      console.error('[Voyage] updateVoyage error:', error);
      return null;
    }

    return transformVoyage(data as VoyageRow);
  } catch (error) {
    console.error('[Voyage] updateVoyage error:', error);
    return null;
  }
};

// =============================================================================
// USER VOYAGES
// =============================================================================

/**
 * Get all voyages a user is a member of.
 */
export const getUserVoyages = async (userId: string): Promise<VoyageMembership[]> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Getting voyages for user:', userId);

  try {
    
    const { data, error } = await (supabase as any).rpc('get_user_voyages', {
      p_user_id: userId,
    });

    if (error) {
      console.error('[Voyage] getUserVoyages error:', error);
      return [];
    }

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return (data as UserVoyageRow[]).map(transformMembership);
  } catch (error) {
    console.error('[Voyage] getUserVoyages error:', error);
    return [];
  }
};

/**
 * Get a user's role in a voyage.
 */
export const getUserRole = async (
  voyageSlug: string,
  userId: string
): Promise<VoyageRole | null> => {
  const supabase = getAdminSupabase();

  try {
    
    const { data, error } = await (supabase as any).rpc('get_voyage_role', {
      p_voyage_slug: voyageSlug,
      p_user_id: userId,
    });

    if (error) {
      console.error('[Voyage] getUserRole error:', error);
      return null;
    }

    return data as VoyageRole | null;
  } catch (error) {
    console.error('[Voyage] getUserRole error:', error);
    return null;
  }
};

/**
 * Check if user is captain of a voyage.
 */
export const isCaptain = async (voyageSlug: string, userId: string): Promise<boolean> => {
  const supabase = getAdminSupabase();

  try {
    
    const { data, error } = await (supabase as any).rpc('is_voyage_captain', {
      p_voyage_slug: voyageSlug,
      p_user_id: userId,
    });

    if (error) {
      console.error('[Voyage] isCaptain error:', error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error('[Voyage] isCaptain error:', error);
    return false;
  }
};

// =============================================================================
// MEMBERSHIP
// =============================================================================

/**
 * Get all members of a voyage.
 */
export const getVoyageMembers = async (voyageId: string): Promise<VoyageMember[]> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Getting members for voyage:', voyageId);

  try {
    
    const { data, error } = await (supabase as any)
      .from('voyage_members')
      .select(`
        *,
        profiles:user_id (
          email,
          display_name
        )
      `)
      .eq('voyage_id', voyageId)
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('[Voyage] getVoyageMembers error:', error);
      return [];
    }

    return (data as (VoyageMemberRow & { profiles: { email: string; display_name: string } })[])
      .map(transformMember);
  } catch (error) {
    console.error('[Voyage] getVoyageMembers error:', error);
    return [];
  }
};

/**
 * Update a member's role in a voyage.
 */
export const updateMemberRole = async (
  voyageId: string,
  userId: string,
  newRole: VoyageRole
): Promise<boolean> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Updating member role:', userId, 'to', newRole);

  try {
    
    const { error } = await (supabase as any)
      .from('voyage_members')
      .update({ role: newRole })
      .eq('voyage_id', voyageId)
      .eq('user_id', userId);

    if (error) {
      console.error('[Voyage] updateMemberRole error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Voyage] updateMemberRole error:', error);
    return false;
  }
};

// =============================================================================
// INVITE MANAGEMENT
// =============================================================================

/**
 * Join a voyage using an invite code.
 */
export const joinVoyageByCode = async (
  inviteCode: string,
  userId: string
): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Joining voyage with code:', inviteCode);

  try {
    // Use the database function
    
    const { data: voyageId, error } = await (supabase as any).rpc('join_voyage_by_code', {
      p_invite_code: inviteCode,
      p_user_id: userId,
    });

    if (error) {
      console.error('[Voyage] joinVoyageByCode error:', error);
      return null;
    }

    if (!voyageId) {
      console.log('[Voyage] Invalid invite code');
      return null;
    }

    // Fetch the voyage
    return getVoyageById(voyageId);
  } catch (error) {
    console.error('[Voyage] joinVoyageByCode error:', error);
    return null;
  }
};

/**
 * Get voyage by invite code (for preview before joining).
 */
export const getVoyageByInviteCode = async (inviteCode: string): Promise<Voyage | null> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Looking up voyage by invite code:', inviteCode);

  try {
    
    const { data, error } = await (supabase as any)
      .from('voyages')
      .select('*')
      .eq('invite_code', inviteCode)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[Voyage] getVoyageByInviteCode error:', error);
      return null;
    }

    return transformVoyage(data as VoyageRow);
  } catch (error) {
    console.error('[Voyage] getVoyageByInviteCode error:', error);
    return null;
  }
};

/**
 * Regenerate a voyage's invite code (captain only).
 */
export const regenerateInviteCode = async (
  voyageId: string,
  userId: string
): Promise<string | null> => {
  const supabase = getAdminSupabase();
  console.log('[Voyage] Regenerating invite code for voyage:', voyageId);

  try {
    
    const { data, error } = await (supabase as any).rpc('regenerate_voyage_invite', {
      p_voyage_id: voyageId,
      p_user_id: userId,
    });

    if (error) {
      console.error('[Voyage] regenerateInviteCode error:', error);
      return null;
    }

    return data as string | null;
  } catch (error) {
    console.error('[Voyage] regenerateInviteCode error:', error);
    return null;
  }
};

/**
 * Get the full invite URL for a voyage.
 */
export const getInviteUrl = (inviteCode: string): string => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/join/${inviteCode}`;
};

// =============================================================================
// SLUG UTILITIES
// =============================================================================

/**
 * Generate a URL-friendly slug from a name.
 */
export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
};

/**
 * Check if a slug is available.
 */
export const isSlugAvailable = async (slug: string): Promise<boolean> => {
  const voyage = await getVoyageBySlug(slug);
  return voyage === null;
};
