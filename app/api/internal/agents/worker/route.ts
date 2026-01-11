// Background Agent Worker
// Polls for pending tasks, executes generated retrieval code, stores results
//
// Called by Vercel cron every minute
// Pattern: Claude as Query Compiler

import { NextResponse } from 'next/server'
import { claimNextTaskSimple, completeTask, failTask } from '@/lib/agents/queue'
import { executeRetrievalCode } from '@/lib/agents/executor'

// Vercel cron uses this header
export const runtime = 'nodejs'
export const maxDuration = 60 // 60 seconds max (Vercel Pro)

/**
 * Worker endpoint called by cron.
 * Claims one pending task, executes it, stores result.
 */
export async function POST(req: Request) {
  // Verify internal call (cron secret)
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[Worker] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Claim next pending task
    const task = await claimNextTaskSimple()

    if (!task) {
      // No pending tasks - this is normal
      return NextResponse.json({ processed: 0 })
    }

    console.log(`[Worker] Claimed task ${task.id}: ${task.task}`)

    const startTime = Date.now()

    try {
      // Execute the Claude-generated retrieval code
      const result = await executeRetrievalCode(task.code, {
        userId: task.userId,
        voyageSlug: task.voyageSlug,
        conversationId: task.conversationId,
      })

      const durationMs = Date.now() - startTime

      // Mark complete with result
      await completeTask(task.id, result, durationMs)

      console.log(
        `[Worker] Task ${task.id} completed in ${durationMs}ms: ${result.findings.length} findings`
      )

      return NextResponse.json({
        processed: 1,
        task_id: task.id,
        findings: result.findings.length,
        confidence: result.confidence,
        duration_ms: durationMs,
      })
    } catch (execError) {
      const durationMs = Date.now() - startTime
      const errorMessage =
        execError instanceof Error ? execError.message : 'Unknown execution error'

      console.error(`[Worker] Task ${task.id} failed after ${durationMs}ms:`, errorMessage)

      // Mark failed
      await failTask(task.id, errorMessage)

      return NextResponse.json({
        processed: 1,
        failed: true,
        task_id: task.id,
        error: errorMessage,
        duration_ms: durationMs,
      })
    }
  } catch (error) {
    console.error('[Worker] Worker error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Worker error' },
      { status: 500 }
    )
  }
}

/**
 * GET handler for health check / manual trigger in dev.
 */
export async function GET(req: Request) {
  // In development, allow manual triggering
  if (process.env.NODE_ENV === 'development') {
    // Fake the auth header for dev convenience
    const newReq = new Request(req.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    })
    return POST(newReq)
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Background agent worker. POST to execute.',
  })
}
