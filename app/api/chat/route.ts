import { anthropic } from '@ai-sdk/anthropic';
import { streamText, APICallError, stepCountIs } from 'ai';
import { composeSystemPrompt, getBasePrompt } from '@/lib/prompts';
import {
  saveMessage,
  needsTitle,
  setConversationTitle,
  loadConversationMessages,
} from '@/lib/conversation';
import { callGeminiJSON } from '@/lib/gemini/client';
import { emitMessageEvent, type KnowledgeNode } from '@/lib/knowledge';
import { logRetrievalEvent, logCitations, createRetrievalTools } from '@/lib/retrieval';
import { getAuthenticatedUserId } from '@/lib/auth';

export const maxDuration = 30;

// Fallback for development (will be removed once auth is fully tested)
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

// =============================================================================
// Title Generation
// =============================================================================

interface TitleResponse {
  title: string;
}

/**
 * Generate a semantic title for a conversation using Gemini.
 * Called async after the conversation has enough messages.
 */
const generateTitle = async (conversationId: string): Promise<string | null> => {
  try {
    // Load recent messages for context
    const messages = await loadConversationMessages(conversationId, 10);
    if (messages.length < 4) return null;

    const transcript = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    const result = await callGeminiJSON<TitleResponse>({
      systemPrompt: `You are a title generator. Create a brief, descriptive title (3-6 words) that captures the essence of this conversation. The title should be specific and meaningful, not generic.`,
      userPrompt: `Generate a title for this conversation:\n\n${transcript}`,
      temperature: 0.3,
      maxTokens: 50,
    });

    return result.title || null;
  } catch (error) {
    console.error('[Chat] Title generation failed:', error);
    return null;
  }
};

/**
 * Check if title is needed and generate one asynchronously.
 * Fire-and-forget - does not block the response.
 */
const maybeGenerateTitle = (conversationId: string): void => {
  // Fire-and-forget - don't await
  needsTitle(conversationId)
    .then(async (needs) => {
      if (needs) {
        console.log('[Chat] Generating title for conversation:', conversationId);
        const title = await generateTitle(conversationId);
        if (title) {
          await setConversationTitle(conversationId, title);
          console.log('[Chat] Title set:', title);
        }
      }
    })
    .catch((error) => {
      console.error('[Chat] Title check failed:', error);
    });
};


// Message types for AI SDK v6
interface UIMessagePart {
  type: string;
  text?: string;
}

interface UIMessage {
  role: 'user' | 'assistant' | 'system';
  parts?: UIMessagePart[];
  content?: string;
}

interface SimpleMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Convert UIMessage format (parts array) to simple message format
const convertToSimpleMessages = (messages: UIMessage[]): SimpleMessage[] => {
  return messages.map((msg) => {
    // Extract text content from parts array (AI SDK v6 format)
    let content: string;
    if (msg.parts && Array.isArray(msg.parts)) {
      content = msg.parts
        .filter((part) => part.type === 'text' && part.text)
        .map((part) => part.text)
        .join('');
    } else if (typeof msg.content === 'string') {
      content = msg.content;
    } else {
      content = '';
    }

    return {
      role: msg.role,
      content,
    };
  });
};

export const POST = async (req: Request) => {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'Configuration error',
        message: 'ANTHROPIC_API_KEY is not configured'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    // Get authenticated user ID, fall back to dev user if not authenticated
    const userId = await getAuthenticatedUserId() ?? DEV_USER_ID;

    const { messages, conversationId, voyageSlug } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'messages array is required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Convert from UIMessage format to simple message format
    const simpleMessages = convertToSimpleMessages(messages);

    // Extract the last user message for context retrieval
    const lastUserMessage = simpleMessages
      .filter((m) => m.role === 'user')
      .pop();
    const queryText = lastUserMessage?.content ?? '';

    // Save user message to DB (fire-and-forget, don't block streaming)
    if (conversationId && queryText) {
      saveMessage(conversationId, 'user', queryText).catch((error) => {
        console.error('[Chat] Failed to save user message:', error);
      });

      // Emit knowledge event (fire-and-forget)
      // Messages ARE the knowledge — preserved exactly as source events
      emitMessageEvent(conversationId, 'user', queryText, {
        userId: userId,
        voyageSlug: voyageSlug,
      });
    }

    // Compose system prompt with context retrieval
    // Uses placeholder user ID until auth is wired up
    // Falls back to base prompt if retrieval fails
    let systemPrompt: string;
    let retrievedKnowledge: KnowledgeNode[] = [];
    let retrievalEventId: string | null = null;

    try {
      const { systemPrompt: composedPrompt, retrieval } = await composeSystemPrompt(
        userId,
        queryText,
        { voyageSlug }
      );
      systemPrompt = composedPrompt;
      retrievedKnowledge = retrieval.knowledge;

      // Log retrieval event (fire-and-forget)
      logRetrievalEvent({
        userId: userId,
        conversationId,
        query: queryText,
        nodesReturned: retrieval.knowledge,
        threshold: retrieval.metadata.threshold,
        pinnedCount: retrieval.metadata.pinnedCount,
        searchCount: retrieval.metadata.searchCount,
        latencyMs: retrieval.metadata.latencyMs,
        tokensInContext: retrieval.tokenEstimate,
      }).then((id) => {
        retrievalEventId = id;
      });
    } catch (error) {
      console.warn('[Chat] Prompt composition failed, using base prompt:', error);
      systemPrompt = getBasePrompt();
    }

    // Create retrieval tools for agentic search
    // Claude decides when and how to dig deeper into knowledge
    const retrievalTools = createRetrievalTools({
      userId,
      voyageSlug,
    });

    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages: simpleMessages,
      tools: retrievalTools,
      stopWhen: stepCountIs(5), // Allow up to 5 tool-calling steps per response
      onFinish: async ({ text }) => {
        // Save assistant response after streaming completes
        if (conversationId && text) {
          try {
            await saveMessage(conversationId, 'assistant', text);

            // Emit knowledge event (fire-and-forget)
            // Messages ARE the knowledge — preserved exactly as source events
            emitMessageEvent(conversationId, 'assistant', text, {
              userId: userId,
              voyageSlug: voyageSlug,
            });

            // Log citations (fire-and-forget)
            // Detects which retrieved nodes were actually used in the response
            logCitations(retrievalEventId, text, retrievedKnowledge);

            // Check if title generation is needed (async, don't wait)
            maybeGenerateTitle(conversationId);
          } catch (error) {
            console.error('[Chat] Failed to save assistant message:', error);
          }
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    // Handle rate limits and API errors
    if (error instanceof APICallError) {
      const status = error.statusCode ?? 500;

      if (status === 429) {
        return new Response(
          JSON.stringify({
            error: 'Rate limited',
            message: 'Too many requests. Please try again in a moment.'
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (status === 401) {
        return new Response(
          JSON.stringify({
            error: 'Authentication error',
            message: 'Invalid API key'
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'API error',
          message: error.message
        }),
        {
          status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Invalid JSON in request body'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Generic error fallback
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        message: 'An unexpected error occurred'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
