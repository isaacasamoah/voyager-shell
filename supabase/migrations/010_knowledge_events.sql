-- =============================================================================
-- Migration 010: Knowledge Events (Event-Sourced)
-- =============================================================================
--
-- Philosophy: "Curation is subtraction, not extraction"
-- - Messages ARE the knowledge — preserved exactly as source events
-- - Classifications are METADATA on source events, not separate extracted entities
-- - Quiet the noise (is_active=false), don't extract the signal
-- - Nothing is deleted. Ever. Just attention changes.
--
-- Architecture:
--   knowledge_events  → Append-only event stream (source of truth)
--   knowledge_current → Computed state for fast queries (keyed by source event_id)
--
-- Event Types:
--   SOURCE:      message, document, slack_message, jira_update, explicit
--   ATTENTION:   quieted, activated, pinned, unpinned, importance_changed
--   UNDERSTAND:  summary, connection, superseded
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Event Stream Table (Append-Only, Source of Truth)
-- =============================================================================

CREATE TABLE public.knowledge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_num BIGSERIAL,  -- Global ordering for event replay

  -- Scope (personal OR voyage, never both)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- Personal knowledge
  voyage_slug TEXT,  -- Voyage/crew knowledge (future: FK to voyages table)

  -- Event classification
  event_type TEXT NOT NULL,
  -- Source events: 'message', 'document', 'slack_message', 'jira_update', 'explicit'
  -- Attention events: 'quieted', 'activated', 'pinned', 'unpinned', 'importance_changed'
  -- Understanding events: 'summary', 'connection', 'superseded'

  -- Content (for source events - THE ACTUAL KNOWLEDGE, preserved exactly)
  content TEXT,

  -- Metadata (varies by event type)
  -- Source events: { classifications: [], entities: [], topics: [], session_id, message_id }
  -- Attention events: { target_id, reason, previous_value }
  -- Understanding events: { references: [event_ids], summary_type }
  metadata JSONB DEFAULT '{}',

  -- Provenance (where did this come from?)
  source_type TEXT,  -- 'conversation', 'slack', 'jira', 'document', 'explicit', 'system'
  source_ref JSONB,  -- Deep link: { session_id, message_id } or { slack_channel, ts } etc.

  -- Actor (who created this event?)
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'user',  -- 'user', 'voyager', 'system', 'pipeline'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_scope CHECK (
    (user_id IS NOT NULL AND voyage_slug IS NULL) OR
    (user_id IS NULL AND voyage_slug IS NOT NULL) OR
    (user_id IS NOT NULL AND voyage_slug IS NOT NULL)  -- User context within voyage
  ),
  CONSTRAINT valid_event_type CHECK (
    event_type IN (
      -- Source events
      'message', 'document', 'slack_message', 'jira_update', 'explicit',
      -- Attention events
      'quieted', 'activated', 'pinned', 'unpinned', 'importance_changed',
      -- Understanding events
      'summary', 'connection', 'superseded'
    )
  ),
  CONSTRAINT source_has_content CHECK (
    event_type NOT IN ('message', 'document', 'slack_message', 'jira_update', 'explicit')
    OR content IS NOT NULL
  )
);

-- Comments for documentation
COMMENT ON TABLE public.knowledge_events IS 'Append-only event stream. Messages ARE knowledge. Never delete, only quiet.';
COMMENT ON COLUMN public.knowledge_events.sequence_num IS 'Global ordering for event replay and consistency';
COMMENT ON COLUMN public.knowledge_events.content IS 'The actual knowledge content, preserved exactly as original';
COMMENT ON COLUMN public.knowledge_events.metadata IS 'Classifications, entities, topics (for source); target_id (for attention)';

-- =============================================================================
-- STEP 2: Current State Table (Computed View for Fast Queries)
-- =============================================================================

