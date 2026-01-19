// Followup API endpoint
// Generates Voyager's follow-up message when background task completes.
// Called by UI when realtime subscription fires task completion.

import { streamText } from 'ai'
import { getTaskById } from '@/lib/agents/queue'
import { loadConversationMessages, saveMessage } from '@/lib/conversation'
import { composeFollowupPrompt, formatCompletedTaskForFollowup } from '@/lib/prompts/followup'
import { emitMessageEvent } from '@/lib/knowledge'
import { modelRouter } from '@/lib/models'
import { log } from '@/lib/debug'

export const maxDuration = 30

export const POST = async (req: Request) => {
  log.api('Followup request received')

  try {
    const { conversationId, taskId } = await req.json()

    if (!conversationId || !taskId) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'conversationId and taskId are required',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // 1. Fetch the completed task
    const task = await getTaskById(taskId)
    if (!task) {
      log.api('Followup failed - task not found', { taskId }, 'error')
      return new Response(
        JSON.stringify({
          error: 'Task not found',
          message: `No task found with ID: ${taskId}`,
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify task is complete
    if (task.status !== 'complete') {
      log.api('Followup failed - task not complete', { taskId, status: task.status }, 'warn')
      return new Response(
        JSON.stringify({
          error: 'Task not complete',
          message: `Task status is ${task.status}, expected complete`,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify task belongs to this conversation
    if (task.conversationId !== conversationId) {
      log.api('Followup failed - task/conversation mismatch', { taskId, conversationId }, 'warn')
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Task does not belong to this conversation',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // 2. Format task result as context
    const taskContext = formatCompletedTaskForFollowup(task)

    // 3. Load recent messages for continuity
    const recentMessages = await loadConversationMessages(conversationId, 10)
    const simpleMessages = recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // 4. Compose followup-specific prompt
    const systemPrompt = composeFollowupPrompt(taskContext, simpleMessages)

    log.agent('Generating followup', {
      taskId,
      conversationId,
      findingsCount: task.result?.findings?.length ?? 0,
      confidence: task.result?.confidence ?? 0,
    })

    // 5. Stream response (NO tools - pure synthesis)
    const result = streamText({
      model: modelRouter.select({
        task: 'synthesis',
        quality: 'balanced',
        streaming: true,
      }),
      system: systemPrompt,
      messages: [], // Context already in system prompt
      onFinish: async ({ text }) => {
        log.agent('Followup complete', { textLength: text?.length ?? 0 })

        // Save the followup message to the conversation
        if (text) {
          await saveMessage(conversationId, 'assistant', text)

          // Emit knowledge event
          emitMessageEvent(conversationId, 'assistant', text, {
            userId: task.userId,
            voyageSlug: task.voyageSlug,
          })
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    log.api('Followup API error', { error: String(error) }, 'error')

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Invalid JSON in request body',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        error: 'Internal error',
        message: 'An unexpected error occurred',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
