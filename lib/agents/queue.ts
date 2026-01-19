// Agent Task Queue
// Manages background retrieval tasks for the "Claude as Query Compiler" pattern

import { getAdminClient } from '@/lib/supabase/admin'
import { getClientForContext } from '@/lib/supabase/authenticated'

// =============================================================================
// Types
// =============================================================================

export interface AgentTask {
  id: string
  task: string
  code: string
  priority: 'low' | 'normal' | 'high'
  userId: string
  voyageSlug?: string
  conversationId: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  result?: RetrievalResult
  error?: string
  durationMs?: number
  createdAt: Date
}

export interface RetrievalResult {
  findings: Array<{
    eventId: string
    content: string
    similarity?: number
    isPinned?: boolean
    connectedTo?: string[]
  }>
  confidence: number
  summary?: string
}

export interface EnqueueParams {
  task: string
  code: string
  priority?: 'low' | 'normal' | 'high'
  userId: string
  voyageSlug?: string
  conversationId: string
}

// =============================================================================
// Queue Operations
// =============================================================================

/**
 * Enqueue a new agent task.
 * Called by the spawn_background_agent tool.
 */
export async function enqueueAgentTask(params: EnqueueParams): Promise<string> {
  // Use authenticated client - user is creating their own task
  const supabase = getClientForContext({ userId: params.userId })

  // Note: Using type assertion until we regenerate Supabase types
  const { data, error } = await (supabase as any)
    .from('agent_tasks')
    .insert({
      task: params.task,
      code: params.code,
      priority: params.priority ?? 'normal',
      user_id: params.userId,
      voyage_slug: params.voyageSlug,
      conversation_id: params.conversationId,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[AgentQueue] Failed to enqueue task:', error)
    throw new Error(`Failed to enqueue agent task: ${error.message}`)
  }

  console.log(`[AgentQueue] Task enqueued: ${(data as { id: string }).id}`)
  return (data as { id: string }).id
}

/**
 * Claim the next pending task (atomic operation).
 * Called by the background worker.
 */
export async function claimNextTask(): Promise<AgentTask | null> {
  const supabase = getAdminClient()

  // Atomic claim: update status to 'running' and return the row
  // Using raw SQL to ensure atomicity with FOR UPDATE SKIP LOCKED
  // Note: Using type assertion until we regenerate Supabase types
  const { data, error } = await (supabase as any).rpc('claim_agent_task')

  if (error) {
    // No task available is not an error
    if (error.message.includes('No pending tasks')) {
      return null
    }
    console.error('[AgentQueue] Failed to claim task:', error)
    throw new Error(`Failed to claim task: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return {
    id: data.id as string,
    task: data.task as string,
    code: data.code as string,
    priority: data.priority as 'low' | 'normal' | 'high',
    userId: data.user_id as string,
    voyageSlug: data.voyage_slug as string | undefined,
    conversationId: data.conversation_id as string,
    status: data.status as AgentTask['status'],
    createdAt: new Date(data.created_at as string),
  }
}

/**
 * Simple claim without RPC (fallback).
 * Less atomic but works without custom function.
 */
export async function claimNextTaskSimple(): Promise<AgentTask | null> {
  const supabase = getAdminClient()

  // First, find a pending task
  // Note: Using type assertion until we regenerate Supabase types
  const { data: pending, error: findError } = await (supabase as any)
    .from('agent_tasks')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false }) // high > normal > low
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (findError || !pending) {
    return null
  }

  // Update it to running
  const { data, error } = await (supabase as any)
    .from('agent_tasks')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', pending.id)
    .eq('status', 'pending') // Ensure still pending (optimistic locking)
    .select('*')
    .single()

  if (error || !data) {
    // Another worker claimed it, try again
    return null
  }

  return {
    id: data.id as string,
    task: data.task as string,
    code: data.code as string,
    priority: data.priority as 'low' | 'normal' | 'high',
    userId: data.user_id as string,
    voyageSlug: data.voyage_slug as string | undefined,
    conversationId: data.conversation_id as string,
    status: data.status as AgentTask['status'],
    createdAt: new Date(data.created_at as string),
  }
}

/**
 * Task progress shape for realtime updates.
 */
export interface TaskProgress {
  stage: 'searching' | 'analyzing' | 'clustering' | 'synthesizing'
  found?: number
  processed?: number
  percent?: number
}

/**
 * Update task progress (for realtime UI updates).
 * Called by background agents to report progress.
 */
export async function updateTaskProgress(
  taskId: string,
  progress: TaskProgress
): Promise<void> {
  const supabase = getAdminClient()

  const { error } = await (supabase as any)
    .from('agent_tasks')
    .update({
      status: 'running',
      progress,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    console.error('[AgentQueue] Failed to update progress:', error)
    // Don't throw - progress updates are non-critical
  }
}

/**
 * Mark a task as complete with results.
 */
export async function completeTask(
  taskId: string,
  result: RetrievalResult,
  durationMs: number
): Promise<void> {
  const supabase = getAdminClient()

  // Note: Using type assertion until we regenerate Supabase types
  const { error } = await (supabase as any)
    .from('agent_tasks')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      result,
      duration_ms: durationMs,
    })
    .eq('id', taskId)

  if (error) {
    console.error('[AgentQueue] Failed to complete task:', error)
    throw new Error(`Failed to complete task: ${error.message}`)
  }

  console.log(`[AgentQueue] Task completed: ${taskId} (${durationMs}ms)`)
}

/**
 * Mark a task as failed with error.
 */
export async function failTask(taskId: string, errorMessage: string): Promise<void> {
  const supabase = getAdminClient()

  // Note: Using type assertion until we regenerate Supabase types
  const { error } = await (supabase as any)
    .from('agent_tasks')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq('id', taskId)

  if (error) {
    console.error('[AgentQueue] Failed to mark task as failed:', error)
    throw new Error(`Failed to fail task: ${error.message}`)
  }

  console.log(`[AgentQueue] Task failed: ${taskId} - ${errorMessage}`)
}

/**
 * Get pending task count (for monitoring).
 */
export async function getPendingCount(): Promise<number> {
  const supabase = getAdminClient()

  // Note: Using type assertion until we regenerate Supabase types
  const { count, error } = await (supabase as any)
    .from('agent_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (error) {
    console.error('[AgentQueue] Failed to get pending count:', error)
    return 0
  }

  return count ?? 0
}
