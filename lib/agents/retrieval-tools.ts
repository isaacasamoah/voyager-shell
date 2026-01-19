// Executor Retrieval Tools
// Tool definitions for the HOW strategy prompt (Claude as Query Compiler)
//
// Uses established ToolDefinition pattern from lib/prompts/types.ts
// These are NOT the Vercel AI SDK chat tools - those are in lib/retrieval/tools.ts

import type { ToolDefinition } from '@/lib/prompts/types'
import { formatTools } from '@/lib/prompts/format/tools'

// =============================================================================
// Executor Tool Definitions
// =============================================================================

/**
 * Tools available in the executor sandbox.
 * These are bound to user context and executed in generated code.
 *
 * Order matters: introspection first, then search, then graph, then utility.
 * This guides Claude to check what exists before searching blindly.
 */
export const EXECUTOR_TOOLS: ToolDefinition[] = [
  // INTROSPECTION - Check what exists before searching
  {
    name: 'getKnowledgeStats',
    description: 'Get overview of knowledge in scope: counts, date range, top topics.',
    usage: {
      when: 'START HERE for comprehensive/summary queries. Before searching, understand what exists.',
      notWhen: 'You know exactly what to search for.',
      example: 'User asks "give me everything we discussed" → first call getKnowledgeStats()',
    },
    parameters: [],
    sideEffects: 'read',
  },
  {
    name: 'getScopeDump',
    description: 'Get all knowledge in scope without search. Direct access to everything.',
    usage: {
      when: 'User asks for "everything", "all topics", "complete summary", or you need comprehensive access.',
      notWhen: 'Looking for specific topics - use semanticSearch instead.',
      example: 'const all = await getScopeDump({ limit: 100 })',
    },
    parameters: [
      { name: 'limit', type: 'number', description: 'Max items to return', required: false, example: '100' },
      { name: 'since', type: 'string', description: 'Filter by recency ("7d", "30d")', required: false },
    ],
    sideEffects: 'read',
  },

  // SEARCH - For finding specific content
  {
    name: 'semanticSearch',
    description: 'Vector similarity search. Finds conceptually related content.',
    usage: {
      when: 'Finding content ABOUT a specific topic. Natural language queries.',
      notWhen: 'Asking for "everything" - use getScopeDump instead.',
      example: 'await semanticSearch("project architecture", { threshold: 0.6 })',
    },
    parameters: [
      { name: 'query', type: 'string', description: 'The search query', required: true },
      { name: 'limit', type: 'number', description: 'Max results (default: 10)', required: false },
      { name: 'threshold', type: 'number', description: 'Min similarity 0-1 (default: 0.6)', required: false },
    ],
    sideEffects: 'read',
  },
  {
    name: 'keywordGrep',
    description: 'Exact text pattern matching. Fast and precise.',
    usage: {
      when: 'Finding exact mentions of names, terms, quoted phrases.',
      notWhen: 'Conceptual search - use semanticSearch instead.',
      example: 'await keywordGrep("TypeScript", { limit: 20 })',
    },
    parameters: [
      { name: 'pattern', type: 'string', description: 'Exact phrase to find', required: true },
      { name: 'caseSensitive', type: 'boolean', description: 'Case sensitive (default: false)', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default: 10)', required: false },
    ],
    sideEffects: 'read',
  },
  {
    name: 'searchByTime',
    description: 'Temporal queries. Find content from specific time periods.',
    usage: {
      when: 'Queries about "last week", "yesterday", "in January".',
      example: 'await searchByTime("7d", { query: "decisions" })',
    },
    parameters: [
      { name: 'since', type: 'string', description: 'Start: "yesterday", "7d", "2024-01-15"', required: true },
      { name: 'until', type: 'string', description: 'End (default: now)', required: false },
      { name: 'query', type: 'string', description: 'Optional semantic filter', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default: 15)', required: false },
    ],
    sideEffects: 'read',
  },

  // GRAPH - Following connections
  {
    name: 'getConnected',
    description: 'Follow graph edges from a node. Get related content.',
    usage: {
      when: 'After finding a relevant node, expand context.',
      notWhen: 'Initial search - find nodes first with search tools.',
      example: 'const related = await getConnected(node.eventId)',
    },
    parameters: [
      { name: 'nodeId', type: 'string', description: 'The eventId to expand from', required: true },
    ],
    sideEffects: 'read',
  },
  {
    name: 'getNodes',
    description: 'Fetch specific nodes by eventId array.',
    usage: {
      when: 'You have IDs and need full content.',
      example: 'await getNodes(["abc123", "def456"])',
    },
    parameters: [
      { name: 'ids', type: 'string[]', description: 'Array of eventIds', required: true },
    ],
    sideEffects: 'read',
  },

  // UTILITY
  {
    name: 'dedupe',
    description: 'Remove duplicate nodes by eventId.',
    usage: {
      when: 'After combining results from multiple searches.',
      example: 'dedupe([...semanticResults, ...grepResults])',
    },
    parameters: [
      { name: 'nodes', type: 'KnowledgeNode[]', description: 'Nodes to dedupe', required: true },
    ],
    sideEffects: 'none',
  },
]

