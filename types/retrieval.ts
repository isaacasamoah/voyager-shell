// Retrieval and prompt composition types for Slice 2

export interface RetrievalConfig {
  maxMemories: number;
  maxTokens: number;
  minRelevance: number;
}

export interface PromptLayer {
  name: string;
  content: string;
  tokens: number;
}

export interface ComposedPrompt {
  layers: PromptLayer[];
  totalTokens: number;
  systemPrompt: string;
}

export type QueryComplexity = 'simple' | 'contextual' | 'complex';

export type CommunicationTone = 'concise' | 'detailed' | 'casual';
export type CommunicationDensity = 'minimal' | 'balanced' | 'comprehensive';

export interface PersonalizationSettings {
  tone?: CommunicationTone;
  density?: CommunicationDensity;
}
