// Badge primitive - Status indicators and metadata labels
// Based on Gemini design, refined with transparent tints per VoyagerInterface
//
// Variants: default, info, success, warning, error, voyage
// Sizes: sm, md
// Optional icon slot and glow

import { type ReactNode } from 'react'

export type BadgeVariant =
  | 'default'   // Slate, neutral
  | 'info'      // Indigo, system
  | 'success'   // Green, positive
  | 'warning'   // Amber, attention
  | 'error'     // Red, failure
  | 'voyage'    // Purple, voyage/team context

export type BadgeSize = 'sm' | 'md'

export interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  children: ReactNode
  className?: string
  glow?: boolean
  icon?: ReactNode
}

// Use transparent tints like VoyagerInterface patterns
const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-slate-800/50 border-slate-700 text-slate-400',
  info: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
  success: 'bg-green-500/10 border-green-500/30 text-green-400',
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  error: 'bg-red-500/10 border-red-500/30 text-red-400',
  voyage: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
}

// Glow matches variant color
const GLOW_STYLES: Record<BadgeVariant, string> = {
  default: '',
  info: 'shadow-[0_0_10px_rgba(99,102,241,0.15)]',
  success: 'shadow-[0_0_10px_rgba(34,197,94,0.15)]',
  warning: 'shadow-[0_0_10px_rgba(245,158,11,0.15)]',
  error: 'shadow-[0_0_10px_rgba(239,68,68,0.15)]',
  voyage: 'shadow-[0_0_10px_rgba(168,85,247,0.15)]',
}

const SIZE_STYLES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-1 text-xs',
}

export const Badge = ({
  variant = 'default',
  size = 'md',
  children,
  className = '',
  glow = false,
  icon,
}: BadgeProps) => {
  const baseStyles = 'inline-flex items-center gap-1.5 font-mono font-semibold tracking-wider rounded-sm border'
  const variantStyles = VARIANT_STYLES[variant]
  const sizeStyles = SIZE_STYLES[size]
  const glowStyles = glow ? GLOW_STYLES[variant] : ''

  return (
    <span className={`${baseStyles} ${variantStyles} ${sizeStyles} ${glowStyles} ${className}`.trim()}>
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  )
}
