// Deep Retrieval Agent (Background Agent)
//
// Architecture (new):
// - Voyager (primary) decides when to spawn via spawn_background_agent tool
// - Background agent receives objective + context
// - Generates retrieval strategy (HOW)
// - Executes strategy, reports progress via realtime
// - Clusters and synthesizes findings
// - Results surface via Realtime (agent_tasks table)
//
// Legacy: runDeepRetrieval still works for automatic parallel path

import { generateText } from 'ai'
import { callGemini } from '@/lib/gemini/client'
import { executeRetrievalCode, type RetrievalResult } from './executor'
import { clusterFindings } from './clustering'
import { getClientForContext } from '@/lib/supabase/authenticated'
import type { KnowledgeNode } from '@/lib/knowledge'
import { modelRouter } from '@/lib/models'
import { classifySearchDepth } from './depth-classifier'
import { IF_DECISION_PROMPT, HOW_STRATEGY_PROMPT, SYNTHESIS_PROMPT } from './primitives'
import { updateTaskProgress } from './queue'
import { log } from '@/lib/debug'

// =============================================================================
// Types
// =============================================================================

/**
 * Input for background retrieval (spawned by Voyager via tool).
 */
export interface BackgroundRetrievalInput {
  taskId: string           // For progress updates
  objective: string        // What to find
  context: string          // Conversation context
  userId: string
  voyageSlug?: string
  conversationId: string
}

/**
 * Legacy input for automatic deep retrieval.
 * @deprecated Use BackgroundRetrievalInput for new code
 */
export interface DeepRetrievalInput {
  query: string
  conversationId: string
  userId: string
  voyageSlug?: string
  preRetrievalResults: KnowledgeNode[]
  conversationContext: string[] // Recent messages for context
}

interface IfDecision {
  shouldRetrieve: boolean
  reason: string
}

interface RetrievalStrategy {
  code: string
  reasoning: string
}

// =============================================================================
// Clustering Types (Two-Stage Compression)
// =============================================================================

export interface FindingCluster {
  id: string                    // UUID
  theme: string                 // "Pricing Decisions"
  summary: string               // 1-2 sentence cluster summary
  confidence: number            // Cluster coherence (0-1)
  findings: Array<{
    eventId: string
    content: string
    similarity?: number
    isPinned?: boolean
    connectedTo?: string[]
  }>
  representativeId: string      // eventId of most representative
}

export interface ClusteredResult {
  clusters: FindingCluster[]
  unclustered: Array<{
    eventId: string
    content: string
    similarity?: number
    isPinned?: boolean
    connectedTo?: string[]
  }>
  totalFindings: number
  clusteringMethod: 'topic' | 'temporal' | 'hybrid'
}

// What gets stored in agent_tasks.result
export interface DeepRetrievalResult {
  type: 'deep_retrieval'
  summary: string               // Voyager's synthesis
  clusters: FindingCluster[]    // For progressive disclosure
  unclustered: Array<{
    eventId: string
    content: string
    similarity?: number
    isPinned?: boolean
    connectedTo?: string[]
  }>
  confidence: number
  totalFindings: number
}

// =============================================================================
// IF Decision (Gemini Flash - fast, cheap)
// =============================================================================

/**
 * Gemini Flash decides IF deep retrieval is needed.
 * Returns quickly to minimize latency.
 */
async function decideIfRetrievalNeeded(input: DeepRetrievalInput): Promise<IfDecision> {
  const topSimilarity = input.preRetrievalResults[0]?.similarity ?? 0
  const hasStrongMatch = topSimilarity > 0.75
  const resultCount = input.preRetrievalResults.length

  const userPrompt = `Query: "${input.query}"

Pre-retrieval results: ${resultCount} items found
Top result similarity: ${topSimilarity.toFixed(2)}
Has strong match: ${hasStrongMatch}

Recent conversation context:
${input.conversationContext.slice(-3).join('\n')}

Should I do deep retrieval? Answer YES or NO, then a brief reason (one sentence).`

  try {
    const response = await callGemini({
      systemPrompt: IF_DECISION_PROMPT,
      userPrompt,
      temperature: 0.1,
      maxTokens: 100,
    })

    const text = response.text.trim()
    const shouldRetrieve = text.toUpperCase().startsWith('YES')

    console.log('[DeepRetrieval] IF decision:', { shouldRetrieve, reason: text })

    return { shouldRetrieve, reason: text }
  } catch (error) {
    console.error('[DeepRetrieval] IF decision failed:', error)
    // On error, default to no retrieval (conservative)
    return { shouldRetrieve: false, reason: 'Decision failed, skipping deep retrieval' }
  }
}

// =============================================================================
// HOW Decision (Claude - strategy generation)
// =============================================================================

