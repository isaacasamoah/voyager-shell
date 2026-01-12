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
import { anthropic } from '@ai-sdk/anthropic'
import { callGemini } from '@/lib/gemini/client'
import { executeRetrievalCode, type RetrievalResult } from './executor'
import { getAdminClient } from '@/lib/supabase/admin'
import type { KnowledgeNode } from '@/lib/knowledge'

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

  const systemPrompt = `You decide if a query needs deep retrieval beyond what was already pre-fetched.

Say NO for:
- Greetings, acknowledgments, simple thank yous
- Questions where pre-retrieval found strong matches (similarity > 0.75)
- Follow-up questions about information already in the conversation
- Simple factual questions already answered in context

Say YES for:
- Complex queries spanning multiple topics or time periods
- Requests for comprehensive summaries or overviews
- Questions about history, timelines, or changes over time
- When pre-retrieval found weak or no matches
- Explicit requests to "find more" or "search deeper"

Be conservative. Only say YES when deeper search would actually add value.`

  const userPrompt = `Query: "${input.query}"

Pre-retrieval results: ${resultCount} items found
Top result similarity: ${topSimilarity.toFixed(2)}
Has strong match: ${hasStrongMatch}

Recent conversation context:
${input.conversationContext.slice(-3).join('\n')}

Should I do deep retrieval? Answer YES or NO, then a brief reason (one sentence).`

  try {
    const response = await callGemini({
      systemPrompt,
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
  const systemPrompt = `You are a retrieval specialist. Generate JavaScript code to deeply search knowledge for the user's query.

Available functions:
- semanticSearch(query, { limit?, threshold? }) - Returns nodes with: eventId, content, similarity
- keywordGrep(pattern, { caseSensitive?, limit? }) - Returns nodes with: eventId, content
- getConnected(nodeId) - Follow graph edges. IMPORTANT: Pass node.eventId (not node.id)
- searchByTime(since, { until?, query?, limit? }) - Temporal queries ("last week", "yesterday")
- getNodes(ids) - Fetch nodes by ID array
- dedupe(nodes) - Remove duplicates by eventId

Node properties: { eventId, content, similarity?, isPinned?, connectedTo? }
Use node.eventId when calling getConnected, not node.id.

Strategy chains:
- semantic → getConnected → keywordGrep (concept → context → precision)
- searchByTime → semantic (when → what)

Return: { findings: [...nodes], confidence: 0-1, summary?: "brief explanation" }

Write clean, async JavaScript. Focus on effectiveness.`

  const userPrompt = `Query: "${input.query}"

Decision context: ${ifReason}

Pre-retrieval found ${input.preRetrievalResults.length} results.
${input.preRetrievalResults.length > 0 ? `Top topics: ${input.preRetrievalResults.slice(0, 3).map(n => n.content.slice(0, 50)).join(', ')}...` : 'No pre-retrieval results.'}

Write retrieval code to deeply search for information about this query. Return { findings, confidence, summary }.`

  try {
    const response = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
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

  const systemPrompt = `You are Voyager, continuing a conversation.
The user asked a question and you already gave an initial response.
Now you have additional context from a deeper search.

Write a brief, natural follow-up (2-4 sentences).
Start with "I found more context..." or "Also relevant..." or "Looking deeper, I found..."
Don't repeat what was likely in the initial response.
Speak conversationally, not as a list.
If the findings add significant new information, highlight it.
If the findings mostly confirm the initial response, say so briefly.`

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
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
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
  const supabase = getAdminClient()

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

  // Step 1: IF decision (Gemini Flash - fast)
  const ifDecision = await decideIfRetrievalNeeded(input)

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
