# Voyager Architecture

Deep dive for contributors. Start here if you want to understand how Voyager thinks.

## The Core Insight

Most AI assistants retrieve context through fixed pipelines: embed query → vector search → stuff into prompt. This works for simple lookups but fails for real collaboration where context is messy, interconnected, and evolves.

**Voyager's approach**: Give the AI retrieval *tools* and let it decide the strategy.

```
User: "What did we decide about pricing?"

Fixed Pipeline:
  → embed("pricing decisions") → top 5 vectors → hope for the best

Voyager:
  → Claude thinks: "pricing decision" is conceptual, start semantic
  → semantic_search("pricing decisions") → finds cluster about pricing
  → get_connected(node_id) → follows graph to related decisions
  → keyword_grep("$79") → pinpoints exact price mentioned
  → Claude: "On Nov 12, you decided $79/mo after comparing to Competitor Y..."
```

The AI chains strategies based on what it finds. This is the "beating heart."

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Client (Next.js App Router)                                        │
│  └── VoyagerInterface.tsx                                           │
│      ├── Terminal UI with streaming                                 │
│      ├── Command handling (/new, /resume, /voyages, etc.)          │
│      └── Message queue (type while AI thinks)                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API Layer                                                          │
│  └── /api/chat/route.ts                                             │
│      ├── Compose system prompt (core + voyage + user + context)     │
│      ├── Attach retrieval tools                                     │
│      ├── Stream response with tool calling                          │
│      └── Emit knowledge events (real-time capture)                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│  Retrieval Tools     │ │  Knowledge Layer │ │  Prompt Composition  │
│  (lib/retrieval/)    │ │  (lib/knowledge/)│ │  (lib/prompts/)      │
│                      │ │                  │ │                      │
│  • semantic_search   │ │  • Event-sourced │ │  • Core personality  │
│  • keyword_grep      │ │  • Graph edges   │ │  • Voyage context    │
│  • get_connected     │ │  • Embeddings    │ │  • User preferences  │
│  • search_by_time    │ │  • Scoped by     │ │  • Retrieved context │
│                      │ │    user/voyage   │ │                      │
└──────────────────────┘ └──────────────────┘ └──────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Supabase (PostgreSQL + pgvector)                                   │
│  ├── knowledge_events (append-only, immutable source of truth)      │
│  ├── knowledge_current (computed state with embeddings)             │
│  ├── conversations / messages                                       │
│  ├── voyages / voyage_members                                       │
│  └── users / profiles                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Knowledge System (Event-Sourced)

### Philosophy

Everything is an event. Nothing is deleted. Curation is subtraction.

```sql
-- Source of truth (append-only)
knowledge_events:
  id              UUID PRIMARY KEY
  event_type      TEXT  -- 'message', 'decision', 'fact', 'preference', etc.
  content         TEXT  -- The actual knowledge
  source_type     TEXT  -- 'conversation', 'import', 'manual'
  source_id       TEXT  -- Reference to source (conversation_id, etc.)
  user_id         UUID  -- Owner
  voyage_slug     TEXT  -- NULL = personal, otherwise voyage-scoped
  metadata        JSONB -- Flexible structured data
  created_at      TIMESTAMPTZ

-- Computed state (materialized for fast queries)
knowledge_current:
  event_id        UUID REFERENCES knowledge_events
  content         TEXT
  embedding       vector(1536)  -- OpenAI text-embedding-3-small
  is_active       BOOLEAN       -- FALSE = "quieted" (soft delete)
  is_pinned       BOOLEAN       -- TRUE = always include in context
  connected_to    UUID[]        -- Graph edges to related knowledge
  user_id         UUID
  voyage_slug     TEXT
```

### Why Event-Sourced?

1. **Audit trail**: Every change is traceable
2. **Time travel**: Reconstruct state at any point
3. **Conflict-free**: Append-only = no merge conflicts in collaborative contexts
4. **Curation without loss**: "Quiet" nodes instead of deleting

### Graph Edges

Knowledge nodes connect to related nodes via `connected_to`. Edges are created:
- **Explicitly**: User says "this relates to X"
- **Automatically**: Entity extraction finds shared entities (people, projects, concepts)

The `get_connected` tool traverses these edges to find related context.

---

## Retrieval Tools

Located in `lib/retrieval/tools.ts`. Claude decides when and how to use these.

### semantic_search

```typescript
semantic_search({
  query: "pricing discussions",
  scope: "all",      // "personal" | "community" | "all"
  limit: 10,
  threshold: 0.5     // Similarity threshold
})
```

Best for: Conceptual queries, don't know exact terms, exploring a topic.

### keyword_grep

```typescript
keyword_grep({
  pattern: "$79",     // Exact string or regex
  caseSensitive: false,
  limit: 20
})
```

Best for: Exact terms, names, numbers, quotes. Precision over recall.

### get_connected

```typescript
get_connected({
  nodeId: "abc12345",  // Short ID from previous result
  depth: 1             // How many hops to traverse
})
```

Best for: Following relationships from a found node. "What else relates to this?"

### search_by_time

```typescript
search_by_time({
  start: "2024-01-01",
  end: "2024-01-31",
  limit: 20
})
```

Best for: Temporal queries. "What did we discuss last week?"

### Strategy Chains

The prompt guides Claude to chain strategies:

```
semantic → get_connected → keyword_grep
(concept → context → precision)

search_by_time → semantic
(when → what)
```

