// Task Card
// Shows progress of running background agents
// Minimal version - to be redesigned via /design with Gemini
//
// Design requirements for later:
// - Voyager aesthetic (dark theme, indigo accents)
// - Progress bar with scanning animation
// - Stage indicators (analyzing → searching → clustering → synthesizing)
// - Inline with chat stream

import React from 'react'
import { Search, Loader2 } from 'lucide-react'

export interface TaskProgress {
  stage: 'analyzing' | 'searching' | 'clustering' | 'synthesizing'
  found?: number
  processed?: number
  percent?: number
}

interface TaskCardProps {
  id: string
  objective: string
  progress?: TaskProgress
}

const stageLabels: Record<TaskProgress['stage'], string> = {
  analyzing: 'Analyzing...',
  searching: 'Searching...',
  clustering: 'Organizing...',
  synthesizing: 'Synthesizing...',
}

export const TaskCard = ({ objective, progress }: TaskCardProps) => {
  const percent = progress?.percent ?? 0
  const stage = progress?.stage ?? 'analyzing'
  const found = progress?.found

  return (
    <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-4 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-indigo-400 mt-0.5">
          <Search className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Objective */}
          <p className="text-slate-300 text-sm mb-2 truncate">
            {objective}
          </p>

          {/* Stage */}
          <div className="flex items-center gap-2 text-xs text-indigo-400 mb-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{stageLabels[stage]}</span>
            {found !== undefined && (
              <span className="text-slate-500">found {found} items</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
