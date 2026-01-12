// Agent Result Card
// Displays background agent findings that surfaced via Realtime
//
// Design: Voyager synthesizes raw findings into conversational follow-up
// The summary is the main content, sources are expandable for transparency

import React, { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, X, FileText } from 'lucide-react'

interface Finding {
  eventId: string
  content: string
  similarity?: number
  isPinned?: boolean
}

interface AgentResult {
  id: string
  task: string
  result: {
    findings: Finding[]
    confidence: number
    summary?: string
    type?: string // 'deep_retrieval' for parallel paths
  }
}

interface AgentResultCardProps {
  result: AgentResult
  onDismiss: () => void
}

export const AgentResultCard = ({ result, onDismiss }: AgentResultCardProps) => {
  const [showSources, setShowSources] = useState(false)

  const { findings, summary } = result.result
  const findingsCount = findings.length

  // If no findings and no summary, don't render
  if (findingsCount === 0 && !summary) {
    return null
  }

  return (
    <div className="bg-gradient-to-r from-indigo-950/40 to-violet-950/30 border border-indigo-400/20 rounded-lg p-4 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-indigo-400 mt-0.5">
          <Sparkles className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Main content: Voyager's synthesis */}
          {summary ? (
            <p className="text-slate-200 leading-relaxed">{summary}</p>
          ) : (
            <p className="text-slate-300 text-sm">
              Found {findingsCount} additional item{findingsCount !== 1 ? 's' : ''} that might be relevant.
            </p>
          )}

          {/* Sources toggle */}
          {findingsCount > 0 && (
            <button
              onClick={() => setShowSources(!showSources)}
              className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                {showSources ? 'Hide' : 'Show'} {findingsCount} source{findingsCount !== 1 ? 's' : ''}
              </span>
              {showSources ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}

          {/* Expanded sources */}
          {showSources && (
            <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
              {findings.map((finding, idx) => (
                <div
                  key={finding.eventId || idx}
                  className="bg-black/30 rounded p-3 text-sm"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                    {finding.isPinned && (
                      <span className="text-amber-400 font-medium">Pinned</span>
                    )}
                    {finding.similarity && (
                      <span className="text-slate-500">
                        {Math.round(finding.similarity * 100)}% match
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 whitespace-pre-wrap">
                    {finding.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="p-1.5 hover:bg-white/5 rounded text-slate-500 hover:text-slate-400 transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
