-- Add progress column to agent_tasks for realtime UI updates
-- Enables TaskCard to show live progress during background agent execution

ALTER TABLE agent_tasks
ADD COLUMN progress JSONB;

-- Progress shape: { stage: string, found?: number, processed?: number, percent?: number }
COMMENT ON COLUMN agent_tasks.progress IS 'Live progress updates: { stage: "searching"|"analyzing"|"clustering"|"synthesizing", found?: number, percent?: number }';
