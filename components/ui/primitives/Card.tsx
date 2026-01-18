// Card primitive - Universal container with header/footer slots
// Based on Gemini design, refined for terminal aesthetic
//
// Variants: default, elevated, outlined, accent
// Supports header/footer slots, glow, click handler, interactive hover

import { type ReactNode } from 'react'

export type CardVariant =
  | 'default'   // Standard surface bg-white/5
  | 'elevated'  // Raised bg-[#0A0A0A] with shadow
  | 'outlined'  // Border only, transparent
  | 'accent'    // Indigo tint

export interface CardProps {
  variant?: CardVariant
  children: ReactNode
  header?: ReactNode
  footer?: ReactNode
  className?: string
  glow?: boolean
  onClick?: () => void
  interactive?: boolean
}

const VARIANT_STYLES: Record<CardVariant, string> = {
  default: 'bg-white/5 border-white/10',
  elevated: 'bg-[#0A0A0A] border-white/10 shadow-lg',
  outlined: 'bg-transparent border-white/10',
  accent: 'bg-indigo-500/5 border-indigo-500/30',
}

const GLOW_STYLES: Record<CardVariant, string> = {
  default: '',
  elevated: 'shadow-[0_4px_20px_rgba(0,0,0,0.4)]',
  outlined: '',
  accent: 'shadow-[0_0_15px_rgba(99,102,241,0.1)]',
}

export const Card = ({
  variant = 'default',
  children,
  header,
  footer,
  className = '',
  glow = false,
  onClick,
  interactive = false,
}: CardProps) => {
  const baseStyles = 'font-mono rounded-sm border overflow-hidden'
  const variantStyles = VARIANT_STYLES[variant]
  const glowStyles = glow ? GLOW_STYLES[variant] : ''
  const interactiveStyles = interactive || onClick
    ? 'cursor-pointer transition-colors hover:bg-white/[0.07]'
    : ''

  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      className={`${baseStyles} ${variantStyles} ${glowStyles} ${interactiveStyles} ${className}`.trim()}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {header && (
        <div className="px-3 py-2 border-b border-white/5 text-xs font-bold text-slate-400">
          {header}
        </div>
      )}
      <div className="p-3">
        {children}
      </div>
      {footer && (
        <div className="px-3 py-2 border-t border-white/5">
          {footer}
        </div>
      )}
    </Component>
  )
}

// Convenience sub-components for structured card content
export const CardHeader = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`flex items-center justify-between mb-2 ${className}`.trim()}>
    {children}
  </div>
)

export const CardContent = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`text-sm text-slate-300 ${className}`.trim()}>
    {children}
  </div>
)

export const CardActions = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`flex items-center gap-2 mt-3 ${className}`.trim()}>
    {children}
  </div>
)
