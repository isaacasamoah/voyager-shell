// Tools formatter
// Pure function: ToolDefinition[] → prompt section string
// DSPy-ready: could become an optimizable module

import type { ToolDefinition } from '../types';

/**
 * Formats tool definitions into a prompt section.
 *
 * Design principles:
 * - Capability-focused: What it does, not how
 * - Usage-guided: When to use, when NOT to use
 * - Side-effect-aware: Clear about state changes
 */
export const formatTools = (tools: ToolDefinition[]): string => {
  if (tools.length === 0) {
    return '';
  }

  const sections: string[] = ['# Available Tools'];

  tools.forEach((tool) => {
    sections.push(formatTool(tool));
  });

  return sections.join('\n');
};

const formatTool = (tool: ToolDefinition): string => {
  const lines: string[] = [];

  // Tool header
  lines.push(`\n## ${tool.name}`);
  lines.push(tool.description);

  // Usage guidance
  lines.push(`\n**When to use:** ${tool.usage.when}`);
  if (tool.usage.notWhen) {
    lines.push(`**Do not use when:** ${tool.usage.notWhen}`);
  }

  // Parameters (if any)
  if (tool.parameters.length > 0) {
    lines.push('\n**Parameters:**');
    tool.parameters.forEach((param) => {
      const required = param.required ? '(required)' : '(optional)';
      lines.push(`- \`${param.name}\` ${required}: ${param.description}`);
      if (param.example) {
        lines.push(`  Example: \`${param.example}\``);
      }
    });
  }

  // Side effects warning
  if (tool.sideEffects !== 'none') {
    const sideEffectDescriptions: Record<string, string> = {
      read: 'This tool reads data but does not modify anything.',
      write: 'This tool modifies data.',
      destructive: 'This tool can permanently delete or modify data.',
    };
    lines.push(`\n**Note:** ${sideEffectDescriptions[tool.sideEffects]}`);
  }

  // Approval requirement
  if (tool.requiresApproval) {
    lines.push('**Requires explicit user approval before execution.**');
  }

  // Example usage
  if (tool.usage.example) {
    lines.push(`\n**Example:** ${tool.usage.example}`);
  }

  return lines.join('\n');
};

/**
 * Formats a minimal tool summary for token-constrained contexts.
 */
export const formatToolsSummary = (tools: ToolDefinition[]): string => {
  if (tools.length === 0) {
    return '';
  }

  const lines: string[] = ['# Available Tools'];

  tools.forEach((tool) => {
    const approval = tool.requiresApproval ? ' [requires approval]' : '';
    lines.push(`- **${tool.name}**: ${tool.description}${approval}`);
  });

  return lines.join('\n');
};

/**
 * Estimates token count for the formatted tools.
 */
export const estimateToolsTokens = (tools: ToolDefinition[]): number => {
  const formatted = formatTools(tools);
  const words = formatted.split(/\s+/).length;
  return Math.ceil(words * 0.75);
};

// ============================================================================
// COMMON TOOL DEFINITIONS
// ============================================================================

export const COMMON_TOOLS: Record<string, ToolDefinition> = {
  search_knowledge: {
    name: 'search_knowledge',
    description: 'Search personal and community knowledge bases for relevant information.',
    usage: {
      when: 'The user asks about something that might be in memory or community knowledge.',
      notWhen: 'The user is asking a general knowledge question not specific to them or their community.',
      example: 'User asks "What did we decide about the API design?"',
    },
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'The semantic search query',
        required: true,
        example: 'API design decisions',
      },
      {
        name: 'scope',
        type: 'string',
        description: 'Where to search: "personal", "voyage", or "all"',
        required: false,
        example: 'personal',
      },
    ],
    sideEffects: 'read',
  },

  pin_knowledge: {
    name: 'pin_knowledge',
    description: 'Pin important information so it always surfaces in relevant contexts.',
    usage: {
      when: 'The user explicitly states a preference or important fact they want remembered.',
      notWhen: 'The information is transient or context-specific.',
      example: 'User says "Always remind me to run tests before pushing."',
    },
    parameters: [
      {
        name: 'content',
        type: 'string',
        description: 'The knowledge to pin',
        required: true,
      },
    ],
    sideEffects: 'write',
  },

  draft_response: {
    name: 'draft_response',
    description: 'Draft a message for user review before sending.',
    usage: {
      when: 'The user asks you to draft a message, email, or response.',
      notWhen: 'The user is just asking for information or having a conversation.',
      example: 'User says "Draft a response to Sarah\'s proposal."',
    },
    parameters: [
      {
        name: 'content',
        type: 'string',
        description: 'The drafted message content',
        required: true,
      },
      {
        name: 'recipient',
        type: 'string',
        description: 'Who the draft is for',
        required: false,
      },
    ],
    sideEffects: 'none',
    requiresApproval: true,
  },
};
