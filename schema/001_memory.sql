-- =============================================================================
-- VOYAGER V2: USER MEMORY SCHEMA
-- =============================================================================
-- Personal memory layer for Voyager. This is what Voyager "knows" about you.
--
-- Design principles:
--   1. Memory is personal and private (RLS enforced)
--   2. Fast retrieval via combined scoring (semantic + recency + importance)
--   3. Memory evolves (superseding, confidence, decay)
--   4. Everything is traceable (source, created, accessed)
--
-- Memory types:
--   - fact: Persistent truths ("Isaac prefers terse responses")
--   - preference: How you like things ("Uses vim keybindings")
--   - entity: People, projects, topics you've mentioned
--   - summary: Compressed conversation history
--   - insight: Inferred connections between memories
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- CORE MEMORY TABLE
-- =============================================================================
-- Each row is a discrete piece of memory about a user.
-- This is the "what Voyager learns from your conversations" layer.

CREATE TABLE user_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Memory classification
    memory_type TEXT NOT NULL CHECK (memory_type IN (
        'fact',        -- Persistent truths: "Works at Acme Corp"
        'preference',  -- How they like things: "Prefers bullet points"
        'entity',      -- People/projects/topics: "Project X is the mobile app"
        'summary',     -- Compressed conversation history
        'insight'      -- Inferred connections: "Often discusses X with Y"
    )),

    -- Core content
    content TEXT NOT NULL,              -- The memory itself (human-readable)
    embedding VECTOR(1536),             -- For semantic search (text-embedding-3-small)

    -- Scoring factors for retrieval
    importance FLOAT DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
        -- 0.0 = trivial mention
        -- 0.5 = normal
        -- 1.0 = critical (user explicitly emphasized)

    confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
        -- 0.0 = uncertain inference
        -- 0.8 = standard extraction
        -- 1.0 = user explicitly confirmed

    -- Lifecycle tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,       -- Updated when retrieved in conversation
    access_count INT DEFAULT 0,         -- How often this memory is used

    -- Superseding (memory evolution)
    superseded_by UUID REFERENCES user_memory(id),
    superseded_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,     -- FALSE when superseded

    -- Source tracking (where did this memory come from?)
    source_type TEXT NOT NULL CHECK (source_type IN (
        'conversation',     -- Extracted from chat
        'onboarding',       -- From initial setup
        'integration',      -- From connected tool (Slack, Drive, etc.)
        'inference',        -- Agent inferred from patterns
        'user_confirmed'    -- User explicitly stated/confirmed
    )),
    source_conversation_id UUID,        -- Which conversation (if applicable)
    source_metadata JSONB DEFAULT '{}', -- Additional source context

    -- Entity linking (for entity-type memories)
    entity_type TEXT,                   -- 'person', 'project', 'tool', 'topic', 'company'
    entity_name TEXT,                   -- Canonical name for the entity
    entity_aliases TEXT[],              -- Alternative names/spellings

    -- Categorization for filtering
    categories TEXT[] DEFAULT '{}',     -- ['work', 'personal', 'technical', 'communication']
    tags TEXT[] DEFAULT '{}',           -- Freeform tags for grouping

    -- Quality control
    flagged_for_review BOOLEAN DEFAULT FALSE,
    review_reason TEXT
);

-- =============================================================================
-- MEMORY RELATIONSHIPS
-- =============================================================================
-- Connect memories to each other (entity mentions facts, insights link concepts)

CREATE TABLE memory_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    source_memory_id UUID NOT NULL REFERENCES user_memory(id) ON DELETE CASCADE,
    target_memory_id UUID NOT NULL REFERENCES user_memory(id) ON DELETE CASCADE,

    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'mentions',     -- Entity mentions fact: "Isaac → prefers terminal UI"
        'relates_to',   -- General connection: "Project X → uses React"
        'contradicts',  -- Conflicting info (flagged for resolution)
        'supports',     -- Reinforcing evidence
        'supersedes'    -- New info replaces old
    )),

    strength FLOAT DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),
        -- How strong is this relationship?

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(source_memory_id, target_memory_id, relationship_type)
);

