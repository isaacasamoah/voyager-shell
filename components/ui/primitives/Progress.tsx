// Progress primitive - Linear bar and circular ring variants
// Variants: default (indigo), success (green), warning (amber), error (red)
// Optional label and value display

'use client'

import { useEffect, useState } from 'react'

export type ProgressVariant = 'default' | 'success' | 'warning' | 'error'

export interface ProgressProps {
  variant?: ProgressVariant
  value: number
  max?: number
  label?: string
  showValue?: boolean
  circular?: boolean
  className?: string
}

const VARIANT_STYLES: Record<ProgressVariant, { fill: string; glow: string }> = {
  default: {
    fill: 'bg-indigo-500',
    glow: 'shadow-[0_0_10px_rgba(129,140,248,0.4)]',
  },
  success: {
    fill: 'bg-green-500',
    glow: 'shadow-[0_0_10px_rgba(34,197,94,0.4)]',
  },
  warning: {
    fill: 'bg-amber-500',
    glow: 'shadow-[0_0_10px_rgba(245,158,11,0.4)]',
  },
  error: {
    fill: 'bg-red-500',
    glow: 'shadow-[0_0_10px_rgba(239,68,68,0.4)]',
  },
}

const VARIANT_STROKE: Record<ProgressVariant, string> = {
  default: '#818cf8',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
}

export const Progress = ({
  variant = 'default',
  value,
  max = 100,
  label,
  showValue = true,
  circular = false,
  className = '',
}: ProgressProps) => {
  const [animatedValue, setAnimatedValue] = useState(0)
  const percentage = Math.min(100, Math.max(0, (animatedValue / max) * 100))
  const variantStyles = VARIANT_STYLES[variant]

  // Animate on mount
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 50)
    return () => clearTimeout(timer)
  }, [value])

  // Circular variant
  if (circular) {
    const circumference = 2 * Math.PI * 40
    const offset = circumference - (circumference * percentage) / 100

    return (
      <div className={`flex flex-col items-center ${className}`.trim()}>
        {label && (
          <div className="text-xs tracking-wider text-slate-500 mb-2 font-mono">
            {label}
          </div>
        )}
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="6"
            />
            {/* Progress ring */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={VARIANT_STROKE[variant]}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{
                transition: 'stroke-dashoffset 0.5s ease-out',
                filter: `drop-shadow(0 0 6px ${VARIANT_STROKE[variant]}40)`,
              }}
            />
          </svg>
          {showValue && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-mono text-slate-300">
                {Math.round(percentage)}%
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Linear variant
  return (
    <div className={`flex flex-col ${className}`.trim()}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-xs tracking-wider text-slate-500 font-mono">
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-xs font-mono text-slate-400">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${variantStyles.fill} ${variantStyles.glow}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={animatedValue}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  )
}
