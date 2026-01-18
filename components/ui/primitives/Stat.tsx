// Stat primitive - Key metric display
// Label (caption), value (large), optional delta/trend
// Delta shows +/- with green/red coloring

import { type ReactNode } from 'react'

export interface StatProps {
  label: string
  value: string | number
  delta?: number
  deltaLabel?: string  // e.g., "vs last week"
  trend?: ReactNode    // Sparkline or trend indicator
  className?: string
}

export const Stat = ({
  label,
  value,
  delta,
  deltaLabel,
  trend,
  className = '',
}: StatProps) => {
  const deltaIsPositive = delta !== undefined && delta > 0
  const deltaIsNegative = delta !== undefined && delta < 0

  return (
    <div
      className={`bg-[#0A0A0A] rounded-sm border border-white/10 p-4 hover:bg-white/[0.03] transition-colors ${className}`.trim()}
    >
      {/* Label */}
      <div className="text-[10px] tracking-wider uppercase text-slate-500 font-mono mb-1">
        {label}
      </div>

      {/* Value */}
      <div className="text-2xl font-bold text-slate-200 font-mono">
        {value}
      </div>

      {/* Delta */}
      {delta !== undefined && (
        <div className="flex items-center gap-1.5 mt-1">
          <span
            className={`text-sm font-mono ${
              deltaIsPositive
                ? 'text-green-400 shadow-[0_0_8px_rgba(34,197,94,0.2)]'
                : deltaIsNegative
                ? 'text-red-400'
                : 'text-slate-500'
            }`}
          >
            {deltaIsPositive ? '+' : ''}{delta}
          </span>
          {deltaLabel && (
            <span className="text-[10px] text-slate-600">{deltaLabel}</span>
          )}
        </div>
      )}

      {/* Trend */}
      {trend && (
        <div className="mt-3 pt-3 border-t border-white/5">
          {trend}
        </div>
      )}
    </div>
  )
}
