-- Slice 2: Memory System Schema
-- Semantic memory layer with vector embeddings for personalization

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Memory types enum
CREATE TYPE memory_type AS ENUM (
  'fact',       -- Factual information about the user (e.g., "works at Acme Corp")
  'preference', -- User preferences (e.g., "prefers concise responses")
  'entity',     -- Named entities the user cares about (e.g., "Project Alpha")
  'decision',   -- Decisions made (e.g., "chose React over Vue")
  'event'       -- Time-based events (e.g., "started new job in January")
);

-- User memory table (semantic layer)
CREATE TABLE public.user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type memory_type NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- text-embedding-3-small dimensions

  -- Confidence & lifecycle
  confidence FLOAT DEFAULT 1.0,   -- How confident we are in this memory (0-1)
  importance FLOAT DEFAULT 0.5,   -- How important this memory is (0-1)

  -- Provenance
  source_type TEXT DEFAULT 'conversation', -- Where this memory came from
  source_session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  access_count INT DEFAULT 0,

  -- Soft delete / supersession (for memory updates)
  superseded_by UUID REFERENCES public.user_memory(id),
  is_active BOOLEAN DEFAULT TRUE
);

-- HNSW index for fast similarity search
-- HNSW is preferred over IVFFlat: 15x faster, no rebuilding needed
-- m=16: connections per node (higher = more accurate, more memory)
-- ef_construction=64: build-time search breadth
CREATE INDEX idx_memory_embedding ON public.user_memory
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Query performance indexes
CREATE INDEX idx_memory_user ON public.user_memory(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_memory_type ON public.user_memory(user_id, type) WHERE is_active = TRUE;
CREATE INDEX idx_memory_importance ON public.user_memory(user_id, importance DESC) WHERE is_active = TRUE;
CREATE INDEX idx_memory_created ON public.user_memory(created_at DESC);
CREATE INDEX idx_memory_accessed ON public.user_memory(last_accessed DESC);

-- Enable Row Level Security
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own memories
CREATE POLICY "Users can manage own memories" ON public.user_memory
  FOR ALL USING (auth.uid() = user_id);

-- Function to search memories by embedding similarity
CREATE OR REPLACE FUNCTION public.search_memories(
  query_embedding vector(1536),
  match_user_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  type memory_type,
  content TEXT,
  confidence FLOAT,
  importance FLOAT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.type,
    m.content,
    m.confidence,
    m.importance,
    (1 - (m.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.user_memory m
  WHERE m.user_id = match_user_id
    AND m.is_active = TRUE
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_embedding)) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to update access tracking (for memory decay calculations)
CREATE OR REPLACE FUNCTION public.touch_memory(memory_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_memory
  SET last_accessed = NOW(),
      access_count = access_count + 1
  WHERE id = memory_id
    AND user_id = auth.uid(); -- RLS check
END;
$$;

-- Function to supersede a memory (when updating facts)
CREATE OR REPLACE FUNCTION public.supersede_memory(
  old_memory_id UUID,
  new_content TEXT,
  new_embedding vector(1536),
  new_importance FLOAT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_memory RECORD;
  new_id UUID;
BEGIN
  -- Get old memory and verify ownership
  SELECT * INTO old_memory
  FROM public.user_memory
  WHERE id = old_memory_id
    AND user_id = auth.uid()
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Memory not found or not owned by user';
  END IF;

  -- Create new memory
  INSERT INTO public.user_memory (
    user_id, type, content, embedding, confidence, importance, source_type, source_session_id
  )
  VALUES (
    old_memory.user_id,
    old_memory.type,
    new_content,
    new_embedding,
    old_memory.confidence,
    COALESCE(new_importance, old_memory.importance),
    old_memory.source_type,
    old_memory.source_session_id
  )
  RETURNING id INTO new_id;

  -- Mark old memory as superseded
  UPDATE public.user_memory
  SET is_active = FALSE,
      superseded_by = new_id
  WHERE id = old_memory_id;

  RETURN new_id;
END;
$$;

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION public.search_memories TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_memory TO authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_memory TO authenticated;
