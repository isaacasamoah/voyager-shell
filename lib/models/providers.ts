// Model providers and configurations
// Defines available models, their capabilities, and costs

export interface ModelConfig {
  id: string
  provider: 'anthropic' | 'google' | 'openai'
  modelId: string
  capabilities: {
    chat: boolean
    toolUse: boolean
    vision: boolean
    streaming: boolean
  }
  costPerMillion: { input: number; output: number }
  typicalLatencyMs: number
  contextWindow: number
}

export interface ModelProvider {
  id: string
  name: string
  models: ModelConfig[]
}

export const DEFAULT_PROVIDERS: ModelProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      {
        id: 'claude-sonnet',
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        capabilities: { chat: true, toolUse: true, vision: true, streaming: true },
        costPerMillion: { input: 3, output: 15 },
        typicalLatencyMs: 800,
        contextWindow: 200000,
      },
      {
        id: 'claude-haiku',
        provider: 'anthropic',
        modelId: 'claude-3-5-haiku-latest',
        capabilities: { chat: true, toolUse: true, vision: false, streaming: true },
        costPerMillion: { input: 0.25, output: 1.25 },
        typicalLatencyMs: 400,
        contextWindow: 200000,
      },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    models: [
      {
        id: 'gemini-flash',
        provider: 'google',
        modelId: 'gemini-2.0-flash-exp',
        capabilities: { chat: true, toolUse: true, vision: true, streaming: true },
        costPerMillion: { input: 0.075, output: 0.30 },
        typicalLatencyMs: 300,
        contextWindow: 1000000,
      },
    ],
  },
]
