import { streamText, stepCountIs, APICallError } from 'ai';
import { waitUntil } from '@vercel/functions';
import { composeSystemPrompt, getBasePrompt } from '@/lib/prompts';
import {
  saveMessage,
  needsTitle,
  setConversationTitle,
  loadConversationMessages,
  type ConversationMessage,
} from '@/lib/conversation';
import { computeWindow, getTruncatedMessages } from '@/lib/conversation/window';
import {
  detectReferenceSignals,
  retrieveForContinuity,
} from '@/lib/conversation/continuity';
import { detectLearningSignal, emitSignal } from '@/lib/learning/signals';
import { callGeminiJSON } from '@/lib/gemini/client';
import { emitMessageEvent, type KnowledgeNode } from '@/lib/knowledge';
import { logRetrievalEvent, logCitations, createVoyagerTools } from '@/lib/retrieval';
import { getAuthenticatedUserId } from '@/lib/auth';
import { classifySearchDepth } from '@/lib/agents/depth-classifier';
import { modelRouter, creditTracker } from '@/lib/models';
import { log } from '@/lib/debug';

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
  return messages
    .map((msg) => {
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
    })
    .filter((msg) => msg.content.trim() !== ''); // Filter out empty messages
};

export const POST = async (req: Request) => {
  log.api('Chat request received');

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

    log.message('Processing user message', {
      conversationId,
      voyageSlug,
      messageCount: simpleMessages.length,
      queryLength: queryText.length,
    });

    // =============================================================================
    // CONVERSATION CONTINUITY: Sliding Window + Reference Detection
    // =============================================================================

    // Convert to ConversationMessage format for window computation
    const conversationMessages: ConversationMessage[] = simpleMessages.map((m, i) => ({
      id: `msg-${i}`,
      conversationId: conversationId ?? '',
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: new Date(),
    }));

    // Compute token-budgeted sliding window
    const windowResult = computeWindow(conversationMessages);
    const truncatedMessages = getTruncatedMessages(conversationMessages, windowResult);

    // Detect reference signals in user message (implicit: "that thing", temporal: "earlier")
    const referenceSignals = queryText ? detectReferenceSignals(queryText) : [];

    // Retrieve continuity context if signals detected or messages were truncated
    let continuityContext: string | null = null;
    if (referenceSignals.length > 0 || windowResult.hasMoreHistory) {
      continuityContext = await retrieveForContinuity(
        referenceSignals,
        queryText,
        truncatedMessages,
        { userId, voyageSlug, conversationId: conversationId ?? '' }
      );
      if (continuityContext) {
        log.memory('Continuity context retrieved', { length: continuityContext.length, preview: continuityContext.slice(0, 80) });
      }
    }

    // Detect and emit learning signals (corrections, re-explanations)
    if (queryText && conversationId) {
      const learningSignal = detectLearningSignal(queryText);
      if (learningSignal) {
        log.memory('Learning signal detected', { signal: learningSignal });
        emitSignal({
          type: learningSignal,
          conversationId,
          userId,
          voyageSlug,
          context: queryText.slice(0, 200),
          timestamp: new Date(),
        });
      }
    }

    // Use windowed messages for the LLM context
    const windowedSimpleMessages = windowResult.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
        { voyageSlug, continuityContext }
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
      log.api('Prompt composition failed, using base prompt', { error: String(error) }, 'warn');
      systemPrompt = getBasePrompt();
    }

    // Classify query depth to determine if deep retrieval will run
    // If comprehensive, let Voyager know naturally so it can set expectations
    const queryDepth = classifySearchDepth(queryText);
    if (queryDepth === 'comprehensive') {
      log.agent('Comprehensive query - adding deep search awareness to prompt');
      systemPrompt += `\n\n[Context: This looks like a broad question. You're searching your memory more thoroughly in the background. Answer naturally with what you know now - if you find more context, you'll share it as a follow-up. Don't mention "deep retrieval" or technical terms - just be natural about it, like "let me think about everything we've discussed..." or "I'm pulling together what I remember..."]`;
    }

    // Create Voyager tools (spawn_background_agent + web_search)
    const voyagerTools = createVoyagerTools({
      userId,
      voyageSlug,
      conversationId,
      waitUntil,
    });

    // Primary Voyager with tools
    // Voyager decides when to spawn background agents for deep work
    // Uses pre-fetched context for fast responses
    const result = streamText({
      model: modelRouter.select({
        task: 'chat',
        quality: 'balanced',
        streaming: true,
        toolUse: true,
      }),
      system: systemPrompt,
      messages: windowedSimpleMessages,
      tools: voyagerTools,
      stopWhen: stepCountIs(3), // Allow tool call → result → final response
      onFinish: async ({ text, finishReason, usage }) => {
        log.message('Stream complete', {
          textLength: text?.length ?? 0,
          finishReason,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        });

        // Track credits (fire-and-forget for now, logs to console)
        if (usage) {
          const inputTokens = usage.inputTokens ?? 0;
          const outputTokens = usage.outputTokens ?? 0;
          creditTracker.track({
            userId,
            model: 'claude-sonnet',
            inputTokens,
            outputTokens,
            cost: modelRouter.estimateCost('claude-sonnet', inputTokens, outputTokens),
            task: 'chat',
            conversationId,
          });
        }

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
    log.api('Chat API error', { error: String(error) }, 'error');
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