/**
 * Claude generates a retrieval strategy as executable code.
 * This is the "Claude as Query Compiler" pattern.
 */
async function generateRetrievalStrategy(
  input: DeepRetrievalInput,
  ifReason: string
): Promise<RetrievalStrategy> {
  const userPrompt = `Query: "${input.query}"

Decision context: ${ifReason}

Pre-retrieval found ${input.preRetrievalResults.length} results.
${input.preRetrievalResults.length > 0 ? `Top topics: ${input.preRetrievalResults.slice(0, 3).map(n => n.content.slice(0, 50)).join(', ')}...` : 'No pre-retrieval results.'}

Write retrieval code to deeply search for information about this query. Return { findings, confidence, summary }.`

  try {
    const response = await generateText({
      model: modelRouter.select({ task: 'synthesis', quality: 'balanced' }),
      system: HOW_STRATEGY_PROMPT,
      prompt: userPrompt,
    })

    // Extract code from response (handle markdown code blocks)
    let code = response.text.trim()
    if (code.startsWith('```javascript') || code.startsWith('```js')) {
      code = code.replace(/^```(?:javascript|js)\n?/, '').replace(/```$/, '')
    } else if (code.startsWith('```')) {
      code = code.replace(/^```\n?/, '').replace(/```$/, '')
    }

    console.log('[DeepRetrieval] Generated strategy:', code.slice(0, 200) + '...')

    return { code, reasoning: ifReason }
  } catch (error) {
    console.error('[DeepRetrieval] Strategy generation failed:', error)
    throw error
  }
}

// =============================================================================
// Voyager Synthesis (Claude - conversational follow-up)
// =============================================================================

/**
 * Voyager synthesizes clustered findings into a conversational follow-up.
 * This maintains the "same Voyager voice" across fast and deep paths.
 */
async function synthesizeClusters(
  clustered: ClusteredResult,
  originalQuery: string,
  conversationContext: string[]
): Promise<string> {
  if (clustered.totalFindings === 0) {
    return '' // Nothing to synthesize
  }

  // Build compact representation of clusters for synthesis
  const clustersText = clustered.clusters
    .map((c, i) => {
      const representative = c.findings.find(f => f.eventId === c.representativeId) ?? c.findings[0]
      return `Cluster ${i + 1}: "${c.theme}" (${c.findings.length} items)
Summary: ${c.summary}
Example: ${representative?.content.slice(0, 200)}...`
    })
    .join('\n\n')

  const unclusteredNote = clustered.unclustered.length > 0
    ? `\n\n+ ${clustered.unclustered.length} additional items that didn't fit a clear theme.`
    : ''

  // Include recent conversation for natural follow-up
  const recentContext = conversationContext.length > 0
    ? `\nRecent conversation:\n${conversationContext.slice(-3).join('\n')}\n`
    : ''

  const userPrompt = `Original query: "${originalQuery}"
${recentContext}
Deep search found ${clustered.totalFindings} results, organized into ${clustered.clusters.length} themes:

${clustersText}${unclusteredNote}

Write a conversational follow-up (2-4 sentences) that connects these findings to the conversation. Be natural, don't just list themes:`

  try {
    const response = await generateText({
      model: modelRouter.select({ task: 'synthesis', quality: 'balanced' }),
      system: SYNTHESIS_PROMPT,
      prompt: userPrompt,
    })

    return response.text.trim()
  } catch (error) {
    console.error('[DeepRetrieval] Synthesis failed:', error)
    // Fallback: list themes
    const themeList = clustered.clusters.map(c => c.theme).join(', ')
    return `I found ${clustered.totalFindings} additional items organized into themes: ${themeList}. Click to expand any theme for details.`
  }
}

// =============================================================================
// Save Result (for Realtime surfacing)
// =============================================================================

/**
 * Save the clustered result to agent_tasks for Realtime surfacing.
 * Stores full cluster structure for progressive disclosure UI.
 */
