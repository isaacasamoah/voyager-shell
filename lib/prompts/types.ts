// Modular prompt system types
// Designed for DSPy-compatibility: pure data in, string out

// ============================================================================
// VOYAGE CONFIG - Per-community settings
// ============================================================================

export type CharacterTone = 'technical' | 'conversational' | 'formal' | 'playful';
export type Formality = 'casual' | 'balanced' | 'formal';
export type Verbosity = 'terse' | 'balanced' | 'detailed';
export type Proactivity = 'reactive' | 'balanced' | 'proactive';
export type ClarificationThreshold = 'low' | 'medium' | 'high';
export type KnowledgePriority = 'accuracy' | 'actionability' | 'speed';

export interface VoyageCharacter {
  tone: CharacterTone;
  formality: Formality;
  verbosity: Verbosity;
  traits?: string[]; // e.g., ['direct', 'encouraging', 'precise']
}

export interface VoyageNorms {
  approvalRequired: boolean; // Green tick for actions
  proactivity: Proactivity;
  clarificationThreshold: ClarificationThreshold;
}

export interface VoyageKnowledge {
  priority: KnowledgePriority;
  citeSources: boolean;
  showReasoning: boolean;
}

export interface VoyageTools {
  enabled: string[]; // Tool identifiers
  requiresApproval: string[]; // Subset needing explicit approval
}

export interface VoyageConfig {
  character: VoyageCharacter;
  norms: VoyageNorms;
  knowledge: VoyageKnowledge;
  tools: VoyageTools;
  constraints?: string[]; // What's off-limits
  customInstructions?: string; // Escape hatch for freeform
}

// ============================================================================
// USER PROFILE - Per-person settings (learned over time)
// ============================================================================

export type Directness = 'gentle' | 'balanced' | 'direct';
export type TechnicalLevel = 'beginner' | 'intermediate' | 'expert';

export interface UserCommunication {
  verbosity: Verbosity;
  directness: Directness;
  technicalLevel: TechnicalLevel;
}

export interface UserInteraction {
  confirmActions: boolean; // Ask before doing?
  proactiveHelp: boolean; // Suggest things?
  showReasoning: boolean; // Explain thinking?
}

export interface UserContext {
  role?: string; // e.g., "backend engineer"
  domains?: string[]; // e.g., ["TypeScript", "React", "Supabase"]
  timezone?: string;
}

export interface UserProfile {
  id: string;
  displayName?: string;
  communication: UserCommunication;
  interaction: UserInteraction;
  context: UserContext;
}

// ============================================================================
// TOOL DEFINITIONS - For tool description formatting
// ============================================================================

export type SideEffect = 'none' | 'read' | 'write' | 'destructive';

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  example?: string;
}

export interface ToolUsage {
  when: string; // When to use this tool
  notWhen?: string; // Anti-patterns
  example?: string; // Concrete usage example
}

export interface ToolDefinition {
  name: string;
  description: string;
  usage: ToolUsage;
  parameters: ToolParameter[];
  sideEffects: SideEffect;
  requiresApproval?: boolean;
}

// ============================================================================
// KNOWLEDGE CONTEXT - Retrieved knowledge for this turn
// ============================================================================

export interface KnowledgeItem {
  id: string;
  content: string;
  source: 'personal' | 'voyage' | 'pinned';
  relevance: number;
  timestamp?: string;
}

export interface RetrievedContext {
  items: KnowledgeItem[];
  query: string;
  voyageSlug?: string;
}

// ============================================================================
// COMPOSED PROMPT - The final output
// ============================================================================

export interface PromptLayer {
  name: 'core' | 'voyage' | 'user' | 'tools' | 'context';
  content: string;
  tokenEstimate: number;
}

export interface ComposedPrompt {
  layers: PromptLayer[];
  systemPrompt: string;
  totalTokens: number;
  metadata: {
    voyageSlug?: string;
    userId: string;
    timestamp: string;
  };
}

// ============================================================================
// COMPOSER OPTIONS - Configuration for prompt composition
// ============================================================================

export interface ComposerOptions {
  maxTotalTokens?: number; // Default: 4000
  maxContextTokens?: number; // Default: 2500
  includeTools?: boolean; // Default: true
  debug?: boolean; // Include token counts in output
}
