// Button primitive - Actions with terminal aesthetic
// Based on Gemini design, refined with transparent tints
//
// Variants: primary, secondary, ghost, danger
// Sizes: sm, md, lg
// Supports loading state, icon slot, keyboard hint

import { type ReactNode, type ButtonHTMLAttributes } from 'react'

export type ButtonVariant =
  | 'primary'    // Indigo, main actions
  | 'secondary'  // Subtle, less emphasis
  | 'ghost'      // Minimal, text-only feel
  | 'danger'     // Red, destructive

export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
  loading?: boolean
  icon?: ReactNode
  kbd?: string  // Keyboard hint like "ESC" or "Enter"
}

// Use transparent tints per VoyagerInterface
const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 hover:border-indigo-400/40',
  secondary: 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-slate-200',
  ghost: 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5',
  danger: 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-400/40',
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-xs gap-1.5',
  lg: 'px-4 py-2 text-sm gap-2',
}

export const Button = ({
  variant = 'secondary',
  size = 'md',
  children,
  loading = false,
  disabled,
  icon,
  kbd,
  className = '',
  ...props
}: ButtonProps) => {
  const baseStyles = 'inline-flex items-center justify-center font-mono font-semibold rounded-sm border transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500/50'
  const variantStyles = VARIANT_STYLES[variant]
  const sizeStyles = SIZE_STYLES[size]
  const disabledStyles = disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'

  return (
    <button
      className={`${baseStyles} ${variantStyles} ${sizeStyles} ${disabledStyles} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="animate-pulse">...</span>
      ) : (
        <>
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {children}
          {kbd && (
            <span className="text-[10px] opacity-50 ml-1">[{kbd}]</span>
          )}
        </>
      )}
    </button>
  )
}
