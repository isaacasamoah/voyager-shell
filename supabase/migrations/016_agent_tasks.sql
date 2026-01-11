-- Agent Tasks Queue (Phase 2: Background Agents)
-- Pattern: Claude as Query Compiler
-- Voyager writes retrieval code, worker executes it (no LLM at runtime)

CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Task definition
  task TEXT NOT NULL,        -- Human description of what to find
  code TEXT NOT NULL,        -- Generated retrieval code (JavaScript)
  priority TEXT NOT NULL DEFAULT 'normal',  -- 'low', 'normal', 'high'

  -- Context
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  voyage_slug TEXT,
  conversation_id UUID NOT NULL,

  -- Execution
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'complete', 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Result
  result JSONB,  -- { findings: [...], confidence: number, summary?: string }
  error TEXT,

  -- Metrics
  duration_ms INT
);

-- Index for worker polling (claim next pending task)
CREATE INDEX idx_agent_tasks_pending
  ON agent_tasks (priority DESC, created_at ASC)
  WHERE status = 'pending';

-- Index for conversation lookup (get tasks for a conversation)
CREATE INDEX idx_agent_tasks_conversation
  ON agent_tasks (conversation_id, created_at DESC);

-- Index for user's tasks
CREATE INDEX idx_agent_tasks_user
  ON agent_tasks (user_id, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_agent_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_tasks_updated_at
  BEFORE UPDATE ON agent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_tasks_updated_at();

-- Enable RLS
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tasks
CREATE POLICY agent_tasks_user_policy ON agent_tasks
  FOR ALL
  USING (auth.uid() = user_id);

-- Service role can do everything (for worker)
CREATE POLICY agent_tasks_service_policy ON agent_tasks
  FOR ALL
  USING (auth.role() = 'service_role');

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE agent_tasks;

-- Comment for documentation
COMMENT ON TABLE agent_tasks IS 'Background agent task queue. Voyager generates retrieval code, worker executes it.';
COMMENT ON COLUMN agent_tasks.code IS 'JavaScript code using retrieval functions: semanticSearch, keywordGrep, getConnected, searchByTime, getNodes';
COMMENT ON COLUMN agent_tasks.result IS 'Execution result: { findings: KnowledgeNode[], confidence: number, summary?: string }';
