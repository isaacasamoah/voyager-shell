# CLAUDE.md

Project context for Claude Code.

## Overview

**Voyager V2** - Your collaboration co-pilot. Discord if Claude Code was the core.

*"Voyager is your Jarvis. You are Ironman."*

**Design principle:** Make high-quality, beautiful collaboration easy. Make bad, careless collaboration hard.

## Vision

See full design document: `~/.claude/research/voyager-v2/foundation.md`

**Core experience:**
1. Conversation as interface (no navigation, just ask)
2. Personal memory (knows you)
3. Community knowledge (curated graph)
4. Connected tools (live queries)
5. Mutual friend (one intelligence, many faces)
6. Green tick actions (draft/approve)

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL + Auth + Realtime)
- **AI:** Vercel AI SDK (streaming) + Claude Agent SDK (tools)
- **Models:** Claude Sonnet (reasoning) + Gemini Flash (high-volume)
- **Styling:** Tailwind CSS
- **Design:** Terminal-native aesthetic

## Commands

```bash
npm run dev        # Start dev server (port 3000)
npm run build      # Production build
```

## Current Structure

```
app/
  page.tsx         # Root redirect
  layout.tsx       # Root layout (monospace fonts)
  globals.css      # Global styles
  preview/         # UI preview page
components/
  ui/
    VoyagerInterface.tsx              # Main terminal UI
    reference/                        # Saved design references
```

## UI Aesthetic

**Terminal-native design.** The metaphor is complete, not decorative.

- Context as environment variables: `$CTX: PROJECT_X`
- Drafts as files: `DRAFT_RESPONSE.md`
- Loading as tracer route (visualize graph traversal)
- Input as command prompt: `➜ ~/project-x`
- Color palette: Obsidian (#050505), Indigo accent, Green for success

**The Astronaut:** Voyager's avatar in different states (Searching, Success, Idle).

## Quality Standards

- TypeScript strict mode
- Named exports only (no default exports)
- Arrow function components
- Interface Props above components
- Files under 250 lines
