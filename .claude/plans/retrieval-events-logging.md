# Retrieval Events Logging

**Status:** Draft
**Created:** 2026-01-06
**Last Updated:** 2026-01-06

## Goal

Collect ground truth data for future DSPy optimization without changing current retrieval behavior.

Every retrieval creates a training example: what we returned vs what was actually useful.

## Context

**Where we are:**
- Slice 2 knowledge foundation is ~70% complete
- Semantic search + pinned + adaptive threshold works
- No visibility into retrieval quality

**Why now:**
- DSPy optimization needs examples
- Examples need ground truth (what was cited, what was ignored)
- Can collect data with simple retrieval, optimize later
- Foundation doc: "collect learning data from first interaction"

**Why NOT agentic retrieval now:**
- No users = no data to show where simple retrieval fails
- Complexity cost is high (tool orchestration, latency, errors)
- Current retrieval is "good enough" for early users
- Agentic is documented as clear future goal (see: agentic-retrieval.md)

## What We're Capturing

| Field | Purpose | DSPy Use |
|-------|---------|----------|
| `query` | What user asked | Input |
| `nodes_returned` | What we retrieved | Candidate set |
| `nodes_cited` | What appeared in response | Positive examples |
| `follow_up_query_id` | User asked again | Negative signal |
| `latency_ms` | Performance | Optimization target |

**Ground truth signals:**
- `nodes_cited ∩ nodes_returned` = retrieval success
- `nodes_cited - nodes_returned` = retrieval missed something
- `follow_up_query` exists = user wasn't satisfied
- High latency = need optimization

## Approach

### Schema

```sql
CREATE TABLE retrieval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  user_id UUID NOT NULL REFERENCES profiles(id),
  conversation_id UUID REFERENCES conversations(id),
  voyage_slug TEXT REFERENCES voyages(slug),

  -- The query
  query TEXT NOT NULL,

  -- What we returned
  nodes_returned UUID[],           -- Event IDs from knowledge_current
  retrieval_threshold FLOAT,       -- Threshold used
  retrieval_method TEXT,           -- 'semantic', 'pinned', 'combined'
  pinned_count INTEGER,            -- How many were pinned
  search_count INTEGER,            -- How many from search

  -- Ground truth (filled after response)
  nodes_cited UUID[],              -- Which returned nodes were used
  citation_confidence FLOAT,       -- How confident in citation detection

  -- Implicit signals
  follow_up_query_id UUID REFERENCES retrieval_events(id),

  -- Metrics
  latency_ms INTEGER,
  tokens_in_context INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analysis queries
CREATE INDEX idx_retrieval_events_user ON retrieval_events(user_id);
CREATE INDEX idx_retrieval_events_created ON retrieval_events(created_at);
```

### Citation Detection

Post-response heuristic (not perfect, but gives signal):

```typescript
const detectCitations = (
  response: string,
  returnedNodes: KnowledgeNode[]
): { cited: string[], confidence: number } => {
  const cited: string[] = [];
  let matches = 0;

  for (const node of returnedNodes) {
    // Split content into meaningful chunks
    const chunks = node.content.split(/[.!?]+/).filter(c => c.length > 20);

    for (const chunk of chunks) {
      // Normalize and check for substantial overlap
      const normalized = chunk.toLowerCase().trim();
      if (response.toLowerCase().includes(normalized.slice(0, 50))) {
        cited.push(node.eventId);
        matches++;
        break;
      }
    }
  }

  // Confidence based on how clear the signal is
  const confidence = returnedNodes.length > 0
    ? matches / returnedNodes.length
    : 1.0;

  return { cited, confidence };
};
```

### Follow-up Detection

Track when user's next query is semantically similar (retry signal):

```typescript
const isFollowUp = async (
  currentQuery: string,
  previousQuery: string
): Promise<boolean> => {
  // Simple heuristic: high similarity = follow-up/retry
  const similarity = await computeSimilarity(currentQuery, previousQuery);
  return similarity > 0.7;
};
```

### Integration Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. User sends query                                     │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ 2. retrieveContext() runs                               │
│    → Start timing                                       │
│    → Get pinned + search results                        │
│    → Create retrieval_event (partial)                   │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ 3. Claude generates response                            │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ 4. onFinish callback                                    │
│    → detectCitations(response, returnedNodes)           │
│    → Update retrieval_event with nodes_cited            │
│    → Check if follow-up to previous query               │
└─────────────────────────────────────────────────────────┘
```

## Key Decisions

- **Citation detection is heuristic:** Substring matching, not LLM analysis. Good enough for signal, not perfect ground truth. Can improve later.

- **Log everything, analyze later:** Don't filter events. Let DSPy optimization find patterns.

- **Fire-and-forget logging:** Don't block response for logging. Async insert.

- **No user-facing changes:** This is invisible infrastructure. Retrieval behavior unchanged.

## Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/migrations/013_retrieval_events.sql` | New table |
| `lib/retrieval/logging.ts` | Logging service |
| `lib/retrieval/citations.ts` | Citation detection |
| `lib/retrieval/index.ts` | Add logging call |
| `app/api/chat/route.ts` | Log after response |

## Open Questions

- [ ] Should we store query embedding for future similarity analysis?
- [ ] How to handle very long responses (citation detection performance)?
- [ ] Should follow-up detection use embedding similarity or simpler heuristic?
- [ ] Retention policy for retrieval_events (keep forever for DSPy, or prune)?

## Success Criteria

After 1 week of usage:
- [ ] Can query: "What % of returned nodes get cited?"
- [ ] Can identify: "Which queries have high follow-up rate?"
- [ ] Can see: "Average retrieval latency"
- [ ] Have enough data for initial DSPy experiment

## Outcomes

(To be filled after implementation)
