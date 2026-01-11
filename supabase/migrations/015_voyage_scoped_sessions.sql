-- Migration: 015_voyage_scoped_sessions
-- Purpose: Allow one active session per user per voyage context
--
-- Previously: idx_sessions_active_user only allowed ONE active session per user total
-- Now: Allow one active session per user per voyage (community_id)
--      - Personal session: community_id IS NULL
--      - Voyage session: community_id = voyage.id

-- =============================================================================
-- FIX: Update unique constraint to support voyage-scoped sessions
-- =============================================================================

-- Drop the old constraint
DROP INDEX IF EXISTS idx_sessions_active_user;

-- Create new constraint that allows one active session per user per voyage context
-- Uses COALESCE to handle NULL community_id (personal sessions)
CREATE UNIQUE INDEX idx_sessions_active_user
  ON public.sessions(user_id, COALESCE(community_id, '00000000-0000-0000-0000-000000000000'))
  WHERE status = 'active';

-- Add comment explaining the constraint
COMMENT ON INDEX idx_sessions_active_user IS
  'Ensures at most one active session per user per voyage context. Personal sessions (community_id IS NULL) use a sentinel UUID.';
