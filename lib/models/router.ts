// Model Router
// Abstracts model selection based on task requirements
//
// Note: Google models use custom client (lib/gemini/client.ts) not AI SDK.
// This router only returns AI SDK LanguageModel for Anthropic.
// For Google, use selectConfig() + callGemini() directly.

import { anthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import { DEFAULT_PROVIDERS, type ModelConfig, type ModelProvider } from './providers'

export interface ModelRequirements {
  task: 'chat' | 'decision' | 'code' | 'embedding' | 'synthesis' | 'classification'
  maxLatencyMs?: number
  quality?: 'fast' | 'balanced' | 'best'
  maxTokens?: number
  streaming?: boolean
  toolUse?: boolean
}

export interface ModelRouter {
  select(requirements: ModelRequirements): LanguageModel
  selectConfig(requirements: ModelRequirements): ModelConfig
  getConfig(modelId: string): ModelConfig | undefined
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number
}

const createLanguageModel = (config: ModelConfig): LanguageModel => {
  switch (config.provider) {
    case 'anthropic':
      return anthropic(config.modelId)
    case 'google':
      // Google uses custom client, not AI SDK
      // Callers should use selectConfig() + callGemini() for Google
      throw new Error('Google models use custom client. Use selectConfig() + callGemini() instead.')
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

// Providers that support AI SDK LanguageModel interface
const AI_SDK_PROVIDERS: Set<string> = new Set(['anthropic', 'openai'])

export const createModelRouter = (options?: {
  providers?: ModelProvider[]
}): ModelRouter => {
  const providers = options?.providers ?? DEFAULT_PROVIDERS
  const allModels = providers.flatMap(p => p.models)
  const aiSdkModels = allModels.filter(m => AI_SDK_PROVIDERS.has(m.provider))

  const selectModelConfig = (req: ModelRequirements, fromModels: ModelConfig[]): ModelConfig => {
    let candidates = fromModels.filter(m => {
      if (req.toolUse && !m.capabilities.toolUse) return false
      if (req.streaming && !m.capabilities.streaming) return false
      if (req.maxLatencyMs && m.typicalLatencyMs > req.maxLatencyMs) return false
      return true
    })

    if (candidates.length === 0) {
      candidates = fromModels // Fallback to all in scope
    }

    // Sort by quality preference
    if (req.quality === 'fast') {
      candidates.sort((a, b) => a.typicalLatencyMs - b.typicalLatencyMs)
    } else if (req.quality === 'best') {
      candidates.sort((a, b) => b.costPerMillion.output - a.costPerMillion.output)
    } else {
      // balanced - prefer Sonnet
      const sonnet = candidates.find(m => m.id === 'claude-sonnet')
      if (sonnet) return sonnet
    }

    return candidates[0]
  }

  return {
    // Returns AI SDK LanguageModel (Anthropic only currently)
    select(requirements: ModelRequirements): LanguageModel {
      const config = selectModelConfig(requirements, aiSdkModels)
      return createLanguageModel(config)
    },

    // Returns config for any provider (use with custom clients for Google)
    selectConfig(requirements: ModelRequirements): ModelConfig {
      return selectModelConfig(requirements, allModels)
    },

    getConfig(modelId: string): ModelConfig | undefined {
      return allModels.find(m => m.id === modelId || m.modelId === modelId)
    },

    estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
      const config = allModels.find(m => m.id === modelId || m.modelId === modelId)
      if (!config) return 0
      return (
        (inputTokens / 1_000_000) * config.costPerMillion.input +
        (outputTokens / 1_000_000) * config.costPerMillion.output
      )
    },
  }
}

export const modelRouter = createModelRouter()
