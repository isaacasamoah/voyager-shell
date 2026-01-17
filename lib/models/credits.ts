// Credit Tracking
// Tracks model usage and costs per user/voyage

export interface CreditUsage {
  userId: string
  voyageSlug?: string
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  task: string
  conversationId?: string
  timestamp?: Date
}

export interface UsageSummary {
  totalCost: number
  totalTokens: number
  byModel: Record<string, { cost: number; tokens: number }>
  windowStart: Date
  windowEnd: Date
}

export interface CreditTracker {
  track(usage: CreditUsage): Promise<void>
  getUsage(userId: string, windowMs?: number): Promise<UsageSummary>
  hasCredits(userId: string): Promise<boolean>
}

// In-memory tracker for now (DB integration later in Phase F)
export const createCreditTracker = (): CreditTracker => {
  const usageLog: CreditUsage[] = []

  return {
    async track(usage: CreditUsage): Promise<void> {
      usageLog.push({ ...usage, timestamp: new Date() })
      // TODO: Persist to DB in Phase F
    },

    async getUsage(userId: string, windowMs = 30 * 24 * 60 * 60 * 1000): Promise<UsageSummary> {
      const windowStart = new Date(Date.now() - windowMs)
      const windowEnd = new Date()

      const userUsage = usageLog.filter(
        u => u.userId === userId && u.timestamp && u.timestamp >= windowStart
      )

      const byModel: Record<string, { cost: number; tokens: number }> = {}
      let totalCost = 0
      let totalTokens = 0

      for (const u of userUsage) {
        totalCost += u.cost
        totalTokens += u.inputTokens + u.outputTokens
        if (!byModel[u.model]) {
          byModel[u.model] = { cost: 0, tokens: 0 }
        }
        byModel[u.model].cost += u.cost
        byModel[u.model].tokens += u.inputTokens + u.outputTokens
      }

      return { totalCost, totalTokens, byModel, windowStart, windowEnd }
    },

    async hasCredits(userId: string): Promise<boolean> {
      // TODO: Check against limits in Phase F
      return true
    },
  }
}

export const creditTracker = createCreditTracker()
