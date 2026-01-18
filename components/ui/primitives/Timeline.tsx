// Timeline primitive - Temporal event sequences with box-drawing
// Connector lines using │ ├─ └─
// Supports icon, title, description, timestamp, status badge

import { type ReactNode } from 'react'

export type TimelineEventStatus = 'success' | 'pending' | 'error' | 'default'

export interface TimelineEvent {
  id: string
  icon?: ReactNode
  title: string
  description?: string
  timestamp: string
  status?: TimelineEventStatus
}

export interface TimelineProps {
  events: TimelineEvent[]
  compact?: boolean
  className?: string
}

const STATUS_BADGE: Record<TimelineEventStatus, { bg: string; text: string; glow?: string }> = {
  success: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    glow: 'shadow-[0_0_8px_rgba(34,197,94,0.3)]',
  },
  pending: {
    bg: 'bg-indigo-500/20',
    text: 'text-indigo-400',
  },
  error: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
  },
  default: {
    bg: 'bg-white/5',
    text: 'text-slate-400',
  },
}

const STATUS_LABELS: Record<TimelineEventStatus, string> = {
  success: 'Done',
  pending: 'Pending',
  error: 'Failed',
  default: '',
}

export const Timeline = ({
  events,
  compact = false,
  className = '',
}: TimelineProps) => {
  return (
    <div className={`font-mono ${className}`.trim()}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1
        const connector = isLast ? '└─' : '├─'
        const statusStyle = STATUS_BADGE[event.status ?? 'default']

        return (
          <div key={event.id} className="flex">
            {/* Connector column */}
            <div className="flex flex-col items-center mr-2 select-none">
              <span className="text-slate-600 text-sm whitespace-pre">{connector}</span>
              {!isLast && (
                <div className="w-px flex-1 bg-white/10 ml-[1px]" />
              )}
            </div>

            {/* Content column */}
            <div className={`flex-1 ${compact ? 'pb-2' : 'pb-4'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                {event.icon && (
                  <span className="text-slate-500 w-4 h-4 flex items-center justify-center">
                    {event.icon}
                  </span>
                )}
                <span className="text-sm text-slate-300">{event.title}</span>
                {event.status && event.status !== 'default' && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-sm ${statusStyle.bg} ${statusStyle.text} ${statusStyle.glow ?? ''}`}
                  >
                    {STATUS_LABELS[event.status]}
                  </span>
                )}
              </div>
              {!compact && event.description && (
                <p className="text-xs text-slate-500 mt-1 ml-0">
                  {event.description}
                </p>
              )}
              <p className="text-[10px] text-slate-600 tracking-wider mt-0.5">
                {event.timestamp}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
