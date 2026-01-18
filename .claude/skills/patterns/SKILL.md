---
name: patterns
description: Voyager codebase patterns and conventions. Reference before implementing new features. Agent primitives, tools, prompts, debug logging.
---

# Voyager Patterns

Reference this before implementing new features. These patterns are established and should be followed for consistency.

## Quick Reference

| Pattern | Location | Purpose |
|---------|----------|---------|
| Agent Primitives | `lib/agents/primitives.ts` | Declarative agent definitions |
| Tool Definitions | `lib/prompts/types.ts` | Standard tool interface |
| Tool Formatting | `lib/prompts/format/tools.ts` | Generate prompt sections from tools |
| Executor Tools | `lib/agents/retrieval-tools.ts` | Code sandbox tool definitions |
| Debug Logging | `lib/debug/logger.ts` | Toggleable structured logging |
| Model Router | `lib/models/router.ts` | Model selection by task/quality |

---

## 1. Agent Primitives

**Location:** `lib/agents/primitives.ts`

Agents are declared as data, not code. Implementation files import definitions from here.

```typescript
interface AgentDefinition {
  id: string
  name: string
  description: string
  model: ModelRequirements
  tools: string[]
  systemPrompt: string | ((ctx: AgentContext) => string | Promise<string>)
  maxTokens?: number
  timeout?: number
  type: 'conversational' | 'decision' | 'background'
}
```

**Registry pattern:**
```typescript
export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  voyager: { ... },
  ifDecision: { ... },
  howStrategy: { ... },
}

export const getAgent = (id: string) => AGENT_REGISTRY[id]
```

**When to use:** Adding new agent types, modifying agent behavior, extracting prompts.

---

## 2. Tool Definitions

**Location:** `lib/prompts/types.ts`

Standard interface for all tool definitions. Used for prompt generation.

```typescript
interface ToolDefinition {
  name: string
  description: string
  usage: {
    when: string      // When to use (critical for agent guidance)
    notWhen?: string  // Anti-patterns
    example?: string  // Concrete usage example
  }
  parameters: ToolParameter[]
  sideEffects: 'none' | 'read' | 'write' | 'destructive'
  requiresApproval?: boolean
}

interface ToolParameter {
  name: string
  type: string
  description: string
  required: boolean
  example?: string
}
```

**When to use:** Defining any new tool, whether for chat-time Vercel AI SDK or executor sandbox.

---

## 3. Tool Formatting

**Location:** `lib/prompts/format/tools.ts`

Pure function: tool definitions → prompt text. DSPy-ready.

```typescript
import { formatTools, formatToolsSummary } from '@/lib/prompts/format/tools'

// Full format for system prompts
const toolSection = formatTools(MY_TOOLS)

// Minimal format for token-constrained contexts
const summary = formatToolsSummary(MY_TOOLS)
```

**Output format:**
```
# Available Tools

## search_knowledge
Search personal and community knowledge bases for relevant information.

**When to use:** The user asks about something that might be in memory.
**Do not use when:** General knowledge questions.

**Parameters:**
- `query` (required): The semantic search query
  Example: `API design decisions`
```

**When to use:** Generating tool sections for agent prompts.

---

## 4. Executor Tools (Code Sandbox)

**Location:** `lib/agents/retrieval-tools.ts`

Tools bound to the code sandbox for "Claude as Query Compiler" pattern.

```typescript
import { EXECUTOR_TOOLS, generateHowStrategyPrompt } from '@/lib/agents/retrieval-tools'

// Get the complete HOW strategy prompt with tools + patterns
const prompt = generateHowStrategyPrompt()
```

**Key patterns:**

1. **Introspection first** - Tools ordered so agent checks what exists before searching
2. **When/notWhen guidance** - Critical for correct tool selection
3. **Composition patterns** - Example code for common query types

**Adding new executor tools:**
1. Add `ToolDefinition` to `EXECUTOR_TOOLS` array
2. Implement function in `lib/agents/executor.ts` `createBoundFunctions`
3. Build passes, prompt auto-updates

---

## 5. Debug Logging

**Location:** `lib/debug/logger.ts`

Structured, toggleable logging by domain.

