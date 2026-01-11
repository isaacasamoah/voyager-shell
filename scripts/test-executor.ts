#!/usr/bin/env npx tsx
/**
 * Test script for the background agent executor
 *
 * Run with: npx tsx scripts/test-executor.ts
 */

import { config } from 'dotenv'
// Load env vars from .env.local
config({ path: '.env.local' })

import { executeRetrievalCode } from '../lib/agents/executor'

// Test context - use a real user ID from your database
const TEST_CONTEXT = {
  userId: process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001',
  conversationId: 'test-conversation-' + Date.now(),
}

async function testBasicExecution() {
  console.log('\n=== Test 1: Basic execution ===')

  const code = `
    return {
      findings: [
        { eventId: 'test-1', content: 'Test finding 1' },
        { eventId: 'test-2', content: 'Test finding 2' },
      ],
      confidence: 0.9,
      summary: 'Found 2 test items'
    }
  `

  try {
    const result = await executeRetrievalCode(code, TEST_CONTEXT)
    console.log('Result:', JSON.stringify(result, null, 2))
    console.log('✓ Basic execution works')
  } catch (error) {
    console.error('✗ Failed:', error)
  }
}

async function testSemanticSearch() {
  console.log('\n=== Test 2: Semantic search ===')

  const code = `
    const results = await semanticSearch("test", { limit: 3 });
    return {
      findings: results,
      confidence: results.length > 0 ? 0.8 : 0.2,
      summary: \`Found \${results.length} results for "test"\`
    }
  `

  try {
    const result = await executeRetrievalCode(code, TEST_CONTEXT)
    console.log('Result:', JSON.stringify(result, null, 2))
    console.log('✓ Semantic search works')
  } catch (error) {
    console.error('✗ Failed:', error)
  }
}

async function testKeywordGrep() {
  console.log('\n=== Test 3: Keyword grep ===')

  const code = `
    const results = await keywordGrep("voyager");
    return {
      findings: results,
      confidence: results.length > 0 ? 0.9 : 0.1
    }
  `

  try {
    const result = await executeRetrievalCode(code, TEST_CONTEXT)
    console.log('Result:', JSON.stringify(result, null, 2))
    console.log('✓ Keyword grep works')
  } catch (error) {
    console.error('✗ Failed:', error)
  }
}

async function testChainedRetrieval() {
  console.log('\n=== Test 4: Chained retrieval ===')

  const code = `
    // Start with semantic search
    const broad = await semanticSearch("decision", { limit: 5 });

    // Follow connections from first result
    let connected = [];
    if (broad.length > 0) {
      connected = await getConnected(broad[0].eventId);
    }

    // Combine and dedupe
    const all = dedupe([...broad, ...connected]);

    return {
      findings: all,
      confidence: all.length > 2 ? 0.85 : 0.5,
      summary: \`Found \${broad.length} semantic + \${connected.length} connected = \${all.length} total\`
    }
  `

  try {
    const result = await executeRetrievalCode(code, TEST_CONTEXT)
    console.log('Result:', JSON.stringify(result, null, 2))
    console.log('✓ Chained retrieval works')
  } catch (error) {
    console.error('✗ Failed:', error)
  }
}

async function testTimeout() {
  console.log('\n=== Test 5: Timeout handling ===')

  const code = `
    // This should timeout
    await new Promise(resolve => setTimeout(resolve, 35000));
    return { findings: [], confidence: 0 }
  `

  try {
    const result = await executeRetrievalCode(code, TEST_CONTEXT)
    console.error('✗ Should have timed out but got:', result)
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      console.log('✓ Timeout works correctly')
    } else {
      console.error('✗ Unexpected error:', error)
    }
  }
}

async function testInvalidCode() {
  console.log('\n=== Test 6: Invalid code handling ===')

  const code = `
    this is not valid javascript {{{{
  `

  try {
    const result = await executeRetrievalCode(code, TEST_CONTEXT)
    console.error('✗ Should have failed but got:', result)
  } catch (error) {
    console.log('✓ Invalid code rejected correctly')
  }
}

async function main() {
  console.log('Testing Background Agent Executor')
  console.log('=================================')
  console.log('Context:', TEST_CONTEXT)

  await testBasicExecution()
  await testSemanticSearch()
  await testKeywordGrep()
  await testChainedRetrieval()
  // await testTimeout() // Uncomment to test (takes 30s)
  await testInvalidCode()

  console.log('\n=================================')
  console.log('Tests complete!')
}

main().catch(console.error)
