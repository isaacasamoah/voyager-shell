-- Migration: 011_voyages.sql
-- Creates the voyages (communities) structure
-- A voyage is a shared space for collaboration with roles

-- =============================================================================
-- VOYAGES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS voyages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,  -- URL-friendly identifier (e.g., 'voyager-v2')
  name TEXT NOT NULL,         -- Display name (e.g., 'Voyager V2')
  description TEXT,           -- What this voyage is about

  -- Settings
  is_public BOOLEAN NOT NULL DEFAULT false,  -- Can anyone join?
  settings JSONB NOT NULL DEFAULT '{}',      -- Voyage-specific settings

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- VOYAGE MEMBERS TABLE
-- =============================================================================

CREATE TYPE voyage_role AS ENUM ('captain', 'navigator', 'crew', 'observer');

CREATE TABLE IF NOT EXISTS voyage_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voyage_id UUID NOT NULL REFERENCES voyages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  role voyage_role NOT NULL DEFAULT 'crew',

  -- Member settings
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user can only be in a voyage once
  UNIQUE(voyage_id, user_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_voyages_slug ON voyages(slug);
CREATE INDEX idx_voyage_members_user ON voyage_members(user_id);
CREATE INDEX idx_voyage_members_voyage ON voyage_members(voyage_id);
CREATE INDEX idx_voyage_members_role ON voyage_members(voyage_id, role);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get a user's role in a voyage
CREATE OR REPLACE FUNCTION get_voyage_role(p_voyage_slug TEXT, p_user_id UUID)
RETURNS voyage_role AS $$
  SELECT vm.role
  FROM voyage_members vm
  JOIN voyages v ON v.id = vm.voyage_id
  WHERE v.slug = p_voyage_slug AND vm.user_id = p_user_id;
$$ LANGUAGE SQL STABLE;

-- Check if user is captain of a voyage
CREATE OR REPLACE FUNCTION is_voyage_captain(p_voyage_slug TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM voyage_members vm
    JOIN voyages v ON v.id = vm.voyage_id
    WHERE v.slug = p_voyage_slug
      AND vm.user_id = p_user_id
      AND vm.role = 'captain'
  );
$$ LANGUAGE SQL STABLE;

-- Get all voyages for a user
CREATE OR REPLACE FUNCTION get_user_voyages(p_user_id UUID)
RETURNS TABLE (
  voyage_id UUID,
  slug TEXT,
  name TEXT,
  role voyage_role,
  joined_at TIMESTAMPTZ
) AS $$
  SELECT v.id, v.slug, v.name, vm.role, vm.joined_at
  FROM voyages v
  JOIN voyage_members vm ON vm.voyage_id = v.id
  WHERE vm.user_id = p_user_id
  ORDER BY vm.joined_at DESC;
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE voyages ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_members ENABLE ROW LEVEL SECURITY;

-- Voyages: Members can see voyages they're in, public voyages are visible to all
CREATE POLICY "Members can view their voyages" ON voyages
  FOR SELECT USING (
    is_public = true OR
    EXISTS (
      SELECT 1 FROM voyage_members vm
      WHERE vm.voyage_id = id AND vm.user_id = auth.uid()
    )
  );

-- Voyages: Only captains can update
CREATE POLICY "Captains can update voyages" ON voyages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM voyage_members vm
      WHERE vm.voyage_id = id AND vm.user_id = auth.uid() AND vm.role = 'captain'
    )
  );

-- Voyage members: Members can see other members in their voyages
CREATE POLICY "Members can view voyage members" ON voyage_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM voyage_members vm
      WHERE vm.voyage_id = voyage_id AND vm.user_id = auth.uid()
    )
  );

-- Voyage members: Captains can manage members
CREATE POLICY "Captains can manage members" ON voyage_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM voyage_members vm
      WHERE vm.voyage_id = voyage_id AND vm.user_id = auth.uid() AND vm.role = 'captain'
    )
  );
