// Agent Result Card
// Displays background agent findings that surfaced via Realtime
//
// Design: Voyager synthesizes raw findings into conversational follow-up
// Supports progressive disclosure with themed clusters
// The summary is the main content, clusters are expandable for transparency

import React, { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, X, FileText, Folder, FolderOpen } from 'lucide-react'

interface Finding {
  eventId: string
  content: string
  similarity?: number
  isPinned?: boolean
}

interface FindingCluster {
  id: string
  theme: string
  summary: string
  confidence: number
  findings: Finding[]
  representativeId: string
}

interface AgentResult {
  id: string
  task: string
  result: {
    // Legacy flat findings (backwards compatible)
    findings?: Finding[]
    // New clustered structure
    clusters?: FindingCluster[]
    unclustered?: Finding[]
    totalFindings?: number
    confidence: number
    summary?: string
    type?: string // 'deep_retrieval' for parallel paths
  }
}

interface AgentResultCardProps {
  result: AgentResult
  onDismiss: () => void
}

// Cluster item component for progressive disclosure
const ClusterItem = ({ cluster }: { cluster: FindingCluster }) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        {expanded ? (
          <FolderOpen className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        )}
        <span className="text-sm text-slate-200 flex-1 truncate">{cluster.theme}</span>
        <span className="text-xs text-slate-500">
          {cluster.findings.length} item{cluster.findings.length !== 1 ? 's' : ''}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5">
          {/* Cluster summary */}
          <p className="text-xs text-slate-400 pt-2 italic">{cluster.summary}</p>

          {/* Findings in cluster */}
          {cluster.findings.map((finding, idx) => (
            <div
              key={finding.eventId || idx}
              className="bg-black/30 rounded p-2.5 text-sm"
            >
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                {finding.isPinned && (
                  <span className="text-amber-400 font-medium">Pinned</span>
                )}
                {finding.similarity !== undefined && (
                  <span>{Math.round(finding.similarity * 100)}% match</span>
                )}
              </div>
              <p className="text-slate-300 whitespace-pre-wrap text-sm">
                {finding.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const AgentResultCard = ({ result, onDismiss }: AgentResultCardProps) => {
  const [showSources, setShowSources] = useState(false)

  const { findings, clusters, unclustered, summary, totalFindings } = result.result

  // Determine what to show: new cluster structure or legacy findings
  const hasClusters = clusters && clusters.length > 0
  const legacyFindings = findings ?? []
  const findingsCount = totalFindings ?? legacyFindings.length

  // If nothing to show, don't render
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
                {showSources ? 'Hide' : 'Show'} {hasClusters ? `${clusters.length} themes` : `${findingsCount} source${findingsCount !== 1 ? 's' : ''}`}
              </span>
              {showSources ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}

          {/* Expanded: Clusters or legacy findings */}
          {showSources && (
            <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
              {hasClusters ? (
                <>
                  {/* Clustered findings */}
                  {clusters.map((cluster) => (
                    <ClusterItem key={cluster.id} cluster={cluster} />
                  ))}

                  {/* Unclustered findings */}
                  {unclustered && unclustered.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs text-slate-500 mb-2">
                        + {unclustered.length} additional item{unclustered.length !== 1 ? 's' : ''}
                      </p>
                      {unclustered.map((finding, idx) => (
                        <div
                          key={finding.eventId || idx}
                          className="bg-black/30 rounded p-2.5 text-sm mb-2"
                        >
                          <p className="text-slate-300 whitespace-pre-wrap">
                            {finding.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Legacy: flat findings list */
                legacyFindings.map((finding, idx) => (
                  <div
                    key={finding.eventId || idx}
                    className="bg-black/30 rounded p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                      {finding.isPinned && (
                        <span className="text-amber-400 font-medium">Pinned</span>
                      )}
                      {finding.similarity !== undefined && (
                        <span>{Math.round(finding.similarity * 100)}% match</span>
                      )}
                    </div>
                    <p className="text-slate-300 whitespace-pre-wrap">
                      {finding.content}
                    </p>
                  </div>
                ))
              )}
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
