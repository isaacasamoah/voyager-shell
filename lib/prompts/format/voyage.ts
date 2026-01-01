// Voyage config formatter
// Pure function: VoyageConfig + name → prompt section string
// DSPy-ready: could become an optimizable module

import type { VoyageConfig } from '../types';

/**
 * Formats voyage configuration into a prompt section.
 *
 * Design principles:
 * - Declarative: Describe what IS, not what to do
 * - Scannable: Headers, bullets, clear structure
 * - Functional: No fluff, every word earns its place
 */
export const formatVoyage = (
  config: VoyageConfig,
  voyageName: string
): string => {
  const sections: string[] = [];

  // Header
  sections.push(`# Community: ${voyageName}`);

  // Character as natural prose
  sections.push(formatCharacter(config.character));

  // Norms as structured list
  sections.push(formatNorms(config.norms));

  // Knowledge framing
  sections.push(formatKnowledge(config.knowledge));

  // Constraints if any
  if (config.constraints?.length) {
    sections.push(formatConstraints(config.constraints));
  }

  // Custom instructions (escape hatch)
  if (config.customInstructions) {
    sections.push(`\n## Additional Guidelines\n${config.customInstructions}`);
  }

  return sections.join('\n');
};

const formatCharacter = (character: VoyageConfig['character']): string => {
  const lines: string[] = [];

  // Build natural prose description
  const toneDescriptions: Record<string, string> = {
    technical: 'technical and precise',
    conversational: 'conversational and approachable',
    formal: 'formal and professional',
    playful: 'playful and creative',
  };

  const formalityDescriptions: Record<string, string> = {
    casual: 'casual',
    balanced: 'balanced',
    formal: 'formal',
  };

  const verbosityDescriptions: Record<string, string> = {
    terse: 'Keep responses brief.',
    balanced: '',
    detailed: 'Provide thorough explanations.',
  };

  lines.push(`\nIn this community, be ${toneDescriptions[character.tone]} with a ${formalityDescriptions[character.formality]} style.`);

  const verbosity = verbosityDescriptions[character.verbosity];
  if (verbosity) {
    lines.push(verbosity);
  }

  if (character.traits?.length) {
    lines.push(`Key traits: ${character.traits.join(', ')}.`);
  }

  return lines.join(' ');
};

const formatNorms = (norms: VoyageConfig['norms']): string => {
  const lines: string[] = ['\n## Norms'];

  if (norms.approvalRequired) {
    lines.push('- Actions require explicit approval before execution');
  }

  const proactivityDescriptions: Record<string, string> = {
    reactive: 'Only respond to explicit requests',
    balanced: 'Offer suggestions when clearly helpful',
    proactive: 'Proactively surface relevant information and suggestions',
  };
  lines.push(`- ${proactivityDescriptions[norms.proactivity]}`);

  const clarificationDescriptions: Record<string, string> = {
    low: 'Infer intent when reasonable, minimize clarifying questions',
    medium: 'Ask for clarification on ambiguous requests',
    high: 'Confirm understanding before taking action',
  };
  lines.push(`- ${clarificationDescriptions[norms.clarificationThreshold]}`);

  return lines.join('\n');
};

const formatKnowledge = (knowledge: VoyageConfig['knowledge']): string => {
  const lines: string[] = ['\n## Knowledge Usage'];

  const priorityDescriptions: Record<string, string> = {
    accuracy: 'Prioritize accuracy over speed',
    actionability: 'Prioritize actionable responses',
    speed: 'Prioritize quick, direct answers',
  };
  lines.push(`- ${priorityDescriptions[knowledge.priority]}`);

  if (knowledge.citeSources) {
    lines.push('- Cite sources when drawing from memory');
  }

  if (knowledge.showReasoning) {
    lines.push('- Show reasoning when making decisions');
  }

  return lines.join('\n');
};

const formatConstraints = (constraints: string[]): string => {
  const lines: string[] = ['\n## Constraints'];
  constraints.forEach((c) => lines.push(`- ${c}`));
  return lines.join('\n');
};

/**
 * Estimates token count for the formatted voyage config.
 * Rough heuristic: ~0.75 tokens per word
 */
export const estimateVoyageTokens = (
  config: VoyageConfig,
  voyageName: string
): number => {
  const formatted = formatVoyage(config, voyageName);
  const words = formatted.split(/\s+/).length;
  return Math.ceil(words * 0.75);
};
