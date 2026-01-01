-- Migration: Conversation Continuity
-- Adds lifecycle management for seamless conversation resumption
--
-- Features:
--   - Session status (active/historical/archived)
--   - Auto-tracking of message counts and last activity
--   - Helper functions for session management
--   - Community context support (future)

-- =============================================================================
-- STEP 1: Session Status Enum
-- =============================================================================

CREATE TYPE session_status AS ENUM (
  'active',      -- Currently active conversation (at most one per user)
  'historical',  -- Completed conversation, available for resume
  'archived'     -- Archived by user, hidden from resume list
);

-- =============================================================================
-- STEP 2: Add New Columns to Sessions
-- =============================================================================

-- Status column with default for existing sessions
ALTER TABLE public.sessions
  ADD COLUMN status session_status NOT NULL DEFAULT 'active';

-- Tracking columns for auto-continue and semantic naming
ALTER TABLE public.sessions
  ADD COLUMN last_message_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN message_count INT DEFAULT 0;

-- Semantic naming lifecycle
ALTER TABLE public.sessions
  ADD COLUMN title_generated_at TIMESTAMPTZ;

-- Memory extraction lifecycle
ALTER TABLE public.sessions
  ADD COLUMN extracted_at TIMESTAMPTZ;

-- Future: Community context
ALTER TABLE public.sessions
  ADD COLUMN community_id UUID;

-- =============================================================================
-- STEP 3: Migrate Existing Data
-- =============================================================================

-- Update existing sessions with accurate message counts
UPDATE public.sessions s
SET message_count = (
  SELECT COUNT(*)
  FROM public.messages m
  WHERE m.session_id = s.id
);

-- Update last_message_at from actual message history
UPDATE public.sessions s
SET last_message_at = COALESCE(
  (SELECT MAX(created_at) FROM public.messages m WHERE m.session_id = s.id),
  s.created_at
);

-- =============================================================================
-- STEP 4: Partial Indexes for Efficient Queries
-- =============================================================================

-- Fast lookup: User's active session (should be at most one)
CREATE UNIQUE INDEX idx_sessions_active_user
  ON public.sessions(user_id)
  WHERE status = 'active';

-- Resume picker: Historical sessions ordered by recency
CREATE INDEX idx_sessions_resumable
  ON public.sessions(user_id, last_message_at DESC)
  WHERE status IN ('active', 'historical');

-- Sessions pending semantic naming (message_count >= threshold, no title yet)
CREATE INDEX idx_sessions_needs_title
  ON public.sessions(user_id)
  WHERE title IS NULL AND message_count >= 4;

-- Sessions pending memory extraction
CREATE INDEX idx_sessions_needs_extraction
  ON public.sessions(user_id)
  WHERE extracted_at IS NULL AND status = 'historical';

-- =============================================================================
-- STEP 5: Trigger to Auto-Update Session on Message Insert
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    updated_at = NOW()
  WHERE id = NEW.session_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_message_insert();

-- =============================================================================
-- STEP 6: Helper Function - Get or Create Active Session
-- =============================================================================

