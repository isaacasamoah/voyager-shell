// Memory service for Slice 2
// Semantic memory layer with OpenAI embeddings and Supabase pgvector

import OpenAI from 'openai'
import { getAdminClient } from '@/lib/supabase/admin'
import type { MemoryType } from '@/lib/supabase/types'

// Use admin client for memory operations (bypasses RLS)
// TODO: Switch to user-scoped client once auth is wired up
const getClient = () => getAdminClient()

// Lazy-initialize OpenAI client to avoid build-time errors
let _openai: OpenAI | null = null
const getOpenAI = (): OpenAI => {
  if (!_openai) {
    _openai = new OpenAI()
  }
  return _openai
}

// Re-export MemoryType for convenience
export type { MemoryType }

export interface Memory {
  id: string
  userId: string
  type: MemoryType
  content: string
  confidence: number
  importance: number
  createdAt: Date
  updatedAt: Date
}

export interface SearchOptions {
  threshold?: number
  limit?: number
  types?: MemoryType[]
}

export interface CreateMemoryInput {
  userId: string
  type: MemoryType
  content: string
  sourceSessionId?: string
  importance?: number
  confidence?: number
}

// RPC result types (matching database functions)
interface SearchMemoriesResult {
  id: string
  type: MemoryType
  content: string
  confidence: number
  importance: number
  similarity: number
}

// Generate embedding for text using OpenAI
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

// Convert embedding array to pgvector string format
const toVectorString = (embedding: number[]): string => {
  return `[${embedding.join(',')}]`
}

// Transform database row to Memory interface
const transformMemory = (row: {
  id: string
  user_id: string
  type: MemoryType
  content: string
  confidence: number
  importance: number
  created_at: string
  last_accessed: string
}): Memory => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  content: row.content,
  confidence: row.confidence,
  importance: row.importance,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.last_accessed),
})

// Search memories by semantic similarity
export const searchMemories = async (
  userId: string,
  query: string,
  options: SearchOptions = {}
): Promise<(Memory & { similarity: number })[]> => {
  const { threshold = 0.7, limit = 10 } = options

  try {
    const supabase = getClient()
    console.log('[Memory] Client created, type:', typeof supabase, 'rpc:', typeof supabase?.rpc)

    const embedding = await generateEmbedding(query)
    console.log('[Memory] Embedding generated, length:', embedding.length)

    // Call RPC with pgvector string format
    // Must call .rpc() directly on client to preserve `this` binding
    const { data, error } = await supabase.rpc('search_memories', {
      query_embedding: toVectorString(embedding),
      match_user_id: userId,
      match_threshold: threshold,
      match_count: limit,
    })

    if (error) {
      console.error('[Memory] Search error:', error)
      return []
    }

    const results = data as SearchMemoriesResult[] | null
    if (!results || results.length === 0) {
      return []
    }

    // Touch accessed memories (fire and forget for performance)
    // Don't await - just update access tracking in background
    results.forEach((m) => {
      supabase.rpc('touch_memory', { memory_id: m.id })
        .then(() => {})
        .catch(() => {
          // Ignore touch errors - not critical
        })
    })

    // Filter by types if specified
    let filteredResults = results
    if (options.types && options.types.length > 0) {
      filteredResults = results.filter((m) => options.types!.includes(m.type))
    }

    return filteredResults.map((m) => ({
      id: m.id,
      userId,
      type: m.type,
      content: m.content,
      confidence: m.confidence,
      importance: m.importance,
      similarity: m.similarity,
      createdAt: new Date(), // Not returned by search_memories RPC
      updatedAt: new Date(),
    }))
  } catch (error) {
    console.error('[Memory] searchMemories error:', error)
    return []
  }
}

