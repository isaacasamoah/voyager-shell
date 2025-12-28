// End-of-session memory extraction
// Analyzes conversation and extracts memorable content

import { callGeminiJSON } from '@/lib/gemini/client'
import { createMemory, searchMemories } from '@/lib/memory'
import type { MemoryType } from '@/lib/supabase/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ExtractedMemory {
  type: MemoryType
  content: string
  importance: number // 0-1
  reasoning: string
}

interface ExtractionResult {
  memories: ExtractedMemory[]
  sessionSummary: string
}

const EXTRACTION_PROMPT = `You are a memory extraction agent for Voyager, a personal AI assistant.

Analyze this conversation and extract memories worth keeping for future conversations.

MEMORY TYPES:

**Operational (about the user):**
- fact: Factual information about the user (e.g., "Isaac works at Acme Corp", "Lives in Melbourne")
- preference: User preferences and working style (e.g., "Prefers concise responses", "Likes bullet points")
- entity: Named things the user cares about (e.g., "Project Voyager", "Team member Sarah")
- decision: Decisions made (e.g., "Chose React over Vue", "Budget set to $50K")
- event: Time-based events (e.g., "Started new job in January", "Launch planned for Q1")

**Domain Knowledge (ideas worth building on):**
- insight: The reasoning or wisdom BEHIND a decision - the "why" (e.g., "Terminal-native maintains flow state because users don't context-switch", "Session-based is lower commitment so easier to test")
- concept: Mental models, frameworks, or distinctions worth remembering (e.g., "Session-based vs persistent workspaces serve different collaboration patterns", "The progression: coding with Claude → clauding with Voyager → voyaging with Voyagers")

EXTRACTION RULES:
1. Only extract information useful in FUTURE conversations
2. Be specific and preserve the richness of ideas
3. Avoid temporary/contextual info (e.g., "currently debugging X")
4. Score importance 0.5-1.0 based on long-term usefulness
5. If nothing worth remembering, return empty memories array
6. Maximum 8 memories per conversation (prioritize most important)
7. PRIORITIZE insights and concepts - don't just extract decisions, extract the REASONING
8. For rich design conversations, capture metaphors, frameworks, and patterns discussed

CONVERSATION:
{conversation}

Respond with JSON matching this schema:
{
  "memories": [
    {
      "type": "fact|preference|entity|decision|event|insight|concept",
      "content": "The memory content - for insights/concepts, preserve the full richness of the idea",
      "importance": 0.5-1.0,
      "reasoning": "Why this is worth remembering"
    }
  ],
  "sessionSummary": "One sentence summary of what this conversation was about"
}`

export const extractMemories = async (
  messages: Message[]
): Promise<ExtractionResult> => {
  if (messages.length < 2) {
    // Not enough conversation to extract from
    return { memories: [], sessionSummary: 'Brief interaction' }
  }

  // Format conversation for the prompt
  const conversation = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const prompt = EXTRACTION_PROMPT.replace('{conversation}', conversation)

  try {
    const result = await callGeminiJSON<ExtractionResult>({
      userPrompt: prompt,
      temperature: 0.3, // Lower temp for consistent extraction
    })

    console.log('[Extraction] Extracted', result.memories.length, 'memories')
    return result
  } catch (error) {
    console.error('[Extraction] Failed:', error)
    return { memories: [], sessionSummary: 'Extraction failed' }
  }
}

// Check for semantic duplicates before storing
const isDuplicate = async (
  userId: string,
  content: string
): Promise<boolean> => {
  try {
    const existing = await searchMemories(userId, content, {
      threshold: 0.85, // High threshold = very similar
      limit: 3,
    })

    return existing.length > 0
  } catch {
    // If search fails, allow the memory (better to duplicate than lose)
    return false
  }
}

// Full extraction pipeline: extract → dedupe → store
export const extractAndStoreMemories = async (
  userId: string,
  messages: Message[],
  sessionId?: string
): Promise<{ stored: number; skipped: number; summary: string }> => {
  const result = await extractMemories(messages)

  let stored = 0
  let skipped = 0

  for (const memory of result.memories) {
    // Check for duplicates
    const duplicate = await isDuplicate(userId, memory.content)

    if (duplicate) {
      console.log('[Extraction] Skipping duplicate:', memory.content.slice(0, 50))
      skipped++
      continue
    }

    try {
      await createMemory({
        userId,
        type: memory.type,
        content: memory.content,
        importance: memory.importance,
        confidence: 0.9, // Extraction has high confidence
        sourceSessionId: sessionId,
      })
      stored++
      console.log('[Extraction] Stored:', memory.type, '-', memory.content.slice(0, 50))
    } catch (error) {
      console.error('[Extraction] Failed to store memory:', error)
    }
  }

  return {
    stored,
    skipped,
    summary: result.sessionSummary,
  }
}