CREATE TABLE public.knowledge_current (
  -- Key: source event ID (the source event IS the knowledge)
  event_id UUID PRIMARY KEY REFERENCES public.knowledge_events(id) ON DELETE CASCADE,

  -- Scope (denormalized for queries)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  voyage_slug TEXT,

  -- Content (denormalized for search)
  content TEXT NOT NULL,

  -- Classifications as searchable arrays (extracted from metadata)
  classifications TEXT[] DEFAULT '{}',  -- ['decision', 'fact', 'procedure']
  entities TEXT[] DEFAULT '{}',          -- ['PostgreSQL', 'Sarah']
  topics TEXT[] DEFAULT '{}',            -- ['database', 'infrastructure']

  -- Attention state (computed from attention events)
  is_active BOOLEAN DEFAULT TRUE,     -- FALSE = quieted (noise, not signal)
  is_pinned BOOLEAN DEFAULT FALSE,    -- TRUE = elevated importance
  importance FLOAT DEFAULT 0.5,       -- 0.0-1.0, adjustable via importance_changed

  -- Graph connections (from 'connection' events)
  connected_to UUID[] DEFAULT '{}',   -- Related knowledge event IDs

  -- Semantic search (async, nullable initially - computed by embedder pipeline)
  embedding vector(1536),             -- text-embedding-3-small dimensions

  -- Timestamps
  source_created_at TIMESTAMPTZ NOT NULL,  -- When the original content was created
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.knowledge_current IS 'Computed current state. Keyed by source event. Updates via trigger on knowledge_events.';
COMMENT ON COLUMN public.knowledge_current.is_active IS 'FALSE = quieted (noise). Still searchable, but not surfaced by default.';
COMMENT ON COLUMN public.knowledge_current.embedding IS 'Computed async by embedder pipeline. NULL until processed.';

-- =============================================================================
-- STEP 3: Indexes for Performance
-- =============================================================================

-- Event stream indexes
CREATE INDEX idx_events_sequence ON public.knowledge_events(sequence_num);
CREATE INDEX idx_events_user_time ON public.knowledge_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_events_voyage_time ON public.knowledge_events(voyage_slug, created_at DESC) WHERE voyage_slug IS NOT NULL;
CREATE INDEX idx_events_type ON public.knowledge_events(event_type);
CREATE INDEX idx_events_source ON public.knowledge_events(source_type) WHERE source_type IS NOT NULL;

-- Current state indexes for retrieval
CREATE INDEX idx_current_user_active ON public.knowledge_current(user_id, is_active, importance DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_current_voyage_active ON public.knowledge_current(voyage_slug, is_active, importance DESC)
  WHERE voyage_slug IS NOT NULL;
CREATE INDEX idx_current_pinned ON public.knowledge_current(user_id, is_pinned)
  WHERE is_pinned = TRUE;

-- GIN indexes for array searches
CREATE INDEX idx_current_classifications ON public.knowledge_current USING GIN(classifications);
CREATE INDEX idx_current_entities ON public.knowledge_current USING GIN(entities);
CREATE INDEX idx_current_topics ON public.knowledge_current USING GIN(topics);

-- Vector similarity index (HNSW for fast approximate search)
-- Using HNSW over IVFFlat: 15x faster, no rebuilding needed
CREATE INDEX idx_current_embedding ON public.knowledge_current
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- STEP 4: Row Level Security
-- =============================================================================

ALTER TABLE public.knowledge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_current ENABLE ROW LEVEL SECURITY;

-- Knowledge events: Users can view/create their own personal knowledge
CREATE POLICY "Users can view own knowledge events" ON public.knowledge_events
  FOR SELECT USING (
    user_id = auth.uid() OR
    voyage_slug IN (
      -- Future: Check voyage membership
      -- For now, allow if user has any messages in a session (basic access)
      SELECT DISTINCT s.community_id::text
      FROM public.sessions s
      WHERE s.user_id = auth.uid() AND s.community_id IS NOT NULL
    )
  );

CREATE POLICY "Users can create own knowledge events" ON public.knowledge_events
  FOR INSERT WITH CHECK (
    actor_id = auth.uid() AND (
      user_id = auth.uid() OR
      voyage_slug IN (
        SELECT DISTINCT s.community_id::text
        FROM public.sessions s
        WHERE s.user_id = auth.uid() AND s.community_id IS NOT NULL
      )
    )
  );

-- System/pipeline can insert with service role (handled by SECURITY DEFINER functions)

-- Knowledge current: Same access pattern
CREATE POLICY "Users can view own current knowledge" ON public.knowledge_current
  FOR SELECT USING (
    user_id = auth.uid() OR
    voyage_slug IN (
      SELECT DISTINCT s.community_id::text
      FROM public.sessions s
      WHERE s.user_id = auth.uid() AND s.community_id IS NOT NULL
    )
  );

-- Current table is only modified via trigger, no direct insert/update policies needed
-- Trigger runs with SECURITY DEFINER

-- =============================================================================
-- STEP 5: State Computation Trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_knowledge_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID;
  v_classifications TEXT[];
  v_entities TEXT[];
  v_topics TEXT[];
BEGIN
  -- ==========================================================================
  -- SOURCE EVENTS: Create knowledge_current row (the content IS the knowledge)
  -- ==========================================================================
  IF NEW.event_type IN ('message', 'document', 'slack_message', 'jira_update', 'explicit') THEN
    -- Parse classifications from metadata
    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'classifications')),
      '{}'::TEXT[]
    ) INTO v_classifications;

    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'entities')),
      '{}'::TEXT[]
    ) INTO v_entities;

    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'topics')),
      '{}'::TEXT[]
    ) INTO v_topics;

    INSERT INTO public.knowledge_current (
      event_id, user_id, voyage_slug, content,
      classifications, entities, topics,
      is_active, is_pinned, importance,
      source_created_at, updated_at
    ) VALUES (
      NEW.id, NEW.user_id, NEW.voyage_slug, NEW.content,
      v_classifications, v_entities, v_topics,
      TRUE, FALSE, 0.5,  -- Default attention state
      NEW.created_at, NOW()
    );

  -- ==========================================================================
  -- ATTENTION EVENTS: Update knowledge_current state
  -- ==========================================================================
  ELSIF NEW.event_type = 'quieted' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET is_active = FALSE, updated_at = NOW()
    WHERE event_id = v_target_id;

  ELSIF NEW.event_type = 'activated' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET is_active = TRUE, updated_at = NOW()
    WHERE event_id = v_target_id;

  ELSIF NEW.event_type = 'pinned' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET is_pinned = TRUE, is_active = TRUE, updated_at = NOW()
    WHERE event_id = v_target_id;

  ELSIF NEW.event_type = 'unpinned' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET is_pinned = FALSE, updated_at = NOW()
    WHERE event_id = v_target_id;

  ELSIF NEW.event_type = 'importance_changed' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET importance = COALESCE((NEW.metadata->>'new_importance')::FLOAT, importance),
        updated_at = NOW()
    WHERE event_id = v_target_id;

  -- ==========================================================================
  -- UNDERSTANDING EVENTS: Update graph connections
  -- ==========================================================================
  ELSIF NEW.event_type = 'connection' THEN
    -- Add bidirectional connection
    UPDATE public.knowledge_current
    SET connected_to = array_append(
          array_remove(connected_to, (NEW.metadata->>'to_id')::UUID),  -- Dedupe
          (NEW.metadata->>'to_id')::UUID
        ),
        updated_at = NOW()
    WHERE event_id = (NEW.metadata->>'from_id')::UUID;

    -- Also add reverse connection
    UPDATE public.knowledge_current
    SET connected_to = array_append(
          array_remove(connected_to, (NEW.metadata->>'from_id')::UUID),
          (NEW.metadata->>'from_id')::UUID
        ),
        updated_at = NOW()
    WHERE event_id = (NEW.metadata->>'to_id')::UUID;

  -- ELSIF NEW.event_type = 'superseded' THEN
    -- Future: Mark old understanding as stale
    -- v_target_id := (NEW.metadata->>'target_id')::UUID;
    -- UPDATE knowledge_current SET superseded_by = NEW.id WHERE event_id = v_target_id;

  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_knowledge_event_insert
  AFTER INSERT ON public.knowledge_events
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_knowledge_event();

