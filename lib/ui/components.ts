// Inline component registry
// Components Voyager can render inline in conversation

// Component lifecycle state
export type ComponentState =
  | 'active'     // Interactive, waiting for user action
  | 'resolved'   // User made selection, show collapsed
  | 'dismissed'  // User closed without action

// Resolution data when component is resolved
export interface ComponentResolution {
  action: string        // What action was taken (e.g., 'selected', 'submitted')
  value?: unknown       // The selected/submitted value
  label?: string        // Human-readable label for display
}

export type ComponentType =
  | 'voyage_picker'       // List of voyages to select
  | 'conversation_picker' // List of conversations to resume
  | 'create_voyage_form'  // Inline form for new voyage
  | 'invite_card'         // Invite link + copy button
  | 'confirmation'        // Yes/No action confirmation
  | 'action_buttons'      // Contextual action buttons
  | 'progress'            // Loading/progress indicator
  | 'auth_prompt'         // Email input for auth

export interface InlineComponent {
  id: string
  type: ComponentType
  props: Record<string, unknown>
  ephemeral: boolean       // Don't persist to conversation history
  state: ComponentState    // Current lifecycle state
  resolution?: ComponentResolution  // Present when state is 'resolved'
}

// Component specifications
export const COMPONENT_SPECS: Record<
  ComponentType,
  {
    description: string
    requiredProps: string[]
    ephemeral: boolean
  }
> = {
  voyage_picker: {
    description: 'Show voyages user can switch to',
    requiredProps: ['voyages'],
    ephemeral: true,
  },
  conversation_picker: {
    description: 'Show recent conversations to resume',
    requiredProps: ['conversations'],
    ephemeral: true,
  },
  create_voyage_form: {
    description: 'Inline form to create new voyage',
    requiredProps: [],
    ephemeral: true,
  },
  invite_card: {
    description: 'Show invite link with copy button',
    requiredProps: ['inviteUrl', 'voyageName'],
    ephemeral: false,
  },
  confirmation: {
    description: 'Confirm an action before executing',
    requiredProps: ['message', 'onConfirm', 'onCancel'],
    ephemeral: true,
  },
  action_buttons: {
    description: 'Contextual action buttons',
    requiredProps: ['actions'],
    ephemeral: true,
  },
  progress: {
    description: 'Show loading or progress',
    requiredProps: ['message'],
    ephemeral: true,
  },
  auth_prompt: {
    description: 'Email input for authentication',
    requiredProps: ['mode'], // 'sign-up' or 'login'
    ephemeral: true,
  },
}

// Helper types for specific components
export interface VoyagePickerProps {
  voyages: Array<{ slug: string; name: string; role?: string }>
  onSelect: (slug: string) => void
}

export interface ConversationPickerProps {
  conversations: Array<{
    id: string
    title?: string
    lastMessage?: string
    updatedAt: Date
  }>
  onSelect: (id: string) => void
}

export interface CreateVoyageFormProps {
  onSubmit: (name: string) => void
  onCancel: () => void
}

export interface InviteCardProps {
  inviteUrl: string
  voyageName: string
}

export interface ConfirmationProps {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export interface ActionButtonsProps {
  actions: Array<{
    id: string
    label: string
    variant?: 'primary' | 'secondary' | 'danger'
    onClick: () => void
  }>
}

export interface ProgressProps {
  message: string
  indeterminate?: boolean
  progress?: number // 0-100
}

export interface AuthPromptProps {
  mode: 'sign-up' | 'login'
  onSubmit: (email: string) => void
  onCancel: () => void
}

/**
 * Create an inline component to render.
 */
export const createComponent = <T extends ComponentType>(
  type: T,
  props: Record<string, unknown>
): InlineComponent => {
  const spec = COMPONENT_SPECS[type]

  return {
    id: `${type}-${Date.now()}`,
    type,
    props,
    ephemeral: spec.ephemeral,
    state: 'active',
  }
}

/**
 * Create a voyage picker component.
 */
export const voyagePicker = (
  voyages: VoyagePickerProps['voyages'],
  onSelect: VoyagePickerProps['onSelect']
): InlineComponent =>
  createComponent('voyage_picker', { voyages, onSelect })

/**
 * Create a conversation picker component.
 */
export const conversationPicker = (
  conversations: ConversationPickerProps['conversations'],
  onSelect: ConversationPickerProps['onSelect']
): InlineComponent =>
  createComponent('conversation_picker', { conversations, onSelect })

/**
 * Create a confirmation dialog component.
 */
export const confirmation = (
  message: string,
  onConfirm: () => void,
  onCancel: () => void,
  options?: { confirmLabel?: string; cancelLabel?: string }
): InlineComponent =>
  createComponent('confirmation', {
    message,
    onConfirm,
    onCancel,
    ...options,
  })

/**
 * Create an auth prompt component.
 */
export const authPrompt = (
  mode: 'sign-up' | 'login',
  onSubmit: (email: string) => void,
  onCancel: () => void
): InlineComponent =>
  createComponent('auth_prompt', { mode, onSubmit, onCancel })

// ═══════════════════════════════════════════════════════════
// MESSAGE PARTS - For rendering in message stream
// ═══════════════════════════════════════════════════════════

/**
 * A part of a message - either text or a component.
 */
export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'component'; component: InlineComponent }

/**
 * A UI message that can be injected into the message stream.
 * Extends the AI SDK UIMessage pattern.
 */
export interface UIComponentMessage {
  id: string
  role: 'assistant'
  parts: MessagePart[]
  ephemeral: boolean  // If true, don't persist to conversation history
  createdAt: Date
}

/**
 * Create a UI message with text and optional components.
 */
export const createUIMessage = (
  text: string,
  components: InlineComponent[] = [],
  ephemeral = true
): UIComponentMessage => {
  const parts: MessagePart[] = [{ type: 'text', text }]

  for (const component of components) {
    parts.push({ type: 'component', component })
  }

  return {
    id: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'assistant',
    parts,
    ephemeral,
    createdAt: new Date(),
  }
}

/**
 * Resolve a component in a message (mark as resolved with result).
 */
export const resolveComponent = (
  message: UIComponentMessage,
  componentId: string,
  resolution: ComponentResolution
): UIComponentMessage => {
  return {
    ...message,
    parts: message.parts.map(part => {
      if (part.type === 'component' && part.component.id === componentId) {
        return {
          ...part,
          component: {
            ...part.component,
            state: 'resolved' as const,
            resolution,
          },
        }
      }
      return part
    }),
  }
}

/**
 * Dismiss a component in a message (mark as dismissed).
 */
export const dismissComponent = (
  message: UIComponentMessage,
  componentId: string
): UIComponentMessage => {
  return {
    ...message,
    parts: message.parts.map(part => {
      if (part.type === 'component' && part.component.id === componentId) {
        return {
          ...part,
          component: {
            ...part.component,
            state: 'dismissed' as const,
          },
        }
      }
      return part
    }),
  }
}
