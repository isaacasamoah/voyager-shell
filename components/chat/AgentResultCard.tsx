// Agent Result Card
// Displays background agent findings that surfaced via Realtime
//
// Pattern: Claude as Query Compiler
// Results appear after the worker executes Claude-generated retrieval code

import React, { useState } from 'react'
import { Lightbulb, ChevronDown, ChevronUp, X } from 'lucide-react'

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
  }
}

interface AgentResultCardProps {
  result: AgentResult
  onDismiss: () => void
}

export const AgentResultCard = ({ result, onDismiss }: AgentResultCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const { findings, confidence, summary } = result.result
  const findingsCount = findings.length

  if (findingsCount === 0) {
    return null
  }

  return (
    <div className="bg-surface border border-white/10 rounded-lg p-4 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-indigo-400 mt-0.5">
          <Lightbulb className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-slate-300 text-sm font-medium">
              I found more context...
            </p>
            <span className="text-xs text-slate-500">
              {Math.round(confidence * 100)}% confident
            </span>
          </div>

          {summary ? (
            <p className="text-slate-400 text-sm mt-1">{summary}</p>
          ) : (
            <p className="text-slate-500 text-xs mt-1">
              {findingsCount} additional item{findingsCount !== 1 ? 's' : ''} found
            </p>
          )}

          {/* Expanded findings */}
          {isExpanded && (
            <div className="mt-3 space-y-2">
              {findings.slice(0, 5).map((finding, idx) => (
                <div
                  key={finding.eventId || idx}
                  className="bg-black/30 rounded p-2 text-sm"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <span className="font-mono">
                      {finding.eventId?.slice(0, 8) || 'unknown'}
                    </span>
                    {finding.isPinned && (
                      <span className="text-amber-400">[PINNED]</span>
                    )}
                    {finding.similarity && (
                      <span>{Math.round(finding.similarity * 100)}%</span>
                    )}
                  </div>
                  <p className="text-slate-300 line-clamp-3">{finding.content}</p>
                </div>
              ))}
              {findingsCount > 5 && (
                <p className="text-xs text-slate-500">
                  +{findingsCount - 5} more
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-white/5 rounded text-slate-400 hover:text-slate-300 transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 hover:bg-white/5 rounded text-slate-500 hover:text-slate-400 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
