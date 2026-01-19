// Followup prompt for background agent → Voyager push-based communication
// When a background task completes, this prompt helps Voyager synthesize findings
// into a natural follow-up message without user prompting.

import type { AgentTask } from '@/lib/agents/queue'

/**
 * Format a completed task's results for the followup prompt.
 * Gives Voyager the structured findings to synthesize.
 */
export const formatCompletedTaskForFollowup = (task: AgentTask): string => {
  const { findings, summary, confidence } = task.result ?? {}

  const lines = [
    `Original objective: ${task.task}`,
    `Found ${findings?.length ?? 0} relevant items (confidence: ${Math.round((confidence ?? 0) * 100)}%)`,
  ]

  if (summary) {
    lines.push(`Summary: ${summary}`)
  }

  if (findings && findings.length > 0) {
    lines.push('', 'Key findings:')
    findings.slice(0, 8).forEach((f) => {
      lines.push(`- ${f.content.slice(0, 300).replace(/\n/g, ' ')}`)
    })
    if (findings.length > 8) {
      lines.push(`- (${findings.length - 8} more items found)`)
    }
  }

  return lines.join('\n')
}

interface SimpleMessage {
  role: string
  content: string
}

/**
 * Compose the followup system prompt.
 * Includes conversation context so Voyager can intelligently place findings.
 */
export const composeFollowupPrompt = (
  taskContext: string,
  recentMessages: SimpleMessage[]
): string => {
  // Extract original user query (the message that triggered the search)
  const userMessages = recentMessages.filter((m) => m.role === 'user')
  const originalQuery = userMessages[userMessages.length - 1]?.content ?? ''

  // Extract what Voyager said when spawning (acknowledgment)
  const lastAssistant = recentMessages.filter((m) => m.role === 'assistant').pop()
  const voyagerAcknowledgment = lastAssistant?.content ?? ''

  return `You are Voyager. A background search you started has completed.

## Conversation Context

The user asked: "${originalQuery}"

You responded: "${voyagerAcknowledgment.slice(0, 200)}${voyagerAcknowledgment.length > 200 ? '...' : ''}"

## Search Results

${taskContext}

## Your Task

Synthesize these findings into a natural follow-up message.

Guidelines:
- Reference the original question naturally
- Don't repeat what you already said in your acknowledgment
- Start with something like "Looking deeper..." or "I found more context on..." or "Here's what I found..."
- Highlight the most relevant findings for their question
- If findings are sparse or off-topic, acknowledge briefly without over-explaining
- Be conversational, not robotic
- 2-4 sentences unless findings are substantial`
}
