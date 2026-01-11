# CLAUDE.md

Project context for Claude Code. Read this first.

## What is Voyager?

**Your collaboration co-pilot.** Discord if Claude Code was the core.

> "Voyager is your Jarvis. You are Ironman."

The first AI that gets better at being *your* AI over time — not by configuration, but by learning you.

## The Beating Heart

Voyager's core differentiator is **intelligent retrieval**:

```
You: "What did we decide about pricing?"

Voyager thinks:
  → semantic_search("pricing decisions") → finds topic cluster
  → get_connected(node_id) → follows graph to related decisions
  → keyword_grep("$79") → pinpoints exact price

Voyager: "On Nov 12, you decided $79/mo..."
```

**Not a search box.** An intelligence that decides HOW to find things.

## Quick Start

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # Production build
```

**Environment:** Copy `.env.example` to `.env.local` and fill in:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` (Claude)
- `OPENAI_API_KEY` (embeddings)
- `GOOGLE_GENERATIVE_AI_API_KEY` (Gemini for extraction)

## Tech Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| Framework | Next.js 14 (App Router) | Full-stack React |
| Database | Supabase (PostgreSQL) | Auth + Data + Realtime |
| AI Chat | Vercel AI SDK + Claude | Streaming responses |
| Embeddings | OpenAI text-embedding-3-small | Semantic search |
| Extraction | Gemini Flash | High-volume processing |
| Styling | Tailwind CSS | Terminal aesthetic |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer                                                    │
│  └── VoyagerInterface.tsx (terminal UI, message queue)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  API Layer                                                   │
│  ├── /api/chat (streaming + tool calling)                   │
│  ├── /api/conversation (session management)                 │
│  └── /api/voyages (team spaces)                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Knowledge Layer (Event-Sourced)                             │
│  ├── knowledge_events (append-only, immutable)              │
│  ├── knowledge_current (computed state + embeddings)        │
│  └── Retrieval tools (semantic, keyword, graph, temporal)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Prompt Layer (Modular Composition)                          │
│  └── Core → Voyage → User → Tools → Context                 │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
app/
  api/
    chat/route.ts           # Streaming chat with tool calling
    conversation/           # Session CRUD
    voyages/                # Team spaces
    extract/route.ts        # Memory extraction
  auth/callback/            # Magic link handler
  join/[code]/              # Voyage invite landing

components/
  ui/VoyagerInterface.tsx   # Main terminal UI (~1400 lines)
  chat/                     # Message components

lib/
  knowledge/                # Event-sourced memory system
    events.ts               # Create knowledge events
    search.ts               # Semantic + keyword search
  retrieval/
    tools.ts                # Claude's retrieval tools
  prompts/
    core.ts                 # Base personality (~400 tokens)
    compose.ts              # Prompt composition
  conversation/             # Session management
  voyage/                   # Team spaces
  auth/                     # Magic link auth
  supabase/                 # Database clients

supabase/migrations/        # Database schema
```

## Key Concepts

### Event-Sourced Knowledge

Everything is an event. Nothing is deleted.

```sql
-- Source of truth (append-only)
knowledge_events: id, event_type, content, metadata, created_at

-- Computed state (fast queries)
knowledge_current: event_id, content, embedding, is_active, is_pinned, connected_to
```

**Curation is subtraction:** Mark things as "quieted" (ignored) not deleted.

### Retrieval Tools

Claude decides which tools to use:

| Tool | When to use |
|------|-------------|
| `semantic_search` | Conceptual queries, don't know exact terms |
| `keyword_grep` | Know exact term/name/phrase |
| `get_connected` | Follow graph from found node |
| `search_by_time` | "Last week", "yesterday" queries |

Tools chain: semantic → graph → keyword for pinpoint accuracy.

### Voyages (Teams)

- **Solo voyage** = Personal space (just you)
- **Crew voyage** = Shared space (team)
- Same model, different scope filter

### Message Queue

Users can type while Voyager is thinking. Messages queue and auto-send.

## UI Aesthetic

**Terminal-native design.** Complete metaphor, not decoration.

- Fixed header with context
- Markdown rendering for responses
- Astronaut avatar (idle/searching/success states)
- Enter to send, Shift+Enter for newline
- Amber = thinking, Green = ready

## Code Standards

- TypeScript strict mode
- Named exports only (no default exports)
- Arrow function components
- Interface Props above components
- Files under 250 lines (except VoyagerInterface)

## Current Status

| Slice | Status | Key Files |
|-------|--------|-----------|
| Chat + Streaming | ✅ Complete | `api/chat/route.ts` |
| Knowledge Foundation | ✅ Complete | `lib/knowledge/` |
| Agentic Retrieval | ✅ Phase 1 Complete | `lib/retrieval/tools.ts` |
| Auth (Magic Link) | ✅ Complete | `lib/auth/` |
| Voyages (Teams) | ✅ Complete | `lib/voyage/` |
| UX Polish | ✅ Complete | Fixed header, markdown, queue |

**Next:** Phase 2 (Background agents + Realtime surfacing)

## Research & Specs

Detailed documentation in `~/.claude/research/voyager-v2/`:

- `foundation.md` - Vision and design principles
- `slices.md` - Development roadmap
- `SPEC-agents.md` - Agent architecture
- `agent-primitive.md` - The beating heart

Diary: `~/.claude/diary/branches/voyager-zero/main.md`
