// User profile formatter
// Pure function: UserProfile + pinned knowledge → prompt section string
// DSPy-ready: could become an optimizable module

import type { UserProfile, KnowledgeItem } from '../types';

/**
 * Formats user profile into a prompt section.
 * Includes learned preferences and pinned knowledge.
 *
 * Design principles:
 * - Personal: Address the user by name when available
 * - Learned: Reflect preferences discovered over time
 * - Actionable: Guide behavior, not just describe
 */
export const formatUser = (
  profile: UserProfile,
  pinnedKnowledge: KnowledgeItem[] = []
): string => {
  const sections: string[] = [];

  // Header with name
  const name = profile.displayName || 'this user';
  sections.push(`# About ${name}`);

  // Communication preferences
  sections.push(formatCommunication(profile.communication));

  // Interaction preferences
  sections.push(formatInteraction(profile.interaction));

  // Context (role, domains)
  if (hasContext(profile.context)) {
    sections.push(formatContext(profile.context));
  }

  // Pinned knowledge (explicit preferences)
  if (pinnedKnowledge.length > 0) {
    sections.push(formatPinned(pinnedKnowledge));
  }

  return sections.join('\n');
};

const formatCommunication = (
  comm: UserProfile['communication']
): string => {
  const lines: string[] = ['\n## Communication'];

  const verbosityDescriptions: Record<string, string> = {
    terse: 'Prefers brief, to-the-point responses',
    balanced: 'Prefers balanced responses with appropriate detail',
    detailed: 'Appreciates thorough explanations',
  };
  lines.push(`- ${verbosityDescriptions[comm.verbosity]}`);

  const directnessDescriptions: Record<string, string> = {
    gentle: 'Prefers gentle, diplomatic feedback',
    balanced: 'Appreciates honest, balanced feedback',
    direct: 'Prefers direct, unvarnished feedback',
  };
  lines.push(`- ${directnessDescriptions[comm.directness]}`);

  const technicalDescriptions: Record<string, string> = {
    beginner: 'Explain technical concepts in simple terms',
    intermediate: 'Can handle moderate technical depth',
    expert: 'Comfortable with deep technical detail',
  };
  lines.push(`- ${technicalDescriptions[comm.technicalLevel]}`);

  return lines.join('\n');
};

const formatInteraction = (
  interaction: UserProfile['interaction']
): string => {
  const lines: string[] = ['\n## Interaction'];

  if (interaction.confirmActions) {
    lines.push('- Confirm before taking actions');
  } else {
    lines.push('- Can act without explicit confirmation when intent is clear');
  }

  if (interaction.proactiveHelp) {
    lines.push('- Offer proactive suggestions when helpful');
  } else {
    lines.push('- Wait for explicit requests before offering help');
  }

  if (interaction.showReasoning) {
    lines.push('- Show reasoning and thought process');
  }

  return lines.join('\n');
};

const hasContext = (context: UserProfile['context']): boolean => {
  return !!(context.role || context.domains?.length || context.timezone);
};

const formatContext = (context: UserProfile['context']): string => {
  const lines: string[] = ['\n## Context'];

  if (context.role) {
    lines.push(`- Role: ${context.role}`);
  }

  if (context.domains?.length) {
    lines.push(`- Domains: ${context.domains.join(', ')}`);
  }

  if (context.timezone) {
    lines.push(`- Timezone: ${context.timezone}`);
  }

  return lines.join('\n');
};

const formatPinned = (items: KnowledgeItem[]): string => {
  const lines: string[] = ['\n## Pinned Preferences'];

  items.forEach((item) => {
    // Clean up content - remove extra whitespace, ensure single line for bullets
    const content = item.content.trim().replace(/\n+/g, ' ');
    lines.push(`- ${content}`);
  });

  return lines.join('\n');
};

/**
 * Estimates token count for the formatted user profile.
 */
export const estimateUserTokens = (
  profile: UserProfile,
  pinnedKnowledge: KnowledgeItem[] = []
): number => {
  const formatted = formatUser(profile, pinnedKnowledge);
  const words = formatted.split(/\s+/).length;
  return Math.ceil(words * 0.75);
};
