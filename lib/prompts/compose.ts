// Prompt composer
// Brings all layers together into a composed system prompt
// Handles token budgets and layer ordering

import type {
  VoyageConfig,
  UserProfile,
  ToolDefinition,
  RetrievedContext,
  KnowledgeItem,
  ComposedPrompt,
  PromptLayer,
  ComposerOptions,
} from './types';

import { CORE_PROMPT, CORE_PROMPT_TOKENS } from './core';
import { DEFAULT_COMPOSER_OPTIONS } from './defaults';
import { formatVoyage, estimateVoyageTokens } from './format/voyage';
import { formatUser, estimateUserTokens } from './format/user';
import { formatContext, estimateContextTokens } from './format/context';
import { formatTools, formatToolsSummary, estimateToolsTokens } from './format/tools';

// ============================================================================
// MAIN COMPOSER
// ============================================================================

export interface ComposeInput {
  userId: string;
  voyageName?: string;
  voyageConfig?: VoyageConfig;
  userProfile?: UserProfile;
  pinnedKnowledge?: KnowledgeItem[];
  retrievedContext?: RetrievedContext;
  tools?: ToolDefinition[];
  options?: ComposerOptions;
}

/**
 * Composes a complete system prompt from all layers.
 *
 * Layer order (top to bottom):
 * 1. Core (invariant identity, capabilities, principles)
 * 2. Voyage (community character, norms, knowledge framing)
 * 3. User (personal preferences, pinned knowledge)
 * 4. Tools (available tool descriptions)
 * 5. Context (retrieved knowledge for this turn)
 *
 * Each layer adds to the prompt. Later layers can refine but not contradict
 * earlier layers. Token budget is respected, truncating context if needed.
 */
export const composePrompt = (input: ComposeInput): ComposedPrompt => {
  const options = { ...DEFAULT_COMPOSER_OPTIONS, ...input.options };
  const layers: PromptLayer[] = [];
  let runningTokens = 0;

  // Layer 1: Core (always included)
  layers.push({
    name: 'core',
    content: CORE_PROMPT,
    tokenEstimate: CORE_PROMPT_TOKENS,
  });
  runningTokens += CORE_PROMPT_TOKENS;

  // Layer 2: Voyage (if provided)
  if (input.voyageConfig && input.voyageName) {
    const voyageContent = formatVoyage(input.voyageConfig, input.voyageName);
    const voyageTokens = estimateVoyageTokens(input.voyageConfig, input.voyageName);
    layers.push({
      name: 'voyage',
      content: voyageContent,
      tokenEstimate: voyageTokens,
    });
    runningTokens += voyageTokens;
  }

  // Layer 3: User (if provided)
  if (input.userProfile) {
    const userContent = formatUser(input.userProfile, input.pinnedKnowledge);
    const userTokens = estimateUserTokens(input.userProfile, input.pinnedKnowledge);
    layers.push({
      name: 'user',
      content: userContent,
      tokenEstimate: userTokens,
    });
    runningTokens += userTokens;
  }

  // Layer 4: Tools (if provided and enabled)
  if (options.includeTools && input.tools?.length) {
    const toolsTokens = estimateToolsTokens(input.tools);

    // Use summary format if tools would exceed budget
    const remainingBudget = options.maxTotalTokens - runningTokens - options.maxContextTokens;
    const toolsContent = toolsTokens > remainingBudget
      ? formatToolsSummary(input.tools)
      : formatTools(input.tools);

    const actualTokens = toolsTokens > remainingBudget
      ? Math.ceil(formatToolsSummary(input.tools).split(/\s+/).length * 0.75)
      : toolsTokens;

    layers.push({
      name: 'tools',
      content: toolsContent,
      tokenEstimate: actualTokens,
    });
    runningTokens += actualTokens;
  }

  // Layer 5: Context (if provided, respects max context tokens)
  if (input.retrievedContext?.items.length) {
    const availableContextTokens = Math.min(
      options.maxContextTokens,
      options.maxTotalTokens - runningTokens
    );

    const contextContent = formatContext(input.retrievedContext, availableContextTokens);
    const contextTokens = Math.min(
      estimateContextTokens(input.retrievedContext),
      availableContextTokens
    );

    layers.push({
      name: 'context',
      content: contextContent,
      tokenEstimate: contextTokens,
    });
    runningTokens += contextTokens;
  }

  // Compose final prompt
  const systemPrompt = layers.map((l) => l.content).join('\n\n---\n\n');

  return {
    layers,
    systemPrompt,
    totalTokens: runningTokens,
    metadata: {
      voyageSlug: input.voyageName,
      userId: input.userId,
      timestamp: new Date().toISOString(),
    },
  };
};

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Composes a minimal prompt with just core + context.
 * Useful for quick interactions or fallback scenarios.
 */
export const composeMinimalPrompt = (
  userId: string,
  context?: RetrievedContext
): ComposedPrompt => {
  return composePrompt({
    userId,
    retrievedContext: context,
    options: { includeTools: false },
  });
};

/**
 * Composes a prompt from database-stored configurations.
 * This is the primary entry point for the chat route.
 */
export interface ComposeFromDbInput {
  userId: string;
  voyageSlug?: string;
  voyageSettings?: Record<string, unknown>; // Raw JSON from voyages.settings
  userSettings?: Record<string, unknown>; // Raw JSON from profiles.settings
  pinnedKnowledge?: KnowledgeItem[];
  retrievedContext?: RetrievedContext;
  tools?: ToolDefinition[];
  options?: ComposerOptions;
}

export const composeFromDb = (input: ComposeFromDbInput): ComposedPrompt => {
  // Parse voyage config from raw settings
  const voyageConfig = input.voyageSettings
    ? parseVoyageConfig(input.voyageSettings)
    : undefined;

  // Parse user profile from raw settings
  const userProfile = input.userSettings
    ? parseUserProfile(input.userId, input.userSettings)
    : undefined;

  return composePrompt({
    userId: input.userId,
    voyageName: input.voyageSlug,
    voyageConfig,
    userProfile,
    pinnedKnowledge: input.pinnedKnowledge,
    retrievedContext: input.retrievedContext,
    tools: input.tools,
    options: input.options,
  });
};

// ============================================================================
// CONFIG PARSERS (from raw DB JSON)
// ============================================================================

import { mergeVoyageConfig, mergeUserProfile } from './defaults';

const parseVoyageConfig = (settings: Record<string, unknown>): VoyageConfig => {
  // Merge with defaults to ensure all fields are present
  return mergeVoyageConfig(settings as Partial<VoyageConfig>);
};

const parseUserProfile = (
  userId: string,
  settings: Record<string, unknown>
): UserProfile => {
  const displayName = typeof settings.displayName === 'string'
    ? settings.displayName
    : undefined;

  return mergeUserProfile(userId, {
    displayName,
    ...(settings as Partial<Omit<UserProfile, 'id'>>),
  });
};

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Returns a debug view of the composed prompt with token breakdowns.
 */
export const debugPrompt = (composed: ComposedPrompt): string => {
  const lines: string[] = [
    '=== PROMPT DEBUG ===',
    `Total tokens: ${composed.totalTokens}`,
    `Timestamp: ${composed.metadata.timestamp}`,
    '',
    '=== LAYER BREAKDOWN ===',
  ];

  composed.layers.forEach((layer) => {
    lines.push(`${layer.name}: ${layer.tokenEstimate} tokens`);
  });

  lines.push('', '=== FULL PROMPT ===', composed.systemPrompt);

  return lines.join('\n');
};
