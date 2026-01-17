// Deep Retrieval Agent
// Runs in parallel via waitUntil to provide "initial results THEN more detail"
//
// Architecture:
// 1. Gemini Flash decides IF retrieval is needed (fast, cheap)
// 2. If yes, Claude generates retrieval strategy (HOW)
// 3. Executor runs the strategy code
// 4. Claude synthesizes findings into conversational follow-up
// 5. Results surface via Realtime (agent_tasks table)

import { generateText } from 'ai'
import { callGemini } from '@/lib/gemini/client'
import { executeRetrievalCode, type RetrievalResult } from './executor'
import { getClientForContext } from '@/lib/supabase/authenticated'
import type { KnowledgeNode } from '@/lib/knowledge'
import { modelRouter } from '@/lib/models'
import { classifySearchDepth } from './depth-classifier'
import { IF_DECISION_PROMPT, HOW_STRATEGY_PROMPT, SYNTHESIS_PROMPT } from './primitives'

// =============================================================================
// Types
// =============================================================================

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
 * Voyager synthesizes raw findings into a conversational follow-up.
 * This maintains the "same Voyager voice" across fast and deep paths.
 */
async function synthesizeFindings(
  findings: RetrievalResult,
  originalQuery: string
): Promise<string> {
  if (findings.findings.length === 0) {
    return '' // Nothing to synthesize
  }

  const findingsText = findings.findings
    .slice(0, 5)
    .map((f, i) => `${i + 1}. ${f.content.slice(0, 300)}${f.content.length > 300 ? '...' : ''}`)
    .join('\n\n')

  const userPrompt = `Original query: "${originalQuery}"

Deep search found ${findings.findings.length} results (confidence: ${findings.confidence.toFixed(2)}):

${findingsText}

${findings.summary ? `Agent summary: ${findings.summary}` : ''}

Write a conversational follow-up to share these findings:`

  try {
    const response = await generateText({
      model: modelRouter.select({ task: 'synthesis', quality: 'balanced' }),
      system: SYNTHESIS_PROMPT,
      prompt: userPrompt,
    })

    return response.text.trim()
  } catch (error) {
    console.error('[DeepRetrieval] Synthesis failed:', error)
    // Fallback: return a generic message
    return `I found ${findings.findings.length} additional items that might be relevant. Let me know if you'd like me to elaborate.`
  }
}

// =============================================================================
// Save Result (for Realtime surfacing)
// =============================================================================

/**
 * Save the synthesized result to agent_tasks for Realtime surfacing.
 */
async function saveAgentResult(
  conversationId: string,
  userId: string,
  result: {
    summary: string
    findings: RetrievalResult['findings']
    confidence: number
  }
): Promise<void> {
  const supabase = getClientForContext({ userId })

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
      result: {
        summary: result.summary,
        findings: result.findings,
        confidence: result.confidence,
        type: 'deep_retrieval', // For UI to identify result type
      },
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

    // Step 4: Synthesize findings (Claude - same Voyager voice)
    const synthesis = await synthesizeFindings(findings, input.query)

    // Skip if synthesis is empty
    if (!synthesis) {
      console.log('[DeepRetrieval] Empty synthesis, skipping save')
      return
    }

    // Step 5: Save for Realtime surfacing
    await saveAgentResult(input.conversationId, input.userId, {
      summary: synthesis,
      findings: findings.findings,
      confidence: findings.confidence,
    })

    console.log('[DeepRetrieval] Complete:', {
      durationMs: Date.now() - startTime,
      findingsCount: findings.findings.length,
    })
  } catch (error) {
    console.error('[DeepRetrieval] Failed:', error)
    // Don't throw - this runs in background, shouldn't affect user experience
  }
}