COMMENT ON FUNCTION public.apply_knowledge_event IS 'Computes knowledge_current state from event stream';

-- =============================================================================
-- STEP 6: Search Knowledge RPC Function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding vector(1536),
  p_user_id UUID DEFAULT NULL,
  p_voyage_slug TEXT DEFAULT NULL,
  p_include_quiet BOOLEAN DEFAULT FALSE,
  p_classifications TEXT[] DEFAULT NULL,
  p_min_importance FLOAT DEFAULT 0.0,
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  event_id UUID,
  content TEXT,
  classifications TEXT[],
  entities TEXT[],
  topics TEXT[],
  is_active BOOLEAN,
  is_pinned BOOLEAN,
  importance FLOAT,
  connected_to UUID[],
  source_created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.event_id,
    kc.content,
    kc.classifications,
    kc.entities,
    kc.topics,
    kc.is_active,
    kc.is_pinned,
    kc.importance,
    kc.connected_to,
    kc.source_created_at,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.knowledge_current kc
  WHERE
    -- Scope filter (personal or voyage)
    (
      (p_user_id IS NOT NULL AND kc.user_id = p_user_id) OR
      (p_voyage_slug IS NOT NULL AND kc.voyage_slug = p_voyage_slug)
    )
    -- Attention filter (exclude quiet unless requested)
    AND (p_include_quiet = TRUE OR kc.is_active = TRUE)
    -- Importance filter
    AND kc.importance >= p_min_importance
    -- Classification filter (optional)
    AND (p_classifications IS NULL OR kc.classifications && p_classifications)
    -- Embedding must exist
    AND kc.embedding IS NOT NULL
    -- Similarity threshold
    AND (1 - (kc.embedding <=> query_embedding)) > p_match_threshold
  ORDER BY
    -- Pinned first, then by similarity weighted by importance
    kc.is_pinned DESC,
    (1 - (kc.embedding <=> query_embedding)) * (0.7 + 0.3 * kc.importance) DESC
  LIMIT p_match_count;