async function saveAgentResult(
  conversationId: string,
  userId: string,
  result: {
    summary: string
    clustered: ClusteredResult
    confidence: number
  }
): Promise<void> {
  const supabase = getClientForContext({ userId })

  // Build result conforming to DeepRetrievalResult interface
  const dbResult: DeepRetrievalResult = {
    type: 'deep_retrieval',
    summary: result.summary,
    clusters: result.clustered.clusters,
    unclustered: result.clustered.unclustered,
    confidence: result.confidence,
    totalFindings: result.clustered.totalFindings,
  }

  // Note: Using type assertion until we regenerate Supabase types
  const { error } = await (supabase as any)
    .from('agent_tasks')
    .insert({
      task: 'deep_retrieval',
      code: '', // Not used for this type
      priority: 'normal',
      user_id: userId,
      conversation_id: conversationId,
      status: 'complete',
      completed_at: new Date().toISOString(),
      result: dbResult,
    })

  if (error) {
    console.error('[DeepRetrieval] Failed to save result:', error)
    throw error
  }

  console.log('[DeepRetrieval] Result saved for conversation:', conversationId)
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run deep retrieval in parallel via waitUntil.
 * This is the entry point called from the chat route.
 *
 * Flow:
 * 1. IF decision (Gemini Flash) - should we search deeper?
 * 2. HOW decision (Claude) - what strategy to use?
 * 3. Execute (Code executor) - run the strategy
 * 4. Synthesize (Claude) - conversational follow-up
 * 5. Surface (Realtime) - save for UI to pick up
 */
export async function runDeepRetrieval(input: DeepRetrievalInput): Promise<void> {
  const startTime = Date.now()

  console.log('[DeepRetrieval] Starting for query:', input.query.slice(0, 50) + '...')

  // Step 0: Depth classification (fast heuristics)
  const depth = classifySearchDepth(input.query)
  console.log('[DeepRetrieval] Depth classified as:', depth)

  // Quick queries skip deep path entirely
  if (depth === 'quick') {
    console.log('[DeepRetrieval] Skipping - quick query, pre-retrieval sufficient')
    return
  }

  // Comprehensive queries skip IF decision - always go deep
  let ifDecision: IfDecision
  if (depth === 'comprehensive') {
    console.log('[DeepRetrieval] Comprehensive query - skipping IF, going deep')
    ifDecision = { shouldRetrieve: true, reason: 'Comprehensive query detected' }
  } else {
    // Standard: let IF decision gate
    ifDecision = await decideIfRetrievalNeeded(input)
  }

  if (!ifDecision.shouldRetrieve) {
    console.log('[DeepRetrieval] Skipping - not needed:', ifDecision.reason)
    return // Early exit - no deep search needed
  }

  try {
    // Step 2: HOW decision (Claude - strategy generation)
    const strategy = await generateRetrievalStrategy(input, ifDecision.reason)

    // Step 3: Execute retrieval code
    const findings = await executeRetrievalCode(strategy.code, {
      userId: input.userId,
      voyageSlug: input.voyageSlug,
      conversationId: input.conversationId,
    })

    console.log('[DeepRetrieval] Execution complete:', {
      findingsCount: findings.findings.length,
      confidence: findings.confidence,
      durationMs: Date.now() - startTime,
    })

    // Skip if no findings
    if (findings.findings.length === 0) {
      console.log('[DeepRetrieval] No findings, skipping synthesis')
      return
    }

    // Step 3.5: Cluster findings (Gemini Flash for 10+ findings)
    // Small result sets get a single "Results" cluster, no LLM overhead
    const clustered = await clusterFindings(findings.findings, input.query)

    console.log('[DeepRetrieval] Clustering complete:', {
      clusters: clustered.clusters.length,
      unclustered: clustered.unclustered.length,
      method: clustered.clusteringMethod,
    })

    // Step 4: Synthesize clusters (Claude - same Voyager voice)
    const synthesis = await synthesizeClusters(clustered, input.query, input.conversationContext)

    // Skip if synthesis is empty
    if (!synthesis) {
      console.log('[DeepRetrieval] Empty synthesis, skipping save')
      return
    }

    // Step 5: Save for Realtime surfacing (with cluster structure)
    await saveAgentResult(input.conversationId, input.userId, {
      summary: synthesis,
      clustered,
      confidence: findings.confidence,
    })

    console.log('[DeepRetrieval] Complete:', {
      durationMs: Date.now() - startTime,
      findingsCount: findings.findings.length,
      clusters: clustered.clusters.length,
    })
  } catch (error) {
    console.error('[DeepRetrieval] Failed:', error)
    // Don't throw - this runs in background, shouldn't affect user experience
  }
}

// =============================================================================
// Background Retrieval (New Agent Model)
// =============================================================================

/**
 * Generate retrieval strategy from objective.
 * Claude interprets the objective and generates executable code.
 */
async function generateStrategyFromObjective(
  objective: string,
  context: string
): Promise<{ code: string }> {
  const userPrompt = `Objective: "${objective}"

${context ? `Context from conversation:\n${context}\n` : ''}

Write retrieval code to comprehensively search for information about this objective.
Use multiple strategies: semantic search, keyword grep, connected nodes, time-based search.
Return { findings, confidence, summary }.`

  const response = await generateText({
    model: modelRouter.select({ task: 'synthesis', quality: 'balanced' }),
    system: HOW_STRATEGY_PROMPT,
    prompt: userPrompt,
  })

  // Extract code from response (handle markdown code blocks)
  let code = response.text.trim()
  if (code.startsWith('```javascript') || code.startsWith('```js')) {
    code = code.replace(/^```(?:javascript|js)\n?/, '').replace(/```$/, '')
  } else if (code.startsWith('```')) {
    code = code.replace(/^```\n?/, '').replace(/```$/, '')
  }

  console.log('[BackgroundRetrieval] Generated strategy:', code.slice(0, 200) + '...')

  return { code }
}

/**
 * Run background retrieval as a spawned agent.
 * Called by spawn_background_agent tool.
 *
 * Flow:
 * 1. Generate strategy from objective (HOW)
 * 2. Execute strategy (with progress updates)
 * 3. Cluster findings
 * 4. Synthesize into conversational follow-up
 * 5. Return result (caller saves to agent_tasks)
 */
export async function runBackgroundRetrieval(
  input: BackgroundRetrievalInput
): Promise<RetrievalResult> {
  const { taskId, objective, context, userId, voyageSlug, conversationId } = input
  const startTime = Date.now()
  const shortTaskId = taskId.slice(0, 8)

  log.agent(`[${shortTaskId}] === BACKGROUND RETRIEVAL START ===`, {
    objective: objective.slice(0, 100),
    context: context?.slice(0, 100),
    userId: userId.slice(0, 8),
    voyageSlug,
    conversationId: conversationId.slice(0, 8),
  })

  try {
    // Step 1: Generate strategy
    log.agent(`[${shortTaskId}] Step 1: Generating strategy...`)
    await updateTaskProgress(taskId, { stage: 'analyzing', percent: 10 })
    const strategyStart = Date.now()
    const strategy = await generateStrategyFromObjective(objective, context)
    log.agent(`[${shortTaskId}] Strategy generated in ${Date.now() - strategyStart}ms`, {
      codeLength: strategy.code.length,
      codePreview: strategy.code.slice(0, 300),
    })

    // Step 2: Execute retrieval
    log.agent(`[${shortTaskId}] Step 2: Executing retrieval code...`)
    await updateTaskProgress(taskId, { stage: 'searching', percent: 30 })
    const execStart = Date.now()
    const findings = await executeRetrievalCode(strategy.code, {
      userId,
      voyageSlug,
      conversationId,
    })

    log.agent(`[${shortTaskId}] Execution complete in ${Date.now() - execStart}ms`, {
      findingsCount: findings.findings.length,
      confidence: findings.confidence,
      summary: findings.summary?.slice(0, 100),
      firstFinding: findings.findings[0]?.content.slice(0, 100),
    })

    // Skip if no findings
    if (findings.findings.length === 0) {
      log.agent(`[${shortTaskId}] No findings - returning empty`, {}, 'warn')
      return {
        findings: [],
        confidence: 0,
        summary: 'No relevant information found.',
      }
    }

    // Step 3: Cluster findings
    log.agent(`[${shortTaskId}] Step 3: Clustering ${findings.findings.length} findings...`)
    await updateTaskProgress(taskId, {
      stage: 'clustering',
      found: findings.findings.length,
      percent: 60,
    })
    const clusterStart = Date.now()
    const clustered = await clusterFindings(findings.findings, objective)

    log.agent(`[${shortTaskId}] Clustering complete in ${Date.now() - clusterStart}ms`, {
      clusters: clustered.clusters.length,
      unclustered: clustered.unclustered.length,
      method: clustered.clusteringMethod,
    })

    // Step 4: Synthesize
    log.agent(`[${shortTaskId}] Step 4: Synthesizing...`)
    await updateTaskProgress(taskId, {
      stage: 'synthesizing',
      found: findings.findings.length,
      percent: 80,
    })
    const synthStart = Date.now()
    const synthesis = await synthesizeClusters(clustered, objective, context ? [context] : [])

    log.agent(`[${shortTaskId}] === BACKGROUND RETRIEVAL COMPLETE ===`, {
      totalDurationMs: Date.now() - startTime,
      findingsCount: findings.findings.length,
      clusters: clustered.clusters.length,
      synthesisDurationMs: Date.now() - synthStart,
      synthesisPreview: synthesis?.slice(0, 200),
    })

    // Return result (caller will save to agent_tasks)
    return {
      findings: findings.findings,
      confidence: findings.confidence,
      summary: synthesis || `Found ${findings.findings.length} items organized into ${clustered.clusters.length} themes.`,
    }
  } catch (error) {
    log.agent(`[${shortTaskId}] === BACKGROUND RETRIEVAL FAILED ===`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      durationMs: Date.now() - startTime,
    }, 'error')
    throw error // Let caller handle (failTask)
  }
}
