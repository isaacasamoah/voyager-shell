// Retrieval event logging for DSPy ground truth
// Fire-and-forget: don't block responses for logging

import { getAdminClient } from '@/lib/supabase/admin';
import type { KnowledgeNode } from '@/lib/knowledge';

// ============================================================================
// Types
// ============================================================================

export interface RetrievalEventInput {
  userId: string;
  conversationId?: string;
  voyageSlug?: string;
  query: string;
  nodesReturned: KnowledgeNode[];
  threshold: number;
  pinnedCount: number;
  searchCount: number;
  latencyMs: number;
  tokensInContext: number;
}

export interface RetrievalEventRecord {
  id: string;
  // For updating with citations later
}

// ============================================================================
// Citation Detection
// ============================================================================

/**
 * Detect which returned nodes were cited in the response.
 * Simple heuristic: check if significant chunks of node content appear in response.
 */
export const detectCitations = (
  response: string,
  returnedNodes: KnowledgeNode[]
): { citedIds: string[]; confidence: number } => {
  if (returnedNodes.length === 0) {
    return { citedIds: [], confidence: 1.0 };
  }

  const citedIds: string[] = [];
  const responseLower = response.toLowerCase();

  for (const node of returnedNodes) {
    // Split content into sentences/chunks
    const chunks = node.content
      .split(/[.!?\n]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 15); // Only meaningful chunks

    for (const chunk of chunks) {
      // Check if a significant portion appears in response
      const normalized = chunk.toLowerCase();
      // Check first 40 chars to avoid false negatives from paraphrasing
      const searchText = normalized.slice(0, 40);

      if (searchText.length > 15 && responseLower.includes(searchText)) {
        citedIds.push(node.eventId);
        break; // Found match, move to next node
      }
    }
  }

  // Confidence: ratio of cited to returned
  // Low confidence if we found very few citations (might have missed some)
  const confidence =
    returnedNodes.length > 0
      ? Math.min(1.0, citedIds.length / Math.min(returnedNodes.length, 3))
      : 1.0;

  return { citedIds, confidence };
};

// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Log a retrieval event. Returns the event ID for later citation update.
 * Fire-and-forget: errors are logged but don't throw.
 */
export const logRetrievalEvent = async (
  input: RetrievalEventInput
): Promise<string | null> => {
  try {
    const supabase = getAdminClient();

    
    const { data, error } = await (supabase as any)
      .from('retrieval_events')
      .insert({
        user_id: input.userId,
        conversation_id: input.conversationId || null,
        voyage_slug: input.voyageSlug || null,
        query: input.query,
        nodes_returned: input.nodesReturned.map((n) => n.eventId),
        retrieval_threshold: input.threshold,
        pinned_count: input.pinnedCount,
        search_count: input.searchCount,
        latency_ms: input.latencyMs,
        tokens_in_context: input.tokensInContext,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[RetrievalLog] Failed to log event:', error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error('[RetrievalLog] Error logging event:', error);
    return null;
  }
};

/**
 * Update a retrieval event with citation data after response is generated.
 * Fire-and-forget: errors are logged but don't throw.
 */
export const updateRetrievalCitations = async (
  eventId: string,
  citedIds: string[],
  confidence: number
): Promise<void> => {
  try {
    const supabase = getAdminClient();

    
    const { error } = await (supabase as any)
      .from('retrieval_events')
      .update({
        nodes_cited: citedIds,
        citation_confidence: confidence,
      })
      .eq('id', eventId);

    if (error) {
      console.error('[RetrievalLog] Failed to update citations:', error);
    }
  } catch (error) {
    console.error('[RetrievalLog] Error updating citations:', error);
  }
};

/**
 * Combined helper: detect citations and update the event.
 */
export const logCitations = async (
  eventId: string | null,
  response: string,
  returnedNodes: KnowledgeNode[]
): Promise<void> => {
  if (!eventId) return;

  const { citedIds, confidence } = detectCitations(response, returnedNodes);
  await updateRetrievalCitations(eventId, citedIds, confidence);

  if (citedIds.length > 0) {
    console.log(
      `[RetrievalLog] Cited ${citedIds.length}/${returnedNodes.length} nodes (confidence: ${confidence.toFixed(2)})`
    );
  }
};
