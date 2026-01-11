# Voyager

**Your collaboration co-pilot.** Discord if Claude Code was the core.

*"Voyager is your Jarvis. You are Ironman."*

---

## Vision

Voyager makes high-quality collaboration easy and careless collaboration hard. No navigation, no context switching, no information hunting. Just ask. Voyager remembers everything, connects your tools, and protects your attention.

**Core principles:**
- **Conversation as interface** - No navigation. Everything through dialogue.
- **Personal memory** - Knows you. Your preferences, your context, your history.
- **Community knowledge** - Curated graph shared with your crew.
- **Connected tools** - Live queries to Slack, Jira, Drive. Unified intelligence.
- **Mutual friend** - One intelligence, many faces. Voyager knows both sides.
- **Green tick actions** - Draft/approve. Human agency, AI leverage.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 14 (App Router)                                    │
│  React + Tailwind CSS (Terminal-native design)              │
├─────────────────────────────────────────────────────────────┤
│  Vercel AI SDK (streaming) + Claude (reasoning)             │
│  Gemini Flash (high-volume, title generation)               │
├─────────────────────────────────────────────────────────────┤
│  Event-Sourced Knowledge                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ knowledge_events (append-only, immutable)           │    │
│  │      ↓ triggers                                     │    │
│  │ knowledge_current (computed state, pgvector search) │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL + Auth + Realtime)                    │
└─────────────────────────────────────────────────────────────┘
```

### The Beating Heart: Event-Sourced Knowledge

**"Curation is subtraction, not extraction."**

- Everything is an event. Nothing is deleted. Ever.
- Messages ARE the knowledge - preserved exactly as written
- Curation is attention, not location (active vs quiet, not archive vs delete)
- Claude orchestrates its own retrieval via tools

```
Source Events (THE KNOWLEDGE)
  ├── message, document, slack_message, jira_update, explicit
  ↓
Attention Events (CURATION)
  ├── quieted, activated, pinned, unpinned, importance_changed
  ↓
Computed State (FAST QUERIES)
  └── knowledge_current with pgvector embeddings
  ↓
Agentic Retrieval
  └── Claude with tools: semantic_search, keyword_grep, get_connected...
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Supabase account (or local Supabase)
- API keys: Anthropic, OpenAI (embeddings), Google (Gemini)

### Setup

```bash
# Clone
git clone https://github.com/isaacasamoah/voyager-shell.git
cd voyager-shell

# Install
npm install

# Configure
cp .env.example .env.local
# Edit .env.local with your keys

# Database
npx supabase db push

# Run
npm run dev
```

### Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Optional
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Features

### Implemented (v0.1)

| Feature | Status | Description |
|---------|--------|-------------|
| **Chat** | Complete | Streaming responses with Claude Sonnet |
| **Knowledge System** | Complete | Event-sourced, graph-connected, semantic search |
| **Agentic Retrieval** | Complete | 5 tools, Claude decides strategy |
| **Auth** | Complete | Magic link, session continuity |
| **Voyages** | Complete | Create/join shared spaces, invite system |
| **Session Resume** | Complete | Pick up where you left off |
| **Terminal UI** | Complete | Obsidian aesthetic, astronaut avatar |

### Agentic Retrieval Tools

Claude decides how to find what you need:

| Tool | Purpose |
|------|---------|
| `semantic_search` | Conceptual similarity via embeddings |
| `keyword_grep` | Exact phrase matching |
| `get_connected` | Follow graph edges to related knowledge |
| `search_by_time` | Temporal queries ("last week") |
| `get_nodes` | Fetch specific nodes by ID |

### The Voyager Metaphor

- **Solo voyage** = Personal knowledge space
- **Crew voyage** = Shared knowledge space
- **Captain** = The founder/owner
- Same ship. Same navigation. Different horizons.

---

## Project Structure

```
voyager-shell/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # Main chat endpoint
│   │   ├── conversation/        # Session management
│   │   └── voyages/             # Voyage CRUD
│   └── page.tsx                 # Root (VoyagerInterface)
├── components/
│   ├── ui/VoyagerInterface.tsx  # Main terminal UI
│   └── chat/                    # Message components
├── lib/
│   ├── knowledge/               # Event-sourced knowledge
│   ├── retrieval/               # Agentic retrieval tools
│   ├── conversation/            # Session lifecycle
│   ├── voyage/                  # Voyage management
│   ├── auth/                    # Magic link auth
│   └── prompts/                 # Modular prompt composition
└── supabase/
    └── migrations/              # Database schema
```

---

## Development

```bash
# Start dev server
npm run dev

# Type check
npm run type-check

# Lint
npm run lint

# Test
npm run test

# Build
npm run build
```

### Code Quality

- TypeScript strict mode
- Named exports only (no default exports)
- Arrow function components
- Files under 250 lines
- CI: type-check → lint → build

---

## Roadmap

### Current: v0.1 (Foundation)
- [x] Streaming chat with Claude
- [x] Event-sourced knowledge
- [x] Agentic retrieval (5 tools)
- [x] Auth & session continuity
- [x] Voyages (create/join/invite)

### Next: v0.2 (Background Agents)
- [ ] `spawn_background_agent` tool
- [ ] Retriever agent (deep search)
- [ ] Results surface via Realtime
- [ ] "I found more context..." UX

### Future: v0.3+
- [ ] Slack integration (stealth mode)
- [ ] Classification pipeline (async)
- [ ] Curator agent (auto-curation)
- [ ] DSPy optimization (Quartermaster)
- [ ] Subscription/billing

See [slices.md](.claude/research/voyager-v2/slices.md) for detailed roadmap.

---

## Design Philosophy

### Terminal-Native Aesthetic

The metaphor is complete, not decorative:
- Context as environment variables: `$CTX: PROJECT_X`
- Drafts as files: `DRAFT_RESPONSE.md`
- Input as command prompt: `➜ ~/project-x`
- Loading as tracer route (visualize graph traversal)

### The Astronaut

Voyager's avatar - a hand-drawn pencil sketch:
- **Searching**: Examining star map (graph traversal)
- **Success**: Holding checkmark (draft approved)
- **Idle**: Floating peacefully (session wrap)

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Key Areas

1. **Knowledge System** - Graph algorithms, retrieval strategies
2. **Integrations** - Slack, Jira, Google Drive connectors
3. **UI/UX** - Terminal aesthetic, accessibility
4. **Agents** - Background specialists, curation
5. **Testing** - Coverage, integration tests

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| AI | Claude Sonnet (reasoning), Gemini Flash (volume) |
| Streaming | Vercel AI SDK v6 |
| Embeddings | OpenAI text-embedding-3-small |
| Search | PostgreSQL pgvector |
| Styling | Tailwind CSS |
| Testing | Vitest + Testing Library |

---

## License

[License TBD - Open source or source-available]

---

## Links

- **Repository**: [github.com/isaacasamoah/voyager-shell](https://github.com/isaacasamoah/voyager-shell)
- **Design Docs**: See `.claude/research/voyager-v2/`
- **Issue Tracker**: [GitHub Issues](https://github.com/isaacasamoah/voyager-shell/issues)

---

*Built with conviction that the future of collaboration is conversational.*
