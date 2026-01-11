// Voyage types for Slice 4

import type { VoyageConfig } from '@/lib/prompts/types';

// =============================================================================
// VOYAGE ROLES
// =============================================================================

export type VoyageRole = 'captain' | 'navigator' | 'crew' | 'observer';

// =============================================================================
// VOYAGE ENTITIES
// =============================================================================

export interface Voyage {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  inviteCode: string | null;
  config: VoyageConfig | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VoyageMember {
  id: string;
  voyageId: string;
  userId: string;
  role: VoyageRole;
  notificationsEnabled: boolean;
  joinedAt: Date;
  // Joined profile info
  email?: string;
  displayName?: string;
}

export interface VoyageMembership {
  voyageId: string;
  slug: string;
  name: string;
  role: VoyageRole;
  joinedAt: Date;
}

// =============================================================================
// API TYPES
// =============================================================================

export interface CreateVoyageInput {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateVoyageInput {
  name?: string;
  description?: string;
  config?: Partial<VoyageConfig>;
  isPublic?: boolean;
}

export interface VoyageWithMembers extends Voyage {
  members: VoyageMember[];
  memberCount: number;
}

// =============================================================================
// DATABASE ROW TYPES (from Supabase)
// =============================================================================

export interface VoyageRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_public: boolean;
  invite_code: string | null;
  settings: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoyageMemberRow {
  id: string;
  voyage_id: string;
  user_id: string;
  role: VoyageRole;
  notifications_enabled: boolean;
  settings: Record<string, unknown> | null;
  joined_at: string;
}

export interface UserVoyageRow {
  voyage_id: string;
  slug: string;
  name: string;
  role: VoyageRole;
  joined_at: string;
}