// Create a new memory with embedding
export const createMemory = async (
  input: CreateMemoryInput
): Promise<Memory> => {
  const supabase = getClient()
  const embedding = await generateEmbedding(input.content)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_memory')
    .insert({
      user_id: input.userId,
      type: input.type,
      content: input.content,
      embedding: toVectorString(embedding),
      source_session_id: input.sourceSessionId,
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? 1.0,
    })
    .select()
    .single()

  if (error) {
    console.error('[Memory] Create error:', error)
    throw error
  }

  return transformMemory(data)
}

// Get memories by type
export const getMemoriesByType = async (
  userId: string,
  type: MemoryType,
  limit = 10
): Promise<Memory[]> => {
  const supabase = getClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('is_active', true)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Memory] getMemoriesByType error:', error)
    return []
  }

  return data.map(transformMemory)
}

// Get recent memories for a user
export const getRecentMemories = async (
  userId: string,
  limit = 20
): Promise<Memory[]> => {
  const supabase = getClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Memory] getRecentMemories error:', error)
    return []
  }

  return data.map(transformMemory)
}

// Get most important memories (by importance score)
export const getImportantMemories = async (
  userId: string,
  limit = 10
): Promise<Memory[]> => {
  const supabase = getClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('importance', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Memory] getImportantMemories error:', error)
    return []
  }

  return data.map(transformMemory)
}

// Update a memory (supersedes old, creates new)
export const updateMemory = async (
  userId: string,
  memoryId: string,
  newContent: string,
  newImportance?: number
): Promise<Memory> => {
  const supabase = getClient()
  const embedding = await generateEmbedding(newContent)

  const { data, error } = await supabase.rpc('supersede_memory', {
    old_memory_id: memoryId,
    new_content: newContent,
    new_embedding: toVectorString(embedding),
    new_importance: newImportance,
  })

  if (error) {
    console.error('[Memory] updateMemory error:', error)
    throw error
  }

  // Fetch the new memory
  const newMemoryId = data as string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newMemory, error: fetchError } = await (supabase as any)
    .from('user_memory')
    .select('*')
    .eq('id', newMemoryId)
    .single()

  if (fetchError) {
    throw fetchError
  }

  return transformMemory(newMemory)
}

// Soft delete a memory (mark as inactive)
export const deleteMemory = async (
  userId: string,
  memoryId: string
): Promise<boolean> => {
  const supabase = getClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('user_memory')
    .update({ is_active: false })
    .eq('id', memoryId)
    .eq('user_id', userId)

  if (error) {
    console.error('[Memory] deleteMemory error:', error)
    return false
  }

  return true
}

// Batch create memories (for extraction pipelines)
export const createMemories = async (
  inputs: CreateMemoryInput[]
): Promise<Memory[]> => {
  const results: Memory[] = []

  // Process sequentially to avoid rate limits on embedding API
  for (const input of inputs) {
    try {
      const memory = await createMemory(input)
      results.push(memory)
    } catch (error) {
      console.error('[Memory] Batch create error for:', input.content, error)
      // Continue with other memories
    }
  }

  return results
}

// Get memory statistics for a user
export const getMemoryStats = async (
  userId: string
): Promise<{
  total: number
  byType: Record<MemoryType, number>
  avgImportance: number
}> => {
  const supabase = getClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_memory')
    .select('type, importance')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error || !data) {
    return {
      total: 0,
      byType: { fact: 0, preference: 0, entity: 0, decision: 0, event: 0 },
      avgImportance: 0,
    }
  }

  interface MemoryRow {
    type: MemoryType
    importance: number
  }

  const typedData = data as MemoryRow[]
  const byType = typedData.reduce(
    (acc, m) => {
      acc[m.type] = (acc[m.type] || 0) + 1
      return acc
    },
    { fact: 0, preference: 0, entity: 0, decision: 0, event: 0 } as Record<
      MemoryType,
      number
    >
  )

  const avgImportance =
    typedData.length > 0
      ? typedData.reduce((sum, m) => sum + m.importance, 0) / typedData.length
      : 0

  return {
    total: typedData.length,
    byType,
    avgImportance,
  }
}
