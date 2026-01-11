-- Migration: 014_voyage_updates.sql
-- Adds invite codes to voyages and voyage_id to knowledge_events

-- =============================================================================
-- INVITE CODES FOR VOYAGES
-- =============================================================================

-- Add invite_code column for shareable join links
ALTER TABLE voyages ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Add created_by to track voyage creator
ALTER TABLE voyages ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- Function to generate short invite codes
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
  SELECT substr(md5(random()::text || clock_timestamp()::text), 1, 8);
$$ LANGUAGE SQL VOLATILE;

-- Auto-generate invite code on voyage creation
CREATE OR REPLACE FUNCTION handle_new_voyage()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate invite code if not provided
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS on_voyage_created ON voyages;

CREATE TRIGGER on_voyage_created
  BEFORE INSERT ON voyages
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_voyage();

-- =============================================================================
-- VOYAGE SCOPING FOR KNOWLEDGE
-- =============================================================================

-- Note: knowledge_events already has voyage_slug column from migration 010
-- We just need an index for efficient voyage knowledge queries
CREATE INDEX IF NOT EXISTS idx_knowledge_events_voyage_slug ON knowledge_events(voyage_slug)
  WHERE voyage_slug IS NOT NULL;

-- Add voyage_slug index to knowledge_current as well
CREATE INDEX IF NOT EXISTS idx_knowledge_current_voyage_slug ON knowledge_current(voyage_slug)
  WHERE voyage_slug IS NOT NULL;

-- =============================================================================
-- HELPER FUNCTIONS FOR VOYAGES
-- =============================================================================

-- Get voyage by invite code
CREATE OR REPLACE FUNCTION get_voyage_by_invite_code(p_invite_code TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  description TEXT
) AS $$
  SELECT v.id, v.slug, v.name, v.description
  FROM voyages v
  WHERE v.invite_code = p_invite_code;
$$ LANGUAGE SQL STABLE;

-- Join voyage via invite code
CREATE OR REPLACE FUNCTION join_voyage_by_code(p_invite_code TEXT, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_voyage_id UUID;
BEGIN
  -- Get voyage ID from invite code
  SELECT id INTO v_voyage_id
  FROM voyages
  WHERE invite_code = p_invite_code;

  IF v_voyage_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM voyage_members
    WHERE voyage_id = v_voyage_id AND user_id = p_user_id
  ) THEN
    RETURN v_voyage_id; -- Already a member, just return voyage ID
  END IF;

  -- Add as crew member
  INSERT INTO voyage_members (voyage_id, user_id, role)
  VALUES (v_voyage_id, p_user_id, 'crew');

  RETURN v_voyage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create voyage with creator as captain
CREATE OR REPLACE FUNCTION create_voyage_with_captain(
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_voyage_id UUID;
BEGIN
  -- Create the voyage
  INSERT INTO voyages (name, slug, description, created_by)
  VALUES (p_name, p_slug, p_description, p_user_id)
  RETURNING id INTO v_voyage_id;

  -- Add creator as captain
  INSERT INTO voyage_members (voyage_id, user_id, role)
  VALUES (v_voyage_id, p_user_id, 'captain');

  RETURN v_voyage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Regenerate invite code (captain only)
CREATE OR REPLACE FUNCTION regenerate_voyage_invite(p_voyage_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_new_code TEXT;
BEGIN
  -- Verify user is captain
  IF NOT EXISTS (
    SELECT 1 FROM voyage_members
    WHERE voyage_id = p_voyage_id
      AND user_id = p_user_id
      AND role = 'captain'
  ) THEN
    RETURN NULL;
  END IF;

  -- Generate new code
  v_new_code := generate_invite_code();

  -- Update voyage
  UPDATE voyages
  SET invite_code = v_new_code
  WHERE id = p_voyage_id;

  RETURN v_new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- RLS POLICY UPDATES
-- =============================================================================

-- Allow authenticated users to create voyages
DROP POLICY IF EXISTS "Users can create voyages" ON voyages;
CREATE POLICY "Users can create voyages" ON voyages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to insert themselves as members (for joining)
DROP POLICY IF EXISTS "Users can join voyages" ON voyage_members;
CREATE POLICY "Users can join voyages" ON voyage_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION generate_invite_code TO authenticated;
GRANT EXECUTE ON FUNCTION get_voyage_by_invite_code TO authenticated;
GRANT EXECUTE ON FUNCTION join_voyage_by_code TO authenticated;
GRANT EXECUTE ON FUNCTION create_voyage_with_captain TO authenticated;
GRANT EXECUTE ON FUNCTION regenerate_voyage_invite TO authenticated;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN voyages.invite_code IS 'Shareable code for joining the voyage';
COMMENT ON COLUMN voyages.created_by IS 'User who created this voyage';
COMMENT ON FUNCTION join_voyage_by_code IS 'Join a voyage using an invite code, returns voyage_id';
COMMENT ON FUNCTION create_voyage_with_captain IS 'Create a voyage and add creator as captain';
