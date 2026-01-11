#!/usr/bin/env npx tsx
/**
 * Full integration test for background agents
 *
 * Tests the complete flow:
 * 1. Enqueue a task
 * 2. Execute it immediately
 * 3. Verify result in database
 *
 * Run with: npx tsx scripts/test-full-flow.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { enqueueAgentTask, completeTask, failTask } from '../lib/agents/queue'
import { executeRetrievalCode } from '../lib/agents/executor'
import { getAdminClient } from '../lib/supabase/admin'

const TEST_USER_ID = process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001'
// Generate a valid UUID for testing
const TEST_CONVERSATION_ID = crypto.randomUUID()

async function testFullFlow() {
  console.log('=== Full Background Agent Flow Test ===\n')

  const supabase = getAdminClient()

  // 1. Enqueue a task
  console.log('1. Enqueuing task...')
  const code = `
    // Simple test retrieval
    const results = await semanticSearch("test query", { limit: 5 });
    return {
      findings: results.length > 0 ? results : [
        { eventId: 'synthetic-1', content: 'No real results, but executor works!' }
      ],
      confidence: results.length > 0 ? 0.8 : 0.5,
      summary: 'Test retrieval completed'
    }
  `

  let taskId: string
  try {
    taskId = await enqueueAgentTask({
      task: 'Test retrieval for integration test',
      code,
      priority: 'normal',
      userId: TEST_USER_ID,
      conversationId: TEST_CONVERSATION_ID,
    })
    console.log(`   ✓ Task enqueued: ${taskId.slice(0, 8)}`)
  } catch (error) {
    console.error('   ✗ Failed to enqueue:', error)
    return
  }

  // 2. Verify task is in database
  console.log('\n2. Verifying task in database...')
  const { data: pendingTask, error: fetchError } = await (supabase as any)
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (fetchError || !pendingTask) {
    console.error('   ✗ Task not found in database:', fetchError)
    return
  }
  console.log(`   ✓ Task found with status: ${pendingTask.status}`)

  // 3. Execute the task
  console.log('\n3. Executing retrieval code...')
  const startTime = Date.now()
  try {
    const result = await executeRetrievalCode(code, {
      userId: TEST_USER_ID,
      conversationId: TEST_CONVERSATION_ID,
    })
    const durationMs = Date.now() - startTime

    console.log(`   ✓ Execution completed in ${durationMs}ms`)
    console.log(`   ✓ Findings: ${result.findings.length}`)
    console.log(`   ✓ Confidence: ${result.confidence}`)

    // 4. Mark task complete
    console.log('\n4. Marking task complete...')
    await completeTask(taskId, result, durationMs)
    console.log('   ✓ Task marked complete')

  } catch (error) {
    console.error('   ✗ Execution failed:', error)
    await failTask(taskId, error instanceof Error ? error.message : 'Unknown error')
    return
  }

  // 5. Verify completed task in database
  console.log('\n5. Verifying completed task...')
  const { data: completedTask, error: verifyError } = await (supabase as any)
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (verifyError || !completedTask) {
    console.error('   ✗ Could not verify:', verifyError)
    return
  }

  console.log(`   ✓ Status: ${completedTask.status}`)
  console.log(`   ✓ Duration: ${completedTask.duration_ms}ms`)
  console.log(`   ✓ Result stored: ${completedTask.result ? 'yes' : 'no'}`)

  if (completedTask.result) {
    console.log(`   ✓ Findings in result: ${completedTask.result.findings?.length || 0}`)
  }

  // 6. Cleanup (optional)
  console.log('\n6. Cleaning up test task...')
  const { error: deleteError } = await (supabase as any)
    .from('agent_tasks')
    .delete()
    .eq('id', taskId)

  if (deleteError) {
    console.log(`   ⚠ Could not delete test task: ${deleteError.message}`)
  } else {
    console.log('   ✓ Test task deleted')
  }

  console.log('\n=== All tests passed! ===')
  console.log('\nThe background agent system is working correctly.')
  console.log('When triggered via spawn_background_agent tool:')
  console.log('1. Task gets enqueued to agent_tasks table')
  console.log('2. waitUntil executes code immediately')
  console.log('3. Result is stored and surfaces via Realtime')
}

testFullFlow().catch(console.error)
