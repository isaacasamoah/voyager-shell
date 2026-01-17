// Plugin Interface Types
// Foundation for Voyager plugin system (works in both text and voice modes)

import type { ToolDefinition } from '../tools/types'

// =============================================================================
// Plugin Definition
// =============================================================================

export interface PluginDefinition {
  /** Unique identifier (e.g., 'slack', 'github', 'linear') */
  id: string
  /** Human-readable name */
  name: string
  /** What this plugin does */
  description: string
  /** Semantic version */
  version: string

  /** Tools this plugin provides */
  tools: ToolDefinition[]

  /** OAuth configuration (optional - for third-party integrations) */
  oauth?: PluginOAuthConfig

  /** Webhook configuration (optional - for real-time events) */
  webhooks?: PluginWebhookConfig

  /** Called when user connects this plugin */
  onConnect?: (ctx: PluginContext) => Promise<void>
  /** Called when user disconnects this plugin */
  onDisconnect?: (ctx: PluginContext) => Promise<void>
}

// =============================================================================
// OAuth Configuration
// =============================================================================

export interface PluginOAuthConfig {
  /** OAuth provider identifier */
  provider: string
  /** Required OAuth scopes */
  scopes: string[]
  /** Authorization URL */
  authUrl: string
  /** Token exchange URL */
  tokenUrl: string
  /** Optional: Client ID (can be set via env) */
  clientId?: string
  /** Optional: Refresh token endpoint (defaults to tokenUrl) */
  refreshUrl?: string
}

// =============================================================================
// Webhook Configuration
// =============================================================================

export interface PluginWebhookConfig {
  /** Events this plugin can receive */
  events: string[]
  /** Webhook handler endpoint path */
  endpoint: string
  /** Optional: Secret for webhook signature verification */
  secret?: string
}

// =============================================================================
// Plugin Context (runtime context for lifecycle hooks)
// =============================================================================

export interface PluginContext {
  /** User ID who connected the plugin */
  userId: string
  /** Voyage (team) this plugin is connected to */
  voyageSlug?: string
  /** OAuth credentials (access_token, refresh_token, etc.) */
  credentials?: Record<string, string>
  /** Additional metadata from the connection flow */
  metadata?: Record<string, unknown>
}

// =============================================================================
// Plugin Instance (runtime state of a connected plugin)
// =============================================================================

export interface PluginInstance {
  /** The plugin definition */
  definition: PluginDefinition
  /** Current connection status */
  status: PluginStatus
  /** Stored credentials (encrypted at rest) */
  credentials?: Record<string, string>
  /** When the plugin was connected */
  connectedAt?: Date
  /** Last successful operation */
  lastUsedAt?: Date
  /** Error message if status is 'error' */
  error?: string
}

export type PluginStatus = 'connected' | 'disconnected' | 'error' | 'pending'

// =============================================================================
// Plugin Manifest (for discovery/marketplace)
// =============================================================================

export interface PluginManifest {
  id: string
  name: string
  description: string
  version: string
  author?: string
  icon?: string
  category?: PluginCategory
  tags?: string[]
  /** Whether this plugin requires OAuth */
  requiresAuth: boolean
  /** Scopes/permissions this plugin needs */
  permissions: string[]
}

export type PluginCategory =
  | 'communication'
  | 'development'
  | 'productivity'
  | 'analytics'
  | 'automation'
  | 'custom'