END;
$$;

COMMENT ON FUNCTION public.search_knowledge IS 'Semantic search over knowledge. Respects attention state (quiet vs active).';

-- =============================================================================
-- STEP 7: Helper Functions
-- =============================================================================

-- Create a source knowledge event (for messages, explicit remembering)
CREATE OR REPLACE FUNCTION public.create_knowledge_event(
  p_event_type TEXT,
  p_content TEXT,
  p_user_id UUID DEFAULT NULL,
  p_voyage_slug TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_source_type TEXT DEFAULT 'conversation',
  p_source_ref JSONB DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_actor UUID;
BEGIN
  -- Default actor to current user
  v_actor := COALESCE(p_actor_id, auth.uid());

  INSERT INTO public.knowledge_events (
    event_type, content, user_id, voyage_slug,
    metadata, source_type, source_ref,
    actor_id, actor_type
  ) VALUES (
    p_event_type, p_content, p_user_id, p_voyage_slug,
    p_metadata, p_source_type, p_source_ref,
    v_actor, CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Quiet a knowledge event (curation by subtraction)
CREATE OR REPLACE FUNCTION public.quiet_knowledge(
  p_target_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target RECORD;
BEGIN
  -- Verify target exists and user has access
  SELECT user_id, voyage_slug INTO v_target
  FROM public.knowledge_current
  WHERE event_id = p_target_id;

  IF v_target IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check ownership (personal knowledge)
  IF v_target.user_id IS NOT NULL AND v_target.user_id != auth.uid() THEN
    RETURN FALSE;
  END IF;

  -- Create quieted event
  INSERT INTO public.knowledge_events (
    event_type, user_id, voyage_slug,
    metadata, actor_id, actor_type
  ) VALUES (
    'quieted', v_target.user_id, v_target.voyage_slug,
    jsonb_build_object('target_id', p_target_id, 'reason', p_reason),
    auth.uid(), 'user'
  );

  RETURN TRUE;
END;
$$;

-- Pin a knowledge event (elevate importance)
CREATE OR REPLACE FUNCTION public.pin_knowledge(
  p_target_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target RECORD;
BEGIN
  SELECT user_id, voyage_slug INTO v_target
  FROM public.knowledge_current
  WHERE event_id = p_target_id;

  IF v_target IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_target.user_id IS NOT NULL AND v_target.user_id != auth.uid() THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.knowledge_events (
    event_type, user_id, voyage_slug,
    metadata, actor_id, actor_type
  ) VALUES (
    'pinned', v_target.user_id, v_target.voyage_slug,
    jsonb_build_object('target_id', p_target_id, 'reason', p_reason),
    auth.uid(), 'user'
  );

  RETURN TRUE;
END;
$$;

-- Update embedding for a knowledge event (called by embedder pipeline)
CREATE OR REPLACE FUNCTION public.update_knowledge_embedding(
  p_event_id UUID,
  p_embedding vector(1536)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.knowledge_current
  SET embedding = p_embedding, updated_at = NOW()
  WHERE event_id = p_event_id;

  RETURN FOUND;
END;
$$;

-- Get knowledge needing embeddings (for async embedder job)
CREATE OR REPLACE FUNCTION public.get_knowledge_pending_embedding(
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  content TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT kc.event_id, kc.content
  FROM public.knowledge_current kc
  WHERE kc.embedding IS NULL
  ORDER BY kc.source_created_at DESC
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- STEP 8: Grant Permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.search_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_knowledge_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.quiet_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION public.pin_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_knowledge_embedding TO service_role;
GRANT EXECUTE ON FUNCTION public.get_knowledge_pending_embedding TO service_role;

-- =============================================================================
-- STEP 9: Integration with Existing Messages Table
-- =============================================================================
--
-- Future migration will add a trigger on public.messages to auto-create
-- knowledge events for new messages. For now, this is handled in application code.
--
-- The flow:
-- 1. User sends message → saved to messages table
-- 2. Application calls create_knowledge_event() with message content
-- 3. Classifier pipeline enriches metadata (classifications, entities)
-- 4. Embedder pipeline generates embedding
--
-- This keeps the core schema simple and allows iterative enhancement.
-- =============================================================================

-- Add tracking column to messages for knowledge event linkage (optional)
-- This is informational only - the knowledge_events.source_ref contains the link
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'messages'
    AND column_name = 'knowledge_event_id'
  ) THEN
    ALTER TABLE public.messages
    ADD COLUMN knowledge_event_id UUID REFERENCES public.knowledge_events(id);

    COMMENT ON COLUMN public.messages.knowledge_event_id IS
      'Links to knowledge_events for traceability. Set by application after event creation.';
  END IF;
END $$;
