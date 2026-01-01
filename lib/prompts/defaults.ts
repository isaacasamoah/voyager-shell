// Default configurations for voyage and user
// These work out of the box - config is for customization, not required

import type {
  VoyageConfig,
  UserProfile,
  ComposerOptions,
} from './types';

// ============================================================================
// DEFAULT VOYAGE CONFIG
// ============================================================================

export const DEFAULT_VOYAGE_CONFIG: VoyageConfig = {
  character: {
    tone: 'conversational',
    formality: 'casual',
    verbosity: 'balanced',
    traits: ['helpful', 'direct'],
  },
  norms: {
    approvalRequired: false,
    proactivity: 'balanced',
    clarificationThreshold: 'medium',
  },
  knowledge: {
    priority: 'actionability',
    citeSources: true,
    showReasoning: false,
  },
  tools: {
    enabled: [],
    requiresApproval: [],
  },
};

// ============================================================================
// DEFAULT USER PROFILE
// ============================================================================

export const DEFAULT_USER_PROFILE: Omit<UserProfile, 'id'> = {
  communication: {
    verbosity: 'balanced',
    directness: 'balanced',
    technicalLevel: 'intermediate',
  },
  interaction: {
    confirmActions: true,
    proactiveHelp: true,
    showReasoning: false,
  },
  context: {},
};

// ============================================================================
// DEFAULT COMPOSER OPTIONS
// ============================================================================

export const DEFAULT_COMPOSER_OPTIONS: Required<ComposerOptions> = {
  maxTotalTokens: 4000,
  maxContextTokens: 2500,
  includeTools: true,
  debug: false,
};

// ============================================================================
// PRESET VOYAGE CONFIGS
// ============================================================================

// For engineering/dev teams
export const VOYAGE_PRESET_ENGINEERING: VoyageConfig = {
  character: {
    tone: 'technical',
    formality: 'casual',
    verbosity: 'terse',
    traits: ['precise', 'direct', 'pragmatic'],
  },
  norms: {
    approvalRequired: false,
    proactivity: 'proactive',
    clarificationThreshold: 'low', // Infer more, ask less
  },
  knowledge: {
    priority: 'accuracy',
    citeSources: true,
    showReasoning: true,
  },
  tools: {
    enabled: [],
    requiresApproval: [],
  },
};

// For creative/design teams
export const VOYAGE_PRESET_CREATIVE: VoyageConfig = {
  character: {
    tone: 'playful',
    formality: 'casual',
    verbosity: 'balanced',
    traits: ['encouraging', 'exploratory', 'imaginative'],
  },
  norms: {
    approvalRequired: false,
    proactivity: 'proactive',
    clarificationThreshold: 'medium',
  },
  knowledge: {
    priority: 'actionability',
    citeSources: false,
    showReasoning: false,
  },
  tools: {
    enabled: [],
    requiresApproval: [],
  },
};

// For formal/enterprise contexts
export const VOYAGE_PRESET_ENTERPRISE: VoyageConfig = {
  character: {
    tone: 'formal',
    formality: 'formal',
    verbosity: 'detailed',
    traits: ['professional', 'thorough', 'measured'],
  },
  norms: {
    approvalRequired: true, // Everything needs approval
    proactivity: 'reactive', // Only respond to explicit requests
    clarificationThreshold: 'high', // Ask before assuming
  },
  knowledge: {
    priority: 'accuracy',
    citeSources: true,
    showReasoning: true,
  },
  tools: {
    enabled: [],
    requiresApproval: [],
  },
};

// ============================================================================
// HELPER: Merge with defaults
// ============================================================================

export const mergeVoyageConfig = (
  partial: Partial<VoyageConfig>
): VoyageConfig => ({
  ...DEFAULT_VOYAGE_CONFIG,
  ...partial,
  character: {
    ...DEFAULT_VOYAGE_CONFIG.character,
    ...partial.character,
  },
  norms: {
    ...DEFAULT_VOYAGE_CONFIG.norms,
    ...partial.norms,
  },
  knowledge: {
    ...DEFAULT_VOYAGE_CONFIG.knowledge,
    ...partial.knowledge,
  },
  tools: {
    ...DEFAULT_VOYAGE_CONFIG.tools,
    ...partial.tools,
  },
});

export const mergeUserProfile = (
  id: string,
  partial: Partial<Omit<UserProfile, 'id'>>
): UserProfile => ({
  id,
  ...DEFAULT_USER_PROFILE,
  ...partial,
  communication: {
    ...DEFAULT_USER_PROFILE.communication,
    ...partial.communication,
  },
  interaction: {
    ...DEFAULT_USER_PROFILE.interaction,
    ...partial.interaction,
  },
  context: {
    ...DEFAULT_USER_PROFILE.context,
    ...partial.context,
  },
});