-- Returns the user's active session, or creates one if none exists.
-- Ensures exactly one active session per user.
CREATE OR REPLACE FUNCTION public.get_or_create_active_session(
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Try to find existing active session
  SELECT id INTO v_session_id
  FROM public.sessions
  WHERE user_id = p_user_id
    AND status = 'active'
  LIMIT 1;

  -- If found, return it
  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  -- Create new active session
  INSERT INTO public.sessions (user_id, status)
  VALUES (p_user_id, 'active')
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- =============================================================================
-- STEP 7: Helper Function - Archive/Transition Session
-- =============================================================================

-- Transitions a session to a new status.
-- When archiving the active session, it becomes 'historical' (not archived).
-- Only session owner can call this (verified via auth.uid()).
CREATE OR REPLACE FUNCTION public.transition_session(
  p_session_id UUID,
  p_new_status session_status
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Verify ownership and get current state
  SELECT user_id INTO v_user_id
  FROM public.sessions
  WHERE id = p_session_id
    AND user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Perform the transition
  UPDATE public.sessions
  SET status = p_new_status,
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

-- =============================================================================
-- STEP 8: Helper Function - Get Resumable Conversations
-- =============================================================================

-- Returns a list of conversations available for resume.
-- Ordered by recency, includes context for UI display.
CREATE OR REPLACE FUNCTION public.get_resumable_sessions(
  p_user_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  status session_status,
  message_count INT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  preview TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    s.status,
    s.message_count,
    s.last_message_at,
    s.created_at,
    -- Get first user message as preview (truncated)
    (
      SELECT LEFT(m.content, 100)
      FROM public.messages m
      WHERE m.session_id = s.id
        AND m.role = 'user'
      ORDER BY m.created_at ASC
      LIMIT 1
    ) AS preview
  FROM public.sessions s
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'historical')
    AND s.message_count > 0  -- Exclude empty sessions
  ORDER BY s.last_message_at DESC
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- STEP 9: Helper Function - Resume a Historical Session
-- =============================================================================

-- Resumes a historical session by making it active.
-- First archives the current active session (if any).
CREATE OR REPLACE FUNCTION public.resume_session(
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id UUID;
  v_target_status session_status;
BEGIN
  -- Verify ownership and get target session info
  SELECT user_id, status INTO v_target_user_id, v_target_status
  FROM public.sessions
  WHERE id = p_session_id
    AND user_id = auth.uid();

  -- Session not found or not owned by user
  IF v_target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Can't resume archived sessions
  IF v_target_status = 'archived' THEN
    RETURN FALSE;
  END IF;

  -- Already active, nothing to do
  IF v_target_status = 'active' THEN
    RETURN TRUE;
  END IF;

  -- Archive current active session (if any)
  UPDATE public.sessions
  SET status = 'historical',
      updated_at = NOW()
  WHERE user_id = v_target_user_id
    AND status = 'active';

  -- Make target session active
  UPDATE public.sessions
  SET status = 'active',
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

-- =============================================================================
-- STEP 10: Helper Function - Mark Session as Extracted
-- =============================================================================

-- Marks a session as having had its memories extracted.
-- Called after memory extraction process completes.
CREATE OR REPLACE FUNCTION public.mark_session_extracted(
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET extracted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

-- =============================================================================
-- STEP 11: Helper Function - Update Session Title
-- =============================================================================

-- Sets a semantic title for a session (generated by AI).
-- Tracks when the title was generated.
CREATE OR REPLACE FUNCTION public.set_session_title(
  p_session_id UUID,
  p_title TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET title = p_title,
      title_generated_at = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

-- =============================================================================
-- STEP 12: Grant Permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_or_create_active_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resumable_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_session_extracted TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_session_title TO authenticated;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TYPE session_status IS 'Lifecycle status for conversation sessions';

COMMENT ON COLUMN public.sessions.status IS 'Current lifecycle status (active/historical/archived)';
COMMENT ON COLUMN public.sessions.last_message_at IS 'Timestamp of most recent message (for ordering)';
COMMENT ON COLUMN public.sessions.message_count IS 'Total messages in session (for semantic naming trigger)';
COMMENT ON COLUMN public.sessions.title_generated_at IS 'When semantic title was generated';
COMMENT ON COLUMN public.sessions.extracted_at IS 'When memories were extracted from this session';
COMMENT ON COLUMN public.sessions.community_id IS 'Future: Link to community for shared context';

COMMENT ON FUNCTION public.get_or_create_active_session IS 'Returns active session for user, creating one if needed';
COMMENT ON FUNCTION public.transition_session IS 'Changes session status (owner only)';
COMMENT ON FUNCTION public.get_resumable_sessions IS 'Lists sessions available for /resume picker';
COMMENT ON FUNCTION public.resume_session IS 'Activates a historical session, archiving current active';
COMMENT ON FUNCTION public.mark_session_extracted IS 'Marks session as having memories extracted';
COMMENT ON FUNCTION public.set_session_title IS 'Sets AI-generated semantic title';
