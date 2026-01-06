-- Retrieval events for DSPy ground truth collection
-- Tracks what was retrieved vs what was actually useful

CREATE TABLE IF NOT EXISTS retrieval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  user_id UUID NOT NULL,
  conversation_id UUID,
  voyage_slug TEXT,

  -- The query
  query TEXT NOT NULL,

  -- What we returned
  nodes_returned UUID[],
  retrieval_threshold FLOAT,
  pinned_count INTEGER DEFAULT 0,
  search_count INTEGER DEFAULT 0,

  -- Ground truth (filled after response)
  nodes_cited UUID[],
  citation_confidence FLOAT,

  -- Metrics
  latency_ms INTEGER,
  tokens_in_context INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analysis
CREATE INDEX idx_retrieval_events_user ON retrieval_events(user_id);
CREATE INDEX idx_retrieval_events_created ON retrieval_events(created_at DESC);
CREATE INDEX idx_retrieval_events_conversation ON retrieval_events(conversation_id);

COMMENT ON TABLE retrieval_events IS 'DSPy training data: what was retrieved vs what was cited';
COMMENT ON COLUMN retrieval_events.nodes_returned IS 'Event IDs from knowledge_current that were returned';
COMMENT ON COLUMN retrieval_events.nodes_cited IS 'Which returned nodes appeared in the response (ground truth)';
COMMENT ON COLUMN retrieval_events.citation_confidence IS 'Confidence in citation detection (0-1)';