// =============================================================================
// Composition Patterns
// =============================================================================

interface CompositionPattern {
  name: string
  triggers: string[]
  description: string
  code: string
}

/**
 * Recommended patterns for common query types.
 * Included in the prompt to guide Claude's strategy generation.
 */
export const COMPOSITION_PATTERNS: CompositionPattern[] = [
  {
    name: 'Comprehensive Summary',
    triggers: ['everything', 'all topics', 'summary of', 'what we discussed', 'overview'],
    description: 'For open-ended "give me everything" requests',
    code: `const stats = await getKnowledgeStats();
const all = await getScopeDump({ limit: 100 });
return { findings: all, confidence: 0.8, summary: \`Found \${stats.count} items across \${stats.topicClusters.length} topics\` };`,
  },
  {
    name: 'Specific Topic',
    triggers: ['about', 'regarding', 'related to', 'concerning'],
    description: 'Finding content about a specific topic',
    code: `const initial = await semanticSearch(topic, { threshold: 0.6 });
const expanded = await Promise.all(initial.slice(0, 5).map(n => getConnected(n.eventId)));
return { findings: dedupe([...initial, ...expanded.flat()]), confidence: 0.7 };`,
  },
  {
    name: 'Temporal Query',
    triggers: ['last week', 'yesterday', 'recently', 'when did'],
    description: 'Time-bounded queries',
    code: `const results = await searchByTime(timeframe, { limit: 50 });
return { findings: results, confidence: 0.75 };`,
  },
  {
    name: 'Entity Mentions',
    triggers: ['what did X say', 'mentions of', 'references to'],
    description: 'Finding mentions of specific entities',
    code: `const mentions = await keywordGrep(entity, { limit: 20 });
const withContext = await Promise.all(mentions.slice(0, 10).map(n => getConnected(n.eventId)));
return { findings: dedupe([...mentions, ...withContext.flat()]), confidence: 0.8 };`,
  },
]

// =============================================================================
// Prompt Generation
// =============================================================================

/**
 * Format composition patterns for the prompt.
 */
const formatPatterns = (): string => {
  const lines: string[] = ['## Composition Patterns', '']

  COMPOSITION_PATTERNS.forEach((pattern) => {
    lines.push(`### ${pattern.name}`)
    lines.push(`Triggers: ${pattern.triggers.join(', ')}`)
    lines.push('')
    lines.push('```javascript')
    lines.push(pattern.code)
    lines.push('```')
    lines.push('')
  })

  return lines.join('\n')
}

/**
 * Generate the complete HOW strategy prompt.
 * Uses established formatTools() for tool section.
 */
export const generateHowStrategyPrompt = (): string => {
  const toolSection = formatTools(EXECUTOR_TOOLS)
  const patternSection = formatPatterns()

  return `You are a retrieval specialist. Generate JavaScript code to search knowledge for the user's query.

${toolSection}

${patternSection}

## Output Format

Return: \`{ findings: [...nodes], confidence: 0-1, summary?: "brief explanation" }\`

## Key Guidelines

1. **Introspection first** for open-ended queries — getKnowledgeStats → getScopeDump
2. **Semantic search for topics**, NOT for "everything" queries
3. **Expand context** with getConnected after finding relevant nodes
4. **Combine strategies** — often need introspection + search + graph
5. **Lower thresholds** (0.4-0.5) for broad searches, higher (0.7+) for precise

## CRITICAL: Code Format

Write DIRECT code that ends with a return statement. Do NOT wrap code in a function definition.

WRONG (function never called):
\`\`\`javascript
async function search() {
  const results = await semanticSearch("topic");
  return { findings: results };
}
\`\`\`

CORRECT (direct code with return):
\`\`\`javascript
const results = await semanticSearch("topic");
return { findings: results, confidence: 0.7 };
\`\`\`

Write clean async JavaScript. Focus on finding what the user actually needs.`
}

// Re-export for use in primitives.ts
export { formatTools }
