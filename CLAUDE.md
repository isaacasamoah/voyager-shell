# CLAUDE.md

Project context for Claude. Read this first.

## What is Voyager?

Your AI co-pilot for life and work. Not a chatbot - an intelligence that:
- **Learns you** over time (memory that compounds)
- **Protects your attention** (notification inversion)
- **Connects your tools** (the Jarvis layer)
- **Enables community** (Voyager IS the platform)

**The beating heart:** Intelligent retrieval. Voyager decides HOW to find things.

## The Vision

Voyager IS the community platform. Symbol grammar (`@tom #channel !voyage`) is navigation infrastructure. Slack becomes optional import, not the destination.

**Two layers:**
- **Organic** — Voyager learns (terminology, preferences, patterns)
- **Config** — Captain sets (domain restrictions, permissions, billing)

## Current State

| System | Status | Key Files |
|--------|--------|-----------|
| Chat + Streaming | Working | `app/api/chat/route.ts` |
| Parallel Paths (fast+deep) | Working | `lib/agents/deep-retrieval.ts` |
| Retrieval (6 tools) | Working | `lib/retrieval/tools.ts` |
| Background Agents | Working | `lib/agents/executor.ts` |
| Knowledge (event-sourced) | Working | `lib/knowledge/` |
| Auth (magic link) | Working | `lib/auth/` |
| Voyages (teams) | Working | `lib/voyage/` |

## Parallel Paths Architecture

```
User message → Fast Path (sync)     + Deep Path (async)
                   │                      │
                   ▼                      ▼
              Pre-retrieval         IF needed? (Gemini)
              Inject context        HOW? (Claude)
                   │                Execute → Synthesize
                   ▼                      │
              Voyager (no tools)          ▼
              Uses context           Realtime: "I found more..."
              Responds fast
```

Primary Voyager has NO retrieval tools (forces use of pre-fetched context).

## Key Directories

```
app/api/chat/route.ts         # Main chat, waitUntil deep path
lib/agents/deep-retrieval.ts  # Deep path orchestration
lib/agents/executor.ts        # Background code sandbox
lib/prompts/core.ts           # Voyager personality
lib/knowledge/                # Event-sourced system
lib/retrieval/tools.ts        # 6 retrieval tools
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

## Established Patterns

**Reference before implementing:** `.claude/skills/patterns/SKILL.md`

| Pattern | Location | Purpose |
|---------|----------|---------|
| Agent Primitives | `lib/agents/primitives.ts` | Declarative agent definitions |
| Tool Definitions | `lib/prompts/types.ts` | Standard tool interface |
| Executor Tools | `lib/agents/retrieval-tools.ts` | Code sandbox tool definitions |
| Debug Logging | `lib/debug/logger.ts` | Toggleable structured logging |
| Model Router | `lib/models/router.ts` | Model selection by task/quality |

**Three Agent Classes:**
- **Primary (conversational)** — NO tools, uses pre-fetched context, responds fast
- **Event-driven (decision)** — Quick decisions, <500ms, Gemini Flash
- **Async background** — Full tool access, heavy lifting via waitUntil

## Specs

**Master spec:** `~/.claude/research/voyager-v2/VOYAGER-MVP.md`
- This is THE spec to build against
- Contains full MVP vision, layers, checklist

**Archived context:** (background, not primary reference)
- `foundation.md` — Original vision exploration
- `agent-primitive.md` — Agent architecture research
- `slices.md` — Old roadmap (superseded)
- `cost-breakdown.md` — Old pricing (superseded)

**Diary:** `~/.claude/diary/branches/voyager-zero/main.md`
- Session memory, decisions, discoveries
