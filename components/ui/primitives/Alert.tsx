// Alert primitive - Attention-grabbing notices
// Variants: info (indigo), success (green), warning (amber), error (red)
// Dismissible with X button, icon slot, action buttons

'use client'

import { type ReactNode, useState } from 'react'

export type AlertVariant = 'info' | 'success' | 'warning' | 'error'

export interface AlertProps {
  variant?: AlertVariant
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  className?: string
}

const VARIANT_STYLES: Record<AlertVariant, { border: string; bg: string; icon: string }> = {
  info: {
    border: 'border-l-indigo-500',
    bg: 'bg-indigo-500/5',
    icon: 'text-indigo-400',
  },
  success: {
    border: 'border-l-green-500',
    bg: 'bg-green-500/5',
    icon: 'text-green-400',
  },
  warning: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-500/5',
    icon: 'text-amber-400',
  },
  error: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/5',
    icon: 'text-red-400',
  },
}

export const Alert = ({
  variant = 'info',
  title,
  description,
  icon,
  actions,
  dismissible = false,
  onDismiss,
  className = '',
}: AlertProps) => {
  const [isVisible, setIsVisible] = useState(true)
  const styles = VARIANT_STYLES[variant]

  if (!isVisible) return null

  const handleDismiss = () => {
    setIsVisible(false)
    onDismiss?.()
  }

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-sm border border-white/10 border-l-4 ${styles.border} ${styles.bg} ${className}`.trim()}
      role="alert"
    >
      {/* Icon */}
      {icon && (
        <div className={`flex-shrink-0 w-5 h-5 ${styles.icon}`}>
          {icon}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-300 font-mono">
          {title}
        </div>
        {description && (
          <div className="text-xs text-slate-500 mt-1">
            {description}
          </div>
        )}
        {actions && (
          <div className="flex items-center gap-2 mt-3">
            {actions}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors p-1 -m-1"
          aria-label="Dismiss"
        >
          <span className="text-lg leading-none">×</span>
        </button>
      )}
    </div>
  )
}
