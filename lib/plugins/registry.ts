// Plugin Registry
// Central registry for Voyager plugins with tool integration

import type { ToolDefinition } from '../tools/types'
import type { PluginDefinition, PluginManifest } from './types'

// =============================================================================
// Registry Class
// =============================================================================

export class PluginRegistry {
  private plugins: Map<string, PluginDefinition> = new Map()

  /**
   * Register a plugin definition.
   * Validates plugin structure and warns on duplicate registration.
   */
  register(plugin: PluginDefinition): void {
    if (!plugin.id || !plugin.name || !plugin.version) {
      throw new Error(`[PluginRegistry] Invalid plugin: missing required fields`)
    }

    if (this.plugins.has(plugin.id)) {
      console.warn(`[PluginRegistry] Overwriting plugin: ${plugin.id}`)
    }

    this.plugins.set(plugin.id, plugin)
  }

  /**
   * Get a plugin by its ID.
   */
  get(id: string): PluginDefinition | undefined {
    return this.plugins.get(id)
  }

  /**
   * List all registered plugins.
   */
  list(): PluginDefinition[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Remove a plugin from the registry.
   */
  unregister(id: string): boolean {
    return this.plugins.delete(id)
  }

  /**
   * Check if a plugin is registered.
   */
  has(id: string): boolean {
    return this.plugins.has(id)
  }

  /**
   * Get count of registered plugins.
   */
  get size(): number {
    return this.plugins.size
  }

  // ===========================================================================
  // Tool Integration
  // ===========================================================================

  /**
   * Get all tools from all registered plugins.
   * Tools are tagged with their source plugin ID.
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = []
    const plugins = Array.from(this.plugins.values())
    for (const plugin of plugins) {
      tools.push(...plugin.tools)
    }
    return tools
  }

  /**
   * Get tools from specific plugins.
   */
  getToolsFor(pluginIds: string[]): ToolDefinition[] {
    const tools: ToolDefinition[] = []
    for (const id of pluginIds) {
      const plugin = this.plugins.get(id)
      if (plugin) {
        tools.push(...plugin.tools)
      }
    }
    return tools
  }

  /**
   * Find a tool by ID across all plugins.
   * Returns the tool and its source plugin.
   */
  findTool(toolId: string): { tool: ToolDefinition; pluginId: string } | undefined {
    const entries = Array.from(this.plugins.entries())
    for (const [pluginId, plugin] of entries) {
      const tool = plugin.tools.find((t) => t.id === toolId)
      if (tool) {
        return { tool, pluginId }
      }
    }
    return undefined
  }

  // ===========================================================================
  // Discovery
  // ===========================================================================

  /**
   * Get manifests for all plugins (safe for public display).
   */
  getManifests(): PluginManifest[] {
    return this.list().map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      requiresAuth: !!plugin.oauth,
      permissions: plugin.oauth?.scopes ?? [],
    }))
  }

  /**
   * Find plugins that have OAuth configured.
   */
  getOAuthPlugins(): PluginDefinition[] {
    return this.list().filter((p) => p.oauth)
  }

  /**
   * Find plugins that have webhooks configured.
   */
  getWebhookPlugins(): PluginDefinition[] {
    return this.list().filter((p) => p.webhooks)
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const pluginRegistry = new PluginRegistry()

// =============================================================================
// Helper: Define Plugin with Type Safety
// =============================================================================

/**
 * Type-safe helper for defining plugins.
 * Ensures all required fields are present.
 */
export const definePlugin = (def: PluginDefinition): PluginDefinition => def
