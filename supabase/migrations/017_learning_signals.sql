-- Learning signals for conversation improvement
-- Tracks corrections, re-explanations, and other signals to measure quality

CREATE TABLE IF NOT EXISTS learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('correction', 're-explanation', 'clarification', 'frustration', 'positive')),
  conversation_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  message_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voyage_slug TEXT REFERENCES voyages(slug) ON DELETE SET NULL,
  context TEXT, -- Snippet of what triggered the signal
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for querying by user/voyage
CREATE INDEX idx_learning_signals_user ON learning_signals(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_learning_signals_voyage ON learning_signals(voyage_slug) WHERE voyage_slug IS NOT NULL;
CREATE INDEX idx_learning_signals_created ON learning_signals(created_at);
CREATE INDEX idx_learning_signals_type ON learning_signals(type);

-- RLS policies
ALTER TABLE learning_signals ENABLE ROW LEVEL SECURITY;

-- Users can read their own signals
CREATE POLICY "Users can read own signals" ON learning_signals
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for admin operations)
CREATE POLICY "Service role full access" ON learning_signals
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE learning_signals IS 'Tracks user signals (corrections, re-explanations) to improve conversation quality';
COMMENT ON COLUMN learning_signals.type IS 'Signal type: correction (clarity failure), re-explanation (continuity failure), etc.';
COMMENT ON COLUMN learning_signals.context IS 'Snippet of the message that triggered the signal';