```typescript
import { log } from '@/lib/debug'

log.message('User sent', { conversationId, length })
log.voyage('Switched', { from, to })
log.memory('Search complete', { count, ms })
log.intent('Detected', { type, input })
log.ui('Component injected', { componentId })
log.api('Request received', { path })
log.agent('Task queued', { taskId })
log.auth('Session created', { userId })
```

**Enable/disable:**
```javascript
// Browser - localStorage
localStorage.setItem('voyager:debug', '*')           // All domains
localStorage.setItem('voyager:debug', 'memory,ui')   // Specific domains
localStorage.removeItem('voyager:debug')              // Disable

// Server - .env.local
VOYAGER_DEBUG=*           // All domains
VOYAGER_DEBUG=api,memory  // Specific domains
```

**Domains:** message, voyage, memory, ui, intent, auth, api, agent

**When to use:** Any non-trivial operation that would benefit from visibility.

---

## 6. Model Router

**Location:** `lib/models/router.ts`

Select models by task/quality requirements, not by hardcoded model IDs.

```typescript
import { modelRouter } from '@/lib/models'

const model = modelRouter.select({
  task: 'chat',           // chat, synthesis, decision, embedding
  quality: 'balanced',    // fast, balanced, best
  streaming: true,
  toolUse: false,
})
```

**Fallback chain:** Sonnet → Haiku → Gemini Flash

**When to use:** Any LLM call. Never hardcode model IDs.

---

## 7. Prompt Composition

**Location:** `lib/prompts/`

Modular prompt system with layers.

```
lib/prompts/
├── types.ts         # All interfaces
├── core.ts          # Core Voyager personality
├── format/
│   ├── tools.ts     # Tool → prompt text
│   ├── knowledge.ts # Knowledge → prompt text
│   └── voyage.ts    # Voyage config → prompt text
└── composer.ts      # Combines layers
```

**Composition:**
```typescript
const { systemPrompt, totalTokens } = await composePrompt({
  userId,
  voyageSlug,
  tools: RETRIEVAL_TOOLS,
  knowledge: retrievedItems,
})
```

---

## 8. Knowledge Event Sourcing

**Location:** `lib/knowledge/`

Append-only events → computed state.

```
knowledge_events (source of truth)
    ↓ trigger
knowledge_current (computed state + embeddings)
```

**Key principle:** Never delete, only add superseding/correction events.

---

---

## 9. Deep Retrieval Orchestration

**Location:** `lib/agents/deep-retrieval.ts`

The "Claude as Query Compiler" pattern with parallel paths.

```
User Query
    │
    ├── FAST PATH (sync) ──────────────────────────┐
    │   Pre-retrieved context                      │
    │   Primary Voyager (NO tools)                 │
    │   Responds immediately                       │
    │                                              ▼
    └── DEEP PATH (async via waitUntil) ──────────────────────┐
        │                                                      │
        ├─ [1] Depth Classifier (pure function, <5ms)         │
        │      quick → skip deep path                          │
        │      standard → IF decision gates                    │
        │      comprehensive → always go deep                  │
        │                                                      │
        ├─ [2] IF Decision (Gemini Flash)                     │
        │      "Should we search deeper?"                      │
        │                                                      │
        ├─ [3] HOW Strategy (Claude)                          │
        │      "Generate JavaScript retrieval code"            │
        │                                                      │
        ├─ [4] Execute (Code Sandbox)                         │
        │      Run generated code with bound tools             │
        │                                                      │
        ├─ [5] Cluster (Gemini Flash)                         │
        │      Group findings by theme                         │
        │                                                      │
        ├─ [6] Synthesize (Claude)                            │
        │      Conversational follow-up                        │
        │                                                      │
        └─ [7] Surface via Realtime (agent_tasks table) ──────┘
```

**Key principle:** Fast path gives immediate value; deep path adds richness without blocking.

---

## 10. Two-Stage Clustering

**Location:** `lib/agents/clustering.ts`

Transform 200 raw findings into ~5 themed clusters with progressive disclosure.

```typescript
interface FindingCluster {
  id: string
  theme: string                 // "Pricing Decisions"
  summary: string               // 1-2 sentence cluster summary
  confidence: number            // 0-1 cluster coherence
  findings: Finding[]           // Underlying findings
  representativeId: string      // Most representative finding
}
```

