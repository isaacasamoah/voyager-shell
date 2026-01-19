// Tavily Web Search Integration
// Simple REST API client for web search

export interface TavilySearchOptions {
  query: string
  searchDepth?: 'basic' | 'advanced'
  maxResults?: number
  includeDomains?: string[]
  excludeDomains?: string[]
  includeAnswer?: boolean
  includeRawContent?: boolean
}

export interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
  publishedDate?: string
}

export interface TavilyResponse {
  query: string
  answer?: string
  results: TavilyResult[]
  responseTime: number
}

const TAVILY_API_URL = 'https://api.tavily.com/search'

/**
 * Search the web using Tavily API.
 * Returns formatted results for LLM consumption.
 */
export async function searchWeb(
  query: string,
  options: {
    recency?: 'day' | 'week' | 'month' | 'any'
    maxResults?: number
  } = {}
): Promise<{ answer?: string; results: TavilyResult[]; error?: string }> {
  const apiKey = process.env.TAVILY_API_KEY

  if (!apiKey) {
    console.warn('[Tavily] No API key configured (TAVILY_API_KEY)')
    return {
      results: [],
      error: 'Web search not configured. Add TAVILY_API_KEY to enable.',
    }
  }

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: options.maxResults ?? 5,
        include_answer: true,
        include_raw_content: false,
        // Map recency to days
        ...(options.recency && options.recency !== 'any' && {
          days: options.recency === 'day' ? 1 : options.recency === 'week' ? 7 : 30,
        }),
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Tavily] API error:', response.status, error)
      return {
        results: [],
        error: `Search failed: ${response.status}`,
      }
    }

    const data: TavilyResponse = await response.json()

    console.log('[Tavily] Search complete:', {
      query,
      resultCount: data.results.length,
      hasAnswer: !!data.answer,
      responseTime: data.responseTime,
    })

    return {
      answer: data.answer,
      results: data.results,
    }
  } catch (error) {
    console.error('[Tavily] Request failed:', error)
    return {
      results: [],
      error: error instanceof Error ? error.message : 'Search request failed',
    }
  }
}

/**
 * Format Tavily results for LLM context.
 */
export function formatSearchResults(
  results: TavilyResult[],
  answer?: string
): string {
  if (results.length === 0 && !answer) {
    return 'No results found.'
  }

  const parts: string[] = []

  if (answer) {
    parts.push(`Summary: ${answer}`)
  }

  if (results.length > 0) {
    parts.push('\nSources:')
    results.forEach((r, i) => {
      parts.push(`${i + 1}. ${r.title}`)
      parts.push(`   ${r.url}`)
      parts.push(`   ${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}`)
    })
  }

  return parts.join('\n')
}
