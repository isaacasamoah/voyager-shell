// Upload Plugin
// Drag-drop files to knowledge via plugin interface
//
// This is the first plugin - proves the pattern works.
// No OAuth, no webhooks - just tools.

import { z } from 'zod'
import { definePlugin, pluginRegistry } from '../registry'
import { createExplicitEvent } from '@/lib/knowledge/events'
import type { ToolDefinition, ToolContext } from '@/lib/tools/types'

// =============================================================================
// File Upload Tool
// =============================================================================

const uploadFileSchema = z.object({
  filename: z.string().describe('Name of the uploaded file'),
  content: z.string().describe('Extracted text content from the file'),
  mimeType: z.string().describe('MIME type of the file'),
  size: z.number().describe('File size in bytes'),
})

export const uploadFileTool: ToolDefinition = {
  id: 'upload_file',
  name: 'Upload File',
  description: `Ingest uploaded file into knowledge. Use when: user drags a file, uploads a document, shares a PDF/text/markdown file.
Creates a knowledge event from the file content.`,
  inputSchema: uploadFileSchema,
  meta: {
    category: 'action',
    costTier: 'cheap',
    provider: 'upload',
  },
  execute: async (input: unknown, ctx: ToolContext) => {
    const { filename, content, mimeType, size } = input as z.infer<typeof uploadFileSchema>

    // Format content with metadata prefix
    const enrichedContent = `[Document: ${filename}]\n\n${content}`

    // Create knowledge event from the uploaded file
    const eventId = await createExplicitEvent(enrichedContent, {
      userId: ctx.userId,
      voyageSlug: ctx.voyageSlug,
      classifications: ['fact'], // Documents are typically facts
    })

    if (!eventId) {
      throw new Error('Failed to create knowledge event')
    }

    console.log(`[UploadPlugin] File ingested: ${filename} (${size} bytes) -> ${eventId.slice(0, 8)}`)

    return { eventId }
  },
}

// =============================================================================
// Plugin Definition
// =============================================================================

export const uploadPlugin = definePlugin({
  id: 'upload',
  name: 'File Upload',
  description: 'Drag-drop files to knowledge',
  version: '1.0.0',

  tools: [uploadFileTool],

  // No OAuth needed for upload
  oauth: undefined,

  // No webhooks needed for upload
  webhooks: undefined,

  // Called when user connects (noop for upload - always available)
  async onConnect(ctx) {
    console.log(`[UploadPlugin] Connected for user: ${ctx.userId}`)
  },

  // Called when user disconnects (noop for upload)
  async onDisconnect(ctx) {
    console.log(`[UploadPlugin] Disconnected for user: ${ctx.userId}`)
  },
})

// =============================================================================
// Register Plugin
// =============================================================================

pluginRegistry.register(uploadPlugin)

export default uploadPlugin
