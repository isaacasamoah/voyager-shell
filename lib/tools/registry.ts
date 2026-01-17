// Tool Registry
// Central registry for all Voyager tools with Vercel AI SDK integration

import { tool } from 'ai'
import type { ToolDefinition, ToolMeta, ToolContext } from './types'

// =============================================================================
// Registry Class
// =============================================================================

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()

  /**
   * Register a tool definition.
   * Warns if overwriting an existing tool.
   */
  register<TInput, TOutput>(toolDef: ToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(toolDef.id)) {
      console.warn(`[ToolRegistry] Overwriting tool: ${toolDef.id}`)
    }
    this.tools.set(toolDef.id, toolDef as ToolDefinition)
  }

  /**
   * Get a tool by its ID.
   */
  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id)
  }

  /**
   * Find tools matching a filter on metadata.
   */
  find(filter: Partial<ToolMeta>): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => {
      if (filter.category && t.meta.category !== filter.category) return false
      if (filter.provider && t.meta.provider !== filter.provider) return false
      if (filter.costTier && t.meta.costTier !== filter.costTier) return false
      return true
    })
  }

  /**
   * Get all tools in a category.
   */
  byCategory(category: ToolMeta['category']): ToolDefinition[] {
    return this.find({ category })
  }

  /**
   * Get all tools from a provider.
   */
  byProvider(provider: string): ToolDefinition[] {
    return this.find({ provider })
  }

  /**
   * Convert registered tools to Vercel AI SDK format.
   * Binds the provided context to each tool's execute function.
   *
   * Note: Uses type assertions because Vercel AI SDK's tool() has strict
   * generic inference that doesn't work well with dynamic tool registration.
   * The tool() helper is called with explicit type parameters to bypass inference.
   */
  toVercelTools(ctx: ToolContext): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const entries = Array.from(this.tools.entries())
    for (const [id, def] of entries) {
      // Build Vercel AI SDK tool - cast to bypass strict type inference
      result[id] = (tool as Function)({
        description: def.description,
        parameters: def.inputSchema,
        execute: async (input: unknown) => def.execute(input, ctx),
      })
    }
    return result
  }

  /**
   * Remove a tool from the registry.
   */
  unregister(id: string): boolean {
    return this.tools.delete(id)
  }

  /**
   * List all registered tools.
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /**
   * Get count of registered tools.
   */
  get size(): number {
    return this.tools.size
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const toolRegistry = new ToolRegistry()

// =============================================================================
// Helper: Define Tool with Type Inference
// =============================================================================

/**
 * Type-safe helper for defining tools.
 * Preserves TInput and TOutput types through inference.
 */
export const defineTool = <TInput, TOutput>(
  def: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> => def
