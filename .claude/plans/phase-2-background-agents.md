# Phase 2: Background Agents (Claude as Query Compiler)

**Status:** Ready to Build
**Updated:** 2026-01-12
**Spec:** `~/.claude/research/voyager-v2/SPEC-agents.md`
**Vision:** `~/.claude/research/voyager-v2/agent-primitive.md`

---

## The Pattern

**Claude as Query Compiler:** Intelligence at design time, cheap execution at runtime.

```
User asks → Voyager answers fast
                ↓
         Writes retrieval code optimized for THIS query
                ↓
         Spawns background worker with code
                ↓
         Worker executes (no LLM, just our functions)
                ↓
         Results surface via Realtime
```

**Why this works:**
- Intelligence at design time (Sonnet reasons about strategy)
- $0 execution cost (just function calls)
- Adaptive (every query gets custom logic)
- Learnable (log code + results for optimization)

---

## Build Order

### Step 1: Database Schema

Create `agent_tasks` table as a simple queue.

```sql
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Task definition
  task TEXT NOT NULL,        -- Human description
  code TEXT NOT NULL,        -- Generated retrieval code
  priority TEXT NOT NULL DEFAULT 'normal',

  -- Context
  user_id UUID NOT NULL REFERENCES profiles(id),
  voyage_slug TEXT,
  conversation_id UUID NOT NULL,

  -- Execution
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Result
  result JSONB,
  error TEXT,

  -- Metrics
  duration_ms INT
);

-- Index for worker polling
CREATE INDEX idx_agent_tasks_pending
  ON agent_tasks (priority DESC, created_at ASC)
  WHERE status = 'pending';

-- Index for conversation lookup
CREATE INDEX idx_agent_tasks_conversation
  ON agent_tasks (conversation_id, created_at);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_tasks;
```

**File:** `supabase/migrations/0XX_agent_tasks.sql`

**Acceptance:** Migration runs, table exists, Realtime enabled.

---

### Step 2: Spawn Tool

Add `spawn_background_agent` tool to `lib/retrieval/tools.ts`.

```typescript
export const spawnBackgroundAgentTool = tool({
  description: `Spawn background retrieval with custom code.
    Write JavaScript that uses our retrieval functions to find
    comprehensive information. The code runs async, results
    surface via realtime when ready.

    Available functions:
    - semanticSearch(query, { limit?, threshold? })
    - keywordGrep(pattern, { caseSensitive?, limit? })
    - getConnected(nodeId, { type?, depth? })
    - searchByTime(timeframe, { query? })
    - getNodes(ids)

    Write code that chains these for optimal retrieval.`,
  parameters: z.object({
    task: z.string().describe('Human description of what to find'),
    code: z.string().describe('JavaScript code using retrieval functions'),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  }),
  execute: async ({ task, code, priority }, { userId, voyageSlug, conversationId }) => {
    const taskId = await enqueueAgentTask({
      task,
      code,
      priority,
      user_id: userId,
      voyage_slug: voyageSlug,
      conversation_id: conversationId,
    });
    return { queued: true, task_id: taskId };
  },
});
```

**Files:**
- `lib/retrieval/tools.ts` - Add tool definition
- `lib/agents/queue.ts` - NEW - `enqueueAgentTask` function

**Acceptance:** Tool can be called, task appears in `agent_tasks` table.

---

### Step 3: Code Executor

Create the code executor in `lib/agents/executor.ts`.

```typescript
interface RetrievalContext {
  userId: string;
  voyageSlug?: string;
  conversationId: string;
}

interface RetrievalResult {
  findings: KnowledgeNode[];
  confidence: number;
  summary?: string;
}

export async function executeRetrievalCode(
  code: string,
  context: RetrievalContext
): Promise<RetrievalResult> {
  // Bind our retrieval functions to context
  const boundFunctions = {
    semanticSearch: (q: string, opts?: any) =>
      semanticSearch(q, opts, context),
    keywordGrep: (p: string, opts?: any) =>
      keywordGrep(p, opts, context),
    getConnected: (id: string, opts?: any) =>
      getConnected(id, opts, context),
    searchByTime: (t: string, opts?: any) =>
      searchByTime(t, opts, context),
    getNodes: (ids: string[]) =>
      getNodes(ids, context),
    dedupe: dedupeNodes,
    // Standard JS (safe subset)
    Promise,
    Array,
    Object,
    JSON,
  };

  // Create function from code
  const fn = new Function(
    ...Object.keys(boundFunctions),
    `return (async () => { ${code} })()`
  );

  // Execute with timeout
  const result = await Promise.race([
    fn(...Object.values(boundFunctions)),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 30000)
    )
  ]);

  // Validate result shape
  return validateResult(result);
}

function validateResult(result: any): RetrievalResult {
  // Ensure findings is an array
  const findings = Array.isArray(result?.findings)
    ? result.findings
    : Array.isArray(result)
      ? result
      : [];

  return {
    findings,
    confidence: result?.confidence ?? 0.5,
    summary: result?.summary,
  };
}
```

**File:** `lib/agents/executor.ts`

**Acceptance:** Executor runs test code, returns results.

---

### Step 4: Background Worker

Create worker as API route + Vercel cron.

