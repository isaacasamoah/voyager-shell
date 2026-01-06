# Agentic Retrieval

**Status:** Future (deferred, not abandoned)
**Created:** 2026-01-06
**Last Updated:** 2026-01-06
**Depends On:** retrieval-events-logging.md, real user data

## Goal

Claude orchestrates its own retrieval. Not a fixed pipeline — the LLM decides what to search, follows graph connections, filters results, and stops when it has enough.

**From foundation.md:**
> "Build it right, collect learning data from first interaction... Emergent behavior is the goal — Claude learns retrieval strategy, we don't hardcode it."

## Why Deferred (Not Abandoned)

**The tension:**
- Foundation says "agentic from V0"
- Reality says "we have 0 users and no data"

**Decision:** Collect ground truth data with simple retrieval first. Build agentic when we can prove where simple retrieval fails.

**What we're doing instead (now):**
- `retrieval_events` logging (see: retrieval-events-logging.md)
- Semantic search + pinned + adaptive threshold
- Ship to users, observe, learn

**Trigger to revisit:**
- When retrieval_events show clear failure patterns
- When users report "Voyager doesn't remember X" despite X being in knowledge
- When graph traversal would demonstrably help (cited nodes are connected to returned nodes)

## The Vision

### Tool-Based Retrieval

Claude has tools, decides which to use:

| Tool | Loaded | Purpose |
|------|--------|---------|
| `search_knowledge` | Always | Primary semantic search |
| `get_node` | Deferred | Full node by ID |
| `get_connected` | Deferred | Follow graph edges |
| `search_by_source` | Deferred | Find by provenance |
| `search_by_time` | Deferred | Temporal queries |

### Programmatic Calling

Claude writes code to orchestrate retrieval:

```python
# Claude generates and executes this
nodes = await search_knowledge(query="pricing decisions", limit=30)
relevant = [n for n in nodes if n['importance'] > 0.7]

for node in relevant[:5]:
    connections = await get_connected(node['id'])
    if any(c['classifications'].includes('decision') for c in connections):
        print(f"Found: {node['content']}")
        break  # Stop early when enough found
```

### Benefits

| Benefit | Value |
|---------|-------|
| Multi-hop traversal | Follow graph edges iteratively |
| Early stopping | Stop when enough context found |
| Filtering in code | 37% token reduction |
| Course correction | Retry with different strategy |
| DSPy optimization | Learn which tools work for which queries |

## Technical Requirements

### Claude Agent SDK Integration

Currently using Vercel AI SDK `streamText`. Would need:

```typescript
import { Agent } from '@anthropic-ai/agent-sdk';

const agent = new Agent({
  model: 'claude-sonnet-4-20250514',
  tools: retrievalTools,
  betaHeaders: ['advanced-tool-use-2025-11-20'],
});
```

### Tool Definitions

```typescript
const retrievalTools = [
  {
    name: 'search_knowledge',
    description: 'Search personal and community knowledge by semantic similarity',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results' },
      threshold: { type: 'number', description: 'Min similarity' },
      scope: { type: 'string', enum: ['personal', 'voyage', 'all'] },
    },
  },
  {
    name: 'get_connected',
    description: 'Get knowledge nodes connected to a given node (graph traversal)',
    parameters: {
      node_id: { type: 'string', description: 'Source node event ID' },
    },
    deferredLoading: true,
  },
  // ... other tools
];
```

### Beta Features Required

- `advanced-tool-use-2025-11-20` beta header
- Tool search (BM25 + regex for discovering deferred tools)
- Programmatic tool calling (code execution container)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ User Query                                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ Claude Agent (with retrieval tools)                         │
│                                                             │
│   "I need to find pricing decisions. Let me search..."      │
│                                                             │
│   → search_knowledge("pricing decisions")                   │
│   → Found 5 results. One mentions "Nov meeting"             │
│   → get_connected(node_id) to find related decisions        │
│   → Found the full context. Stopping here.                  │
│                                                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ Response with retrieved context                             │
└─────────────────────────────────────────────────────────────┘
```

## Schema Support (Already Built)

The current schema already supports agentic retrieval:

- `knowledge_current.connected_to UUID[]` — Graph edges exist
- `getConnectedKnowledge()` — Function exists, unused
- `searchKnowledge()` — Ready to be a tool
- `getPinnedKnowledge()` — Ready to be a tool

**What's missing:**
- Tool definitions
- Agent SDK integration
- Latency/error handling
- Fallback to simple retrieval

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Latency (500ms+ per tool call) | Early stopping, parallel calls where possible |
| Cost (more tokens) | Budget limits, simple retrieval fallback |
| Complexity (error handling) | Graceful degradation to simple retrieval |
| Over-engineering | Only build when data shows need |

## DSPy Integration

With `retrieval_events` logging:

```python
# DSPy can optimize tool selection
class RetrievalOptimizer(dspy.Module):
    def forward(self, query, query_type):
        # Learn: for this query type, which tools work?
        # Positive: high citation rate
        # Negative: follow-up queries, nothing cited
        ...
```

**Training data comes from:**
- `retrieval_events.nodes_returned` — What simple retrieval returned
- `retrieval_events.nodes_cited` — What was actually useful
- Patterns: "For decision queries, graph traversal helps"

## Implementation Phases (When Ready)

### Phase 1: Single Tool
- Add `search_knowledge` as a tool
- Claude can choose to search or use existing context
- Log tool usage in retrieval_events

### Phase 2: Graph Traversal
- Add `get_connected` tool
- Multi-hop retrieval possible
- Measure latency impact

### Phase 3: Programmatic
- Enable code execution for retrieval
- Claude writes filtering/orchestration code
- Full agentic retrieval

### Phase 4: DSPy Optimization
- Use logged data to optimize tool selection
- Per-query-type strategies
- Continuous improvement

## Open Questions

- [ ] How to handle streaming with tool calls? (UX during retrieval)
- [ ] Fallback strategy when tools timeout?
- [ ] How to visualize "Voyager is thinking" for multi-hop retrieval?
- [ ] Cost model for agentic vs simple retrieval?

## References

- `~/.claude/research/voyager-v2/foundation.md` — Vision
- `~/.claude/research/voyager-v2/agentic-retrieval-research.md` — Claude SDK details
- `~/.claude/research/voyager-v2/SPEC-advanced.md` Section 15 — Spec

## Outcomes

(To be filled when implemented)

---

**Remember:** This is a goal, not a backlog item. Revisit when retrieval_events data shows where simple retrieval fails.
