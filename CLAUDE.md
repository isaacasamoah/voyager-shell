# CLAUDE.md

Project context for Claude. Read this first.

## What is Voyager?

Your collaboration co-pilot. An AI that learns you over time.

**The beating heart:** Intelligent retrieval. Voyager decides HOW to find things - not a search box, an intelligence.

## Current State

| System | Status | Key Files |
|--------|--------|-----------|
| Chat + Streaming | Working | `app/api/chat/route.ts` |
| Retrieval (6 tools) | Working | `lib/retrieval/tools.ts` |
| Background Agents | Working | `lib/agents/executor.ts`, `queue.ts` |
| Knowledge (event-sourced) | Working | `lib/knowledge/` |
| Auth (magic link) | Working | `lib/auth/` |
| Voyages (teams) | Working | `lib/voyage/` |

## How Retrieval Works

Claude has 6 tools and decides the strategy:

```
semantic_search → conceptual, fuzzy meaning
keyword_grep    → exact term/phrase match
get_connected   → follow graph edges from node
search_by_time  → temporal ("last week", "yesterday")
get_nodes       → fetch by ID
spawn_background_agent → async deep search
```

**Chain strategies:** semantic → graph → keyword for pinpoint accuracy.

## Background Agents (The Pattern)

**Claude as Query Compiler:**
1. Claude writes retrieval code specific to the query
2. `waitUntil` executes immediately (non-blocking)
3. Results surface via Supabase Realtime
4. No LLM at runtime - intelligence at design time

**Two-step workflow (CRITICAL):**
1. ONE quick semantic_search
2. **Same response:** Output text to user AND spawn_background_agent

The user needs immediate acknowledgment. Always output text + tool together.

## Key Directories

```
app/api/chat/route.ts      # Main chat, tool calling, maxSteps: 5
lib/retrieval/tools.ts     # All 6 retrieval tools
lib/agents/executor.ts     # Background code sandbox
lib/prompts/core.ts        # Voyager personality (~520 tokens)
lib/knowledge/             # Event-sourced system
components/ui/VoyagerInterface.tsx  # Terminal UI
```

## Database

- Supabase PostgreSQL + pgvector
- `knowledge_events` → append-only source of truth
- `knowledge_current` → computed state + embeddings
- `agent_tasks` → background task queue
- Realtime enabled on `agent_tasks`

## Commands

```bash
npm run dev      # localhost:3000
npm run build    # production build
```

## Code Standards

- TypeScript strict
- Named exports only
- Arrow function components
- Files under 250 lines (except VoyagerInterface)

## Specs

Detailed specs in `~/.claude/research/voyager-v2/`:
- `SPEC-current.md` — Current state + what's next
- `foundation.md` — Vision
- `agent-primitive.md` — Background agent architecture
- `slices.md` — Roadmap

Diary: `~/.claude/diary/branches/voyager-zero/main.md`
