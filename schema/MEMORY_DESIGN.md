# User Memory Schema Design

## Overview

The memory schema implements Voyager's "knows you" layer - persistent personal memory that enables Voyager to remember facts, preferences, and context across conversations.

**Key principle:** Memory is strictly private. RLS enforces that users can only access their own memories. The knowledge graph (`knowledge_nodes`) handles shared/community knowledge.

## Schema Files

| File | Purpose |
|------|---------|
| `001_memory.sql` | Core SQL schema, indexes, RLS policies, helper functions |
| `001_memory.types.ts` | TypeScript types for application code |

## Tables

### `user_memory`

The core memory table. Each row is a discrete piece of information about a user.

**Memory Types:**
- `fact` - Persistent truths: "Works at Acme Corp", "Has a dog named Max"
- `preference` - How they like things: "Prefers terse responses", "Uses vim keybindings"
- `entity` - People/projects/topics they reference: "Project X is the mobile app"
- `summary` - Compressed conversation history (for context)
- `insight` - Inferred connections: "Often discusses pricing with Sarah"

**Key Columns:**
- `content` - Human-readable memory text
- `embedding` - Vector for semantic search (1536 dimensions, text-embedding-3-small)
- `importance` - 0.0 to 1.0, how significant this memory is
- `confidence` - 0.0 to 1.0, how certain Voyager is about this
- `is_active` - FALSE when superseded by newer memory
- `source_type` - Where the memory came from (conversation, onboarding, integration, inference)

### `memory_relationships`

Graph edges between memories. Enables traversal and conflict detection.

**Relationship Types:**
- `mentions` - Entity mentions a fact: "Sarah → works on pricing"
- `relates_to` - General connection between concepts
- `contradicts` - Conflicting information (flagged for resolution)
- `supports` - Reinforcing evidence
- `supersedes` - New info replaces old

### `conversation_summaries`

Compressed conversation history for long-term context. More structured than individual summary memories.

### `memory_access_log`

Tracks when memories are retrieved. Used for:
1. Updating `last_accessed_at` and `access_count`
2. Quartermaster signal collection (learning which memories are valuable)
3. Analytics

## Retrieval Strategy

### Combined Scoring

Memories are scored using a weighted combination:

| Factor | Weight | Purpose |
|--------|--------|---------|
| Semantic similarity | 40% | Relevance to the query |
| Recency | 30% | Favor recent memories (exponential decay, 90-day half-life) |
| Importance | 20% | User-emphasized or critical information |
| Confidence | 10% | Verified vs. inferred |

```sql
score = (semantic * 0.4) + (recency * 0.3) + (importance * 0.2) + (confidence * 0.1)
```

### Query Patterns

**1. Semantic Search (most common)**
```sql
-- Find memories relevant to "project deadlines"
SELECT id, content, calculate_memory_score(similarity, created_at, importance, confidence)
FROM user_memory
WHERE user_id = $user_id AND is_active = TRUE
ORDER BY embedding <=> $query_embedding
LIMIT 10;
```

**2. Entity Lookup**
```sql
-- "What do I know about Project X?"
SELECT * FROM user_memory
WHERE user_id = $user_id
  AND memory_type = 'entity'
  AND entity_name ILIKE '%project x%';
```

**3. Hybrid Retrieval (recommended for conversation context)**
Combine semantic matches, recent memories, and entity mentions, then deduplicate.

**4. Relationship Traversal**
```sql
-- Get facts related to an entity
SELECT m.* FROM user_memory m
JOIN memory_relationships mr ON m.id = mr.source_memory_id
WHERE mr.target_memory_id = $entity_id AND mr.relationship_type = 'mentions';
```

## Memory Lifecycle

### Creation
Memories are created from:
1. **Conversation extraction** - Agent identifies facts/preferences during chat
2. **Onboarding** - Initial setup conversation
3. **Integration sync** - Connected tools (Slack, Drive)
4. **Inference** - Agent observes patterns

### Evolution (Superseding)
When information changes:
1. Create new memory with updated content
2. Call `supersede_memory(old_id, new_id, user_id)`
3. Old memory marked `is_active = FALSE` but retained for history

### Confidence Updates
Low-confidence memories can be verified:
- Quartermaster may prompt: "You mentioned X - is that still true?"
- User confirmation upgrades `confidence` to 1.0

### Contradiction Resolution
When `contradicts` relationships are detected:
1. Flag both memories for review
2. Surface to user: "I have conflicting info about X - which is current?"
3. Resolution creates `supersedes` edge

## Privacy Model

**Strict user-scoping via RLS:**
```sql
CREATE POLICY "memory_owner_only" ON user_memory
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
```

- Users can ONLY see their own memories
- No cross-user leakage at the database layer
- Service role (agents) has full access for operations
- Audit trail via `memory_access_log`

## Performance Considerations

### Indexes
- `ivfflat` for vector similarity (efficient approximate search)
- Composite indexes for common queries (user + active + type)
- GIN indexes for array columns (categories, tags)
- Recency index for time-based queries

### Scaling Notes
- `ivfflat` index with `lists = 100` works well up to ~1M vectors
- For larger scale, consider `hnsw` index or dedicated vector store
- Access log should be partitioned by time for large deployments

## Integration with Knowledge Graph

Memory layer (personal) vs. Knowledge layer (shared):

| Layer | Table | Scope | Purpose |
|-------|-------|-------|---------|
| Memory | `user_memory` | User only | What Voyager knows about you |
| Knowledge | `knowledge_nodes` | Community/shared | Curated domain knowledge |

The retrieval agent queries both:
1. Personal memory for user context
2. Community knowledge for domain expertise
3. Combined in the prompt composition stack

## Example: Retrieval Agent Flow

```typescript
async function retrieveContext(userId: string, query: string): Promise<RetrievalResult> {
  // 1. Generate query embedding
  const embedding = await embed(query)

  // 2. Semantic search
  const semanticMatches = await supabase
    .from('user_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('embedding', { ascending: true, foreignTable: embedding })
    .limit(20)

  // 3. Extract mentioned entities from query
  const entities = extractEntities(query) // e.g., ["Project X", "Sarah"]

  // 4. Entity lookup
  const entityMatches = await supabase
    .from('user_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('memory_type', 'entity')
    .in('entity_name', entities)

  // 5. Recent memories (last 7 days)
  const recentMatches = await supabase
    .from('user_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  // 6. Score and deduplicate
  const scored = scoreAndDeduplicate([
    ...semanticMatches,
    ...entityMatches,
    ...recentMatches,
  ])

  // 7. Log access for Quartermaster
  await logAccess(userId, scored.map(m => m.id), query)

  return { memories: scored.slice(0, 15) }
}
```

## Future Enhancements

1. **Memory compaction** - Summarize old memories to reduce storage
2. **Per-community memory** - Separate memories for different contexts
3. **Memory export** - "What do you know about me?" with full export
4. **Memory deletion** - User control to delete specific memories
5. **Collaborative memory** - Shared memories in trusted relationships
