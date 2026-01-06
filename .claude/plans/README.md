# Plans

Implementation plans for Voyager Zero. Plans survive context compaction and provide continuity across sessions.

## How Plans Work

1. **Before implementing:** Create a plan in this directory
2. **During work:** Update the plan as decisions are made
3. **After completion:** Mark the plan as complete with outcomes

## Plan Structure

```markdown
# [Feature/Task Name]

**Status:** Draft | In Progress | Complete | Abandoned
**Created:** YYYY-MM-DD
**Last Updated:** YYYY-MM-DD

## Goal
What are we trying to achieve?

## Context
Why are we doing this? What decisions led here?

## Approach
How will we implement it?

## Key Decisions
- Decision 1: [choice] because [reason]
- Decision 2: [choice] because [reason]

## Files to Create/Modify
- path/to/file.ts — description

## Open Questions
- [ ] Question 1
- [ ] Question 2

## Outcomes (after completion)
What was actually built? What changed from the plan?
```

## Current Plans

| Plan | Status | Description |
|------|--------|-------------|
| [retrieval-events-logging](./retrieval-events-logging.md) | Draft | Ground truth logging for DSPy |
| [agentic-retrieval](./agentic-retrieval.md) | Future | Claude-orchestrated retrieval (deferred) |

## Related

- Research docs: `~/.claude/research/voyager-v2/`
- Specs: `~/.claude/research/voyager-v2/SPEC-*.md`
- Slices: `~/.claude/research/voyager-v2/slices.md`