```typescript
// app/api/internal/agents/worker/route.ts

export async function POST(req: Request) {
  // Verify internal call (cron secret)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Claim next pending task
  const task = await claimNextTask();
  if (!task) {
    return Response.json({ processed: 0 });
  }

  try {
    const startTime = Date.now();

    // Execute generated code
    const result = await executeRetrievalCode(task.code, {
      userId: task.user_id,
      voyageSlug: task.voyage_slug,
      conversationId: task.conversation_id,
    });

    // Mark complete
    await completeTask(task.id, {
      result,
      duration_ms: Date.now() - startTime,
    });

    return Response.json({ processed: 1, task_id: task.id });
  } catch (error) {
    await failTask(task.id, error.message);
    return Response.json({ processed: 1, failed: true });
  }
}

async function claimNextTask() {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('agent_tasks')
    .update({
      status: 'running',
      started_at: new Date().toISOString()
    })
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .select()
    .single();

  return data;
}
```

**Vercel cron config:**
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/internal/agents/worker",
      "schedule": "* * * * *"
    }
  ]
}
```

**Files:**
- `app/api/internal/agents/worker/route.ts` - NEW
- `lib/agents/queue.ts` - `claimNextTask`, `completeTask`, `failTask`
- `vercel.json` - Add cron config

**Acceptance:** Worker claims and executes tasks, results stored in table.

---

### Step 5: Realtime Surfacing (UI)

Subscribe to agent results and display "I found more context..."

```typescript
// In VoyagerInterface.tsx

interface AgentResult {
  id: string;
  task: string;
  result: RetrievalResult;
  dismissed: boolean;
}

const [agentResults, setAgentResults] = useState<AgentResult[]>([]);

useEffect(() => {
  if (!conversationId) return;

  const channel = supabase
    .channel(`agents:${conversationId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'agent_tasks',
      filter: `conversation_id=eq.${conversationId}`,
    }, (payload) => {
      if (payload.new.status === 'complete' && payload.new.result) {
        setAgentResults(prev => [...prev, {
          id: payload.new.id,
          task: payload.new.task,
          result: payload.new.result,
          dismissed: false,
        }]);
      }
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [conversationId]);
```

**UI Component:**
```tsx
// components/chat/AgentResultCard.tsx

interface AgentResultCardProps {
  result: AgentResult;
  onExpand: () => void;
  onDismiss: () => void;
}

export const AgentResultCard = ({ result, onExpand, onDismiss }: AgentResultCardProps) => {
  return (
    <div className="bg-surface border border-white/10 rounded-lg p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="text-indigo-400">
          <LightbulbIcon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-slate-300 text-sm font-medium">
            I found more context...
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {result.result.findings.length} additional items found
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExpand}
            className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded text-xs hover:bg-indigo-500/30"
          >
            Expand
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-1 text-slate-500 hover:text-slate-400 text-xs"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
```

**Files:**
- `components/ui/VoyagerInterface.tsx` - Realtime subscription
- `components/chat/AgentResultCard.tsx` - NEW - Result display

**Acceptance:** Results appear in UI after agent completes.

---

### Step 6: Prompt Updates

Update prompts to teach Claude to write retrieval code.

```typescript
// lib/prompts/core.ts - Add to retrieval section

## Background Retrieval

When a query deserves deeper exploration than your immediate answer provides,
spawn a background agent with custom retrieval code.

**When to use:**
- User asks about history/decisions that might have more context
- Topic spans multiple conversations or time periods
- You found something but suspect there's more

**How to write retrieval code:**

Available functions:
- semanticSearch(query, { limit?, threshold? }) - Conceptual search
- keywordGrep(pattern, { caseSensitive? }) - Exact phrase match
- getConnected(nodeId, { type?, depth? }) - Graph traversal
- searchByTime(timeframe, { query? }) - Temporal search
- getNodes(ids) - Fetch by ID
- dedupe(nodes) - Remove duplicates

Strategy pattern:
1. Start broad (semantic)
2. Follow leads (graph)
3. Pinpoint (keyword)
4. Return structured results

Example:
\`\`\`javascript
const broad = await semanticSearch("pricing", { limit: 20 });
const decisions = await Promise.all(
  broad.slice(0, 3).map(n => getConnected(n.id, { type: "decision" }))
);
const exact = await keywordGrep("$79");
return {
  findings: dedupe([...broad, ...decisions.flat(), ...exact]),
  confidence: 0.85
};
\`\`\`

Don't wait for results - continue your response. Results surface automatically.
```

**File:** `lib/prompts/core.ts`

**Acceptance:** Claude generates valid retrieval code when appropriate.

---

## Testing Checklist

- [ ] Task enqueues when spawn_background_agent called
- [ ] Worker picks up task within 60 seconds (cron interval)
- [ ] Code executor runs generated code correctly
- [ ] Result stored in agent_tasks.result
- [ ] Realtime fires to UI
- [ ] AgentResultCard displays correctly
- [ ] Expand shows full findings
- [ ] Dismiss removes card
- [ ] Works on mobile
- [ ] Error handling works gracefully
- [ ] Code timeout prevents infinite loops

---

## Future (Not Now)

- Anticipator agent (pre-fetch on every message)
- Execution logging for learning
- DSPy optimization of code generation
- Skill-based retrieval (when SDK issue #102 fixed)

---

*Ready to build. Let's ship the beating heart.*
