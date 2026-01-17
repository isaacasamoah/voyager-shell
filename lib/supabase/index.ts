// Re-export for clean imports
export { createClient as createBrowserClient } from './client'
export { createClient as createServerClient } from './server'
export { updateSession } from './middleware'
export { getAdminClient } from './admin'
export {
  createAuthenticatedClient,
  getClientForContext,
  requireAuthenticatedClient,
  type AuthenticatedClient,
  type ServiceContext,
} from './authenticated'
export * from './types'
