// Gemini Flash client for high-volume, low-cost operations
// Used for: extraction, curation, summarization

const GEMINI_MODEL = 'gemini-2.0-flash-exp'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

interface GeminiRequest {
  systemPrompt?: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}

interface GeminiResponse {
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

// Parse retry delay from Gemini error response (e.g., "5.629705366s" -> 5630ms)
const parseRetryDelay = (errorBody: string): number | null => {
  try {
    const parsed = JSON.parse(errorBody)
    const retryInfo = parsed.error?.details?.find(
      (d: { '@type': string }) => d['@type']?.includes('RetryInfo')
    )
    if (retryInfo?.retryDelay) {
      const seconds = parseFloat(retryInfo.retryDelay.replace('s', ''))
      return Math.ceil(seconds * 1000)
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const callGemini = async (request: GeminiRequest): Promise<GeminiResponse> => {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY not configured')
  }

  const parts = []
  if (request.systemPrompt) {
    parts.push({ text: request.systemPrompt })
  }
  parts.push({ text: request.userPrompt })

  const body = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: request.temperature ?? 0.3,
      maxOutputTokens: request.maxTokens ?? 4096,
    },
  })

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (response.ok) {
      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

      return {
        text,
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
        } : undefined,
      }
    }

    const errorBody = await response.text()

    // Handle rate limiting (429)
    if (response.status === 429) {
      const retryDelay = parseRetryDelay(errorBody) || BASE_DELAY_MS * Math.pow(2, attempt)
      console.log(`[Gemini] Rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} in ${retryDelay}ms`)

      if (attempt < MAX_RETRIES - 1) {
        await sleep(retryDelay)
        continue
      }
    }

    // Handle other transient errors (500, 502, 503, 504)
    if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt)
      console.log(`[Gemini] Server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`)
      await sleep(delay)
      continue
    }

    // Non-retryable error or exhausted retries
    console.error('[Gemini] API error:', response.status, errorBody)
    lastError = new Error(`Gemini API error: ${response.status}`)
  }

  throw lastError || new Error('Gemini API failed after retries')
}

// Convenience wrapper for JSON responses
export const callGeminiJSON = async <T>(request: GeminiRequest): Promise<T> => {
  const response = await callGemini({
    ...request,
    userPrompt: `${request.userPrompt}\n\nRespond with valid JSON only. No markdown, no explanation.`,
  })

  try {
    // Clean potential markdown code blocks
    let cleaned = response.text.trim()
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7)
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3)
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3)
    }

    return JSON.parse(cleaned.trim())
  } catch (error) {
    console.error('[Gemini] Failed to parse JSON:', response.text)
    throw new Error('Failed to parse Gemini JSON response')
  }
}