**Flow:**
1. **Pre-group** (no LLM) - Group by similarity bands
2. **LLM cluster** (Gemini Flash) - Assign themes, max 50 findings
3. **Post-process** - Merge small clusters, cap at 5

**Smart defaults:**
- <10 findings → single "Results" cluster, no LLM
- Max 5 clusters, 10 findings per cluster
- Use numeric indices ("0", "1") for LLM↔buildClusters mapping

---

## 11. Three Agent Classes

Voyager uses three distinct agent patterns:

### Primary Agents (Conversational)
**Runs:** Synchronously during user request
**Purpose:** Direct conversation, immediate response
**Tools:** NONE (forces use of pre-fetched context)
**Example:** Main Voyager chat agent

```typescript
{
  type: 'conversational',
  model: { task: 'chat', streaming: true, toolUse: false },
  tools: [],  // Critical: no tools
}
```

### Event-Driven Agents (Decision)
**Runs:** Triggered by events (message received, knowledge updated)
**Purpose:** Quick decisions, classifications, routing
**Tools:** None or minimal
**Latency:** <500ms target
**Examples:** IF decision, depth classifier, synthesis

```typescript
{
  type: 'decision',
  model: { task: 'decision', quality: 'fast', maxLatencyMs: 500 },
  tools: [],
}
```

### Async Background Agents
**Runs:** via waitUntil, independent of request lifecycle
**Purpose:** Heavy lifting, multi-step retrieval, analysis
**Tools:** Full tool access
**Examples:** HOW strategy, executor, clustering

```typescript
{
  type: 'background',
  model: { task: 'synthesis', toolUse: true },
  tools: ['semanticSearch', 'keywordGrep', 'getConnected', ...],
}
```

**Architecture decision:** Primary has NO tools to prevent over-retrieval. Background handles deep work asynchronously.

---

## 12. Context Types

Three context types for different scopes:

```typescript
// Base (shared)
interface BaseAgentContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
}

// For agent prompts
interface AgentContext extends BaseAgentContext {
  previousMessages?: Array<{ role: string; content: string }>
  additionalContext?: Record<string, unknown>
}

// For code execution (conversationId required)
interface ExecutionContext extends BaseAgentContext {
  conversationId: string
}

// For Vercel AI SDK tools
interface ToolContext extends BaseAgentContext {
  waitUntil?: (promise: Promise<unknown>) => void
}
```

---

## Adding New Patterns

When establishing a new pattern:

1. **Research first** - Check `~/.claude/research/` for prior work
2. **Document the pattern** - Add section to this skill
3. **Update diary** - Record decision in `~/.claude/diary/`
4. **Single source of truth** - One file owns the pattern
5. **Pure functions preferred** - Data in, result out (DSPy-ready)

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Primary Voyager has NO tools | Forces use of pre-fetched context; prevents over-retrieval |
| Parallel paths (fast+deep) | Speed AND depth, not a tradeoff |
| Claude as Query Compiler | Reasoning at design-time, cheap execution at runtime |
| Gemini for cheap decisions | IF, clustering - fast and cheap |
| Claude for synthesis | Quality matters for user-facing text |
| Numeric indices for clustering | Simple, reliable LLM↔code mapping |
| Event-sourced knowledge | Append-only, audit trail, nothing deleted |

---

## Files Changed (2026-01-18/19)

| File | Change |
|------|--------|
| `lib/agents/clustering.ts` | NEW - Two-stage clustering for deep retrieval |
| `lib/agents/retrieval-tools.ts` | NEW - Executor tool definitions + composition patterns |
| `lib/agents/deep-retrieval.ts` | UPDATE - Clustering step, conversation-aware synthesis |
| `lib/agents/depth-classifier.ts` | UPDATE - Fixed patterns for "everything from" queries |
| `lib/agents/executor.ts` | ADD - getKnowledgeStats, getScopeDump introspection |
| `lib/agents/primitives.ts` | ADD - CLUSTERING_PROMPT, types for clusters |
| `components/chat/AgentResultCard.tsx` | UPDATE - Progressive disclosure UI |
| `components/ui/VoyagerInterface.tsx` | UPDATE - AgentResult type with clusters |
| `app/api/chat/route.ts` | ADD - Voyager awareness for comprehensive queries |
| `lib/debug/logger.ts` | NEW - Structured toggleable logging |