---

## Voyage Scoping

Voyages are collaborative spaces. Knowledge is scoped:

- **Personal** (`voyage_slug = NULL`): Only you see it
- **Voyage** (`voyage_slug = 'sophiie'`): Everyone in the voyage sees it

When you're in a voyage context:
- Messages are tagged with the voyage
- Retrieval searches both personal AND voyage knowledge
- Decisions and facts become shared team memory

```typescript
// In chat route
const { systemPrompt } = await composeSystemPrompt(
  userId,
  queryText,
  { voyageSlug: 'sophiie' }  // Scopes retrieval
)

// In retrieval tools
const retrievalTools = createRetrievalTools({
  userId,
  voyageSlug: 'sophiie',  // Scopes all tool calls
})
```

---

## Prompt Architecture

Located in `lib/prompts/`. Modular composition with token budgeting.

```
┌─────────────────────────────────────────┐
│  Core Prompt (~450 tokens)              │  ← Identity, capabilities, principles
│  └── lib/prompts/core.ts                │     Never changes
└─────────────────────────────────────────┘
                    +
┌─────────────────────────────────────────┐
│  Voyage Context (variable)              │  ← Team name, shared norms
│  └── lib/prompts/voyage.ts              │     Loaded from DB
└─────────────────────────────────────────┘
                    +
┌─────────────────────────────────────────┐
│  User Preferences (variable)            │  ← Communication style, expertise
│  └── lib/prompts/user.ts                │     Loaded from profile
└─────────────────────────────────────────┘
                    +
┌─────────────────────────────────────────┐
│  Retrieved Context (variable)           │  ← Pinned knowledge, semantic matches
│  └── lib/prompts/compose.ts             │     Dynamic per query
└─────────────────────────────────────────┘
                    =
┌─────────────────────────────────────────┐
│  Final System Prompt                    │  ← Sent to Claude
│  (Token budget ~4000)                   │
└─────────────────────────────────────────┘
```

---

## Key Design Decisions

### Why Claude + Vercel AI SDK?

- **Tool calling**: Native support for letting AI use tools mid-response
- **Streaming**: Real-time response rendering
- **`stepCountIs(5)`**: Limits tool-calling loops to prevent runaway

### Why Supabase + pgvector?

- **Auth built-in**: Magic link, RLS policies
- **Realtime**: Future: live updates when teammates add knowledge
- **pgvector**: Native vector similarity search, no separate service

### Why Event-Sourced Knowledge?

- Collaboration requires conflict-free data structures
- "Remember that..." and "Forget that..." are both events
- Enables future features: undo, time travel, audit

### Why Agentic Retrieval?

Fixed pipelines are brittle. "What was that thing about pricing?" could mean:
- Recent discussion (temporal)
- A specific decision (semantic + graph)
- An exact number mentioned (keyword)

The AI knows what it's looking for. Let it choose.

---

## What's Working (v0.1)

- [x] Streaming chat with Claude
- [x] Agentic retrieval (4 tools, strategy chaining)
- [x] Event-sourced knowledge with embeddings
- [x] Graph edges (manual + auto entity linking)
- [x] Voyage scoping (shared team knowledge)
- [x] Magic link auth
- [x] Conversation persistence and resume
- [x] Message queue (type while AI thinks)

## What's Next (v0.2+)

- [ ] Background agents (continue searching after response)
- [ ] Realtime surfacing ("I found something relevant...")
- [ ] Knowledge curation UI (pin, quiet, connect)
- [ ] Structured extraction (decisions, action items, entities)
- [ ] Voyage permissions (captain, navigator, crew roles)
- [ ] Import sources (docs, Notion, Slack)

---

## File Map

```
lib/
├── knowledge/
│   ├── events.ts       # Event creation, auto-linking
│   ├── search.ts       # Semantic search, keyword grep, graph traversal
│   └── index.ts        # Public exports
│
├── retrieval/
│   ├── tools.ts        # Claude's retrieval tools (semantic, keyword, graph, time)
│   └── index.ts
│
├── prompts/
│   ├── core.ts         # Base personality + retrieval instructions
│   ├── compose.ts      # Assembles full system prompt
│   └── index.ts
│
├── conversation/       # Session management
├── voyage/             # Team spaces
├── auth/               # Magic link auth context
└── supabase/           # DB clients (browser, server, admin)

app/api/
├── chat/route.ts       # Main chat endpoint with tool calling
├── conversation/       # CRUD for conversations
├── voyages/            # Team space management
└── extract/            # (Deprecated) Old extraction system
```

---

## Running Locally

```bash
# Install
npm install

# Environment (copy .env.example)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...          # For embeddings

# Run
npm run dev
```

---

## Questions for Contributors

1. **Retrieval strategy**: Should we add a "confidence" signal so Claude knows when to dig deeper vs. give up?

2. **Graph density**: Auto-linking by entities creates many edges. Too noisy? Should we threshold by entity salience?

3. **Background agents**: When Claude hits `stepCountIs(5)`, should we spawn a background agent to continue searching and surface results later?

4. **Knowledge decay**: Should old, unused knowledge gradually "fade" in relevance? Or is all history equally valuable?

5. **Collaborative conflicts**: Two users pin contradictory facts. How should retrieval handle this?

---

## Contact

- **Isaac** - Product & Architecture
- **Tom** - AI Engineering & Retrieval

PRs welcome. Start with an issue to discuss approach.
