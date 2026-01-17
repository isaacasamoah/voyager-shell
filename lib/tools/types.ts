// Tool Registry Types
// Standardized definitions for all Voyager tools

import { z } from 'zod'

// =============================================================================
// Tool Definition
// =============================================================================

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string
  name: string
  description: string
  inputSchema: z.ZodSchema<TInput>
  outputSchema?: z.ZodSchema<TOutput>
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>
  meta: ToolMeta
}

// =============================================================================
// Tool Metadata
// =============================================================================

export interface ToolMeta {
  category: 'retrieval' | 'action' | 'plugin'
  costTier: 'free' | 'cheap' | 'moderate' | 'expensive'
  provider: string
  permissions?: string[]
  tags?: string[]
}

// =============================================================================
// Tool Context (runtime context for tool execution)
// =============================================================================

export interface ToolContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
  /** Vercel waitUntil for background execution without blocking response */
  waitUntil?: (promise: Promise<unknown>) => void
}

// =============================================================================
// Tool Result (standardized execution result)
// =============================================================================

export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    durationMs: number
    tokensUsed?: number
    cost?: number
  }
}
