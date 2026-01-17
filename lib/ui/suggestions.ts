// Context-aware suggestions
// Replace static command hints with dynamic, contextual prompts

export interface Suggestion {
  id: string
  text: string      // What to show (short label)
  action: string    // What user could say (fills input)
  priority: number  // 0-100, higher = more relevant
}

export interface SuggestionContext {
  isAuthenticated: boolean
  hasVoyages: boolean
  currentVoyage?: string
  hasRecentConversations: boolean
  lastMessageRole?: 'user' | 'assistant' | 'system' | string
  conversationLength: number
  isLoading?: boolean
}

/**
 * Get context-aware suggestions based on current state.
 * Returns max 3 suggestions, sorted by priority.
 */
export const getSuggestions = (ctx: SuggestionContext): Suggestion[] => {
  const suggestions: Suggestion[] = []

  // Don't show suggestions while loading
  if (ctx.isLoading) {
    return []
  }

  // Not authenticated - focus on auth
  if (!ctx.isAuthenticated) {
    suggestions.push(
      {
        id: 'signup',
        text: 'Get started',
        action: 'I want to sign up',
        priority: 90,
      },
      {
        id: 'login',
        text: 'I have an account',
        action: 'I want to log in',
        priority: 80,
      }
    )
    return suggestions.slice(0, 2)
  }

  // Empty state - new user with no voyages
  if (!ctx.hasVoyages && ctx.conversationLength === 0) {
    suggestions.push({
      id: 'create-first',
      text: 'Create your first team',
      action: 'Help me set up a team',
      priority: 100,
    })
    return suggestions
  }

  // Has voyages but no active conversation
  if (ctx.conversationLength === 0) {
    if (ctx.hasRecentConversations) {
      suggestions.push({
        id: 'resume',
        text: 'Continue where you left off',
        action: 'What were we working on?',
        priority: 90,
      })
    }
    suggestions.push(
      {
        id: 'new',
        text: 'Start fresh',
        action: "Let's start something new",
        priority: 70,
      },
      {
        id: 'voyages',
        text: 'Switch team',
        action: 'Show my teams',
        priority: 50,
      }
    )
  }

  // Early in conversation (1-3 messages)
  if (ctx.conversationLength > 0 && ctx.conversationLength <= 3) {
    // No suggestions needed - let the conversation flow
    return []
  }

  // Mid-conversation (after assistant response)
  if (ctx.conversationLength > 3 && ctx.lastMessageRole === 'assistant') {
    suggestions.push(
      {
        id: 'save',
        text: 'Save this',
        action: 'Save this as a note',
        priority: 60,
      },
      {
        id: 'share',
        text: 'Share',
        action: 'Share this with the team',
        priority: 50,
      }
    )
  }

  // Sort by priority and take top 3
  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
}

/**
 * Get a single welcome suggestion for empty state.
 * More prominent than regular suggestions.
 */
export const getWelcomeSuggestion = (ctx: SuggestionContext): string | null => {
  if (!ctx.isAuthenticated) {
    return "Welcome to Voyager. Say 'I want to sign up' to get started."
  }

  if (!ctx.hasVoyages) {
    return "Welcome back! Say 'help me set up a team' to create your first voyage."
  }

  if (ctx.conversationLength === 0 && ctx.hasRecentConversations) {
    return "Say 'what were we working on?' to continue, or just start typing."
  }

  return null
}