-- =============================================================================
-- CONVERSATION SUMMARIES
-- =============================================================================
-- Compressed history of conversations for long-term context.
-- More structured than memory_type='summary' for batch retrieval.

CREATE TABLE conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,      -- Links to conversations table

    -- Summary content
    summary TEXT NOT NULL,              -- Compressed conversation essence
    key_points TEXT[],                  -- Bullet points of main topics
    entities_mentioned TEXT[],          -- People/projects/topics discussed
    decisions_made TEXT[],              -- Any decisions or commitments

    -- Embedding for semantic retrieval
    embedding VECTOR(1536),

    -- Metadata
    message_count INT NOT NULL,         -- How many messages were summarized
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,

    -- Community context (if conversation was in a community)
    community_id UUID REFERENCES communities(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- MEMORY RETRIEVAL LOG
-- =============================================================================
-- Track when memories are accessed. Used for:
--   1. Updating last_accessed_at
--   2. Learning which memories are valuable
--   3. Quartermaster signal collection

CREATE TABLE memory_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memory_id UUID NOT NULL REFERENCES user_memory(id) ON DELETE CASCADE,

    -- Context of access
    conversation_id UUID,               -- Which conversation triggered retrieval
    query_text TEXT,                    -- What the user asked
    retrieval_method TEXT NOT NULL CHECK (retrieval_method IN (
        'semantic',     -- Vector similarity search
        'entity',       -- Entity name lookup
        'recency',      -- Recent memories
        'related'       -- Followed relationship edge
    )),

    -- Quality signals for Quartermaster
    was_useful BOOLEAN,                 -- Did the agent actually use this?
    similarity_score FLOAT,             -- How close was the semantic match?

    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Fast user-scoped queries (most common pattern)
CREATE INDEX idx_memory_user_active ON user_memory(user_id, is_active)
    WHERE is_active = TRUE;

-- Semantic search with vector similarity
CREATE INDEX idx_memory_embedding ON user_memory
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Entity lookup (quick access to "who is X?")
CREATE INDEX idx_memory_entity ON user_memory(user_id, entity_type, entity_name)
    WHERE memory_type = 'entity' AND is_active = TRUE;

-- GIN index for tag/category filtering
CREATE INDEX idx_memory_categories ON user_memory USING gin(categories);
CREATE INDEX idx_memory_tags ON user_memory USING gin(tags);

-- Recency-based retrieval
CREATE INDEX idx_memory_recency ON user_memory(user_id, created_at DESC)
    WHERE is_active = TRUE;

-- Access patterns (for importance scoring)
CREATE INDEX idx_memory_access ON user_memory(user_id, last_accessed_at DESC NULLS LAST, access_count DESC)
    WHERE is_active = TRUE;

-- Relationship traversal
CREATE INDEX idx_relationships_source ON memory_relationships(source_memory_id);
CREATE INDEX idx_relationships_target ON memory_relationships(target_memory_id);
CREATE INDEX idx_relationships_user ON memory_relationships(user_id);

-- Conversation summaries by time
CREATE INDEX idx_summaries_user_time ON conversation_summaries(user_id, end_time DESC);
CREATE INDEX idx_summaries_embedding ON conversation_summaries
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- Access log for analytics
CREATE INDEX idx_access_log_user_time ON memory_access_log(user_id, accessed_at DESC);
CREATE INDEX idx_access_log_memory ON memory_access_log(memory_id, accessed_at DESC);

-- =============================================================================
-- ROW-LEVEL SECURITY POLICIES
-- =============================================================================
-- Strict isolation: users can ONLY see their own memories.
-- No community sharing at the memory layer (that's what knowledge_nodes is for).

ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_access_log ENABLE ROW LEVEL SECURITY;

-- user_memory: owner-only access
CREATE POLICY "memory_owner_only" ON user_memory
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- memory_relationships: owner-only access
CREATE POLICY "relationships_owner_only" ON memory_relationships
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- conversation_summaries: owner-only access
CREATE POLICY "summaries_owner_only" ON conversation_summaries
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- memory_access_log: owner-only access
CREATE POLICY "access_log_owner_only" ON memory_access_log
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- SERVICE ROLE POLICIES
-- =============================================================================
-- Agents (running as service role) need full access for memory operations.
-- These bypass RLS when using service key.

CREATE POLICY "service_full_access_memory" ON user_memory
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_full_access_relationships" ON memory_relationships
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_full_access_summaries" ON conversation_summaries
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_full_access_log" ON memory_access_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Combined scoring function for retrieval
-- Returns score between 0 and 1, weighted by:
--   - semantic_similarity (40%)
--   - recency (30%)
--   - importance (20%)
--   - confidence (10%)
CREATE OR REPLACE FUNCTION calculate_memory_score(
    semantic_similarity FLOAT,
    created_at TIMESTAMPTZ,
    importance FLOAT,
    confidence FLOAT,
    recency_decay_days INT DEFAULT 90
) RETURNS FLOAT AS $$
DECLARE
    days_old FLOAT;
    recency_score FLOAT;
BEGIN
    -- Calculate recency score (exponential decay)
    days_old := EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0;
    recency_score := EXP(-days_old / recency_decay_days);

    -- Weighted combination
    RETURN (
        (semantic_similarity * 0.4) +
        (recency_score * 0.3) +
        (importance * 0.2) +
        (confidence * 0.1)
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update access tracking (called after retrieval)
CREATE OR REPLACE FUNCTION update_memory_access(
    p_memory_id UUID,
    p_user_id UUID,
    p_conversation_id UUID DEFAULT NULL,
    p_query_text TEXT DEFAULT NULL,
    p_retrieval_method TEXT DEFAULT 'semantic',
    p_was_useful BOOLEAN DEFAULT NULL,
    p_similarity_score FLOAT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Update the memory's access stats
    UPDATE user_memory
    SET
        last_accessed_at = NOW(),
        access_count = access_count + 1
    WHERE id = p_memory_id AND user_id = p_user_id;

    -- Log the access
    INSERT INTO memory_access_log (
        user_id, memory_id, conversation_id, query_text,
        retrieval_method, was_useful, similarity_score
    ) VALUES (
        p_user_id, p_memory_id, p_conversation_id, p_query_text,
        p_retrieval_method, p_was_useful, p_similarity_score
    );
END;
$$ LANGUAGE plpgsql;

-- Supersede a memory with a new one
CREATE OR REPLACE FUNCTION supersede_memory(
    p_old_memory_id UUID,
    p_new_memory_id UUID,
    p_user_id UUID
) RETURNS VOID AS $$
BEGIN
    -- Mark old memory as superseded
    UPDATE user_memory
    SET
        superseded_by = p_new_memory_id,
        superseded_at = NOW(),
        is_active = FALSE
    WHERE id = p_old_memory_id AND user_id = p_user_id;

    -- Create supersedes relationship
    INSERT INTO memory_relationships (
        user_id, source_memory_id, target_memory_id, relationship_type, strength
    ) VALUES (
        p_user_id, p_new_memory_id, p_old_memory_id, 'supersedes', 1.0
    ) ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- EXAMPLE QUERIES
-- =============================================================================

-- Example 1: Semantic search with combined scoring
-- "Find memories relevant to 'project deadlines'"
/*
WITH semantic_matches AS (
    SELECT
        id,
        content,
        memory_type,
        importance,
        confidence,
        created_at,
        1 - (embedding <=> $query_embedding) as similarity
    FROM user_memory
    WHERE
        user_id = $user_id
        AND is_active = TRUE
        AND embedding IS NOT NULL
    ORDER BY embedding <=> $query_embedding
    LIMIT 50
)
SELECT
    id,
    content,
    memory_type,
    similarity,
    calculate_memory_score(similarity, created_at, importance, confidence) as score
FROM semantic_matches
WHERE similarity > 0.3  -- Minimum threshold
ORDER BY score DESC
LIMIT 10;
*/

-- Example 2: Entity lookup with related facts
-- "What do I know about Project X?"
/*
WITH entity AS (
    SELECT id FROM user_memory
    WHERE
        user_id = $user_id
        AND memory_type = 'entity'
        AND entity_name ILIKE '%project x%'
        AND is_active = TRUE
    LIMIT 1
)
SELECT m.id, m.content, m.memory_type, mr.relationship_type
FROM user_memory m
LEFT JOIN memory_relationships mr ON m.id = mr.source_memory_id
WHERE
    m.user_id = $user_id
    AND m.is_active = TRUE
    AND (
        m.id = (SELECT id FROM entity)
        OR mr.target_memory_id = (SELECT id FROM entity)
    )
ORDER BY m.importance DESC, m.created_at DESC
LIMIT 20;
*/

-- Example 3: Recent memories with category filter
-- "What have I told Voyager recently about work?"
/*
SELECT id, content, memory_type, created_at
FROM user_memory
WHERE
    user_id = $user_id
    AND is_active = TRUE
    AND 'work' = ANY(categories)
    AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 10;
*/

-- Example 4: Hybrid retrieval (semantic + recency + entity)
-- Best practice for conversation context
/*
WITH semantic AS (
    SELECT id, 1 - (embedding <=> $query_embedding) as score, 'semantic' as source
    FROM user_memory
    WHERE user_id = $user_id AND is_active = TRUE
    ORDER BY embedding <=> $query_embedding
    LIMIT 20
),
recent AS (
    SELECT id, 0.8 as score, 'recent' as source
    FROM user_memory
    WHERE user_id = $user_id AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 10
),
entities AS (
    SELECT id, 0.9 as score, 'entity' as source
    FROM user_memory
    WHERE
        user_id = $user_id
        AND is_active = TRUE
        AND memory_type = 'entity'
        AND entity_name ILIKE ANY($mentioned_entities)
    LIMIT 5
)
SELECT DISTINCT ON (id) id, MAX(score) as score
FROM (
    SELECT * FROM semantic
    UNION ALL SELECT * FROM recent
    UNION ALL SELECT * FROM entities
) combined
GROUP BY id
ORDER BY id, MAX(score) DESC
LIMIT 15;
*/

-- Example 5: Find contradictions for resolution
/*
SELECT
    m1.id as memory_1,
    m1.content as content_1,
    m2.id as memory_2,
    m2.content as content_2,
    mr.created_at as flagged_at
FROM memory_relationships mr
JOIN user_memory m1 ON mr.source_memory_id = m1.id
JOIN user_memory m2 ON mr.target_memory_id = m2.id
WHERE
    mr.user_id = $user_id
    AND mr.relationship_type = 'contradicts'
    AND m1.is_active = TRUE
    AND m2.is_active = TRUE
ORDER BY mr.created_at DESC;
*/

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE user_memory IS
'Personal memory layer for Voyager. What Voyager learns from conversations with each user.
Privacy: Strictly user-scoped via RLS. Never shared with other users.
Retrieval: Combined scoring (semantic similarity + recency + importance + confidence).';

COMMENT ON COLUMN user_memory.importance IS
'How important is this memory? 0.0=trivial, 0.5=normal, 1.0=user-emphasized.
Used in retrieval scoring with 20% weight.';

COMMENT ON COLUMN user_memory.confidence IS
'How confident is Voyager in this memory? 0.0=uncertain inference, 1.0=user confirmed.
Low confidence memories may be verified with user.';

COMMENT ON COLUMN user_memory.superseded_by IS
'When memory evolves, link to the new version. Old memory stays for history but is_active=FALSE.
Enables "What did I used to think about X?" queries.';

COMMENT ON TABLE memory_relationships IS
'Graph edges between memories. Enables traversal and conflict detection.
Key types: mentions (entity->fact), relates_to (general), contradicts (needs resolution).';

COMMENT ON TABLE conversation_summaries IS
'Compressed conversation history for long-term context.
Separate from user_memory for batch retrieval of conversation context.';

COMMENT ON FUNCTION calculate_memory_score IS
'Retrieval scoring: semantic(40%) + recency(30%) + importance(20%) + confidence(10%).
Recency uses exponential decay with 90-day half-life by default.';
