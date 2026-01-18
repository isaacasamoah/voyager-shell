// Text primitive - Typography variants for Voyager TUI
// Based on Gemini design, refined for terminal aesthetic
//
// Variants: heading, subheading, body, caption, code, label, accent
// Supports semantic HTML elements via `as` prop

import { type ReactNode, type ElementType } from 'react'

export type TextVariant =
  | 'heading'    // Large, bold, slate-200
  | 'subheading' // Medium, semibold, slate-300
  | 'body'       // Default content, slate-300
  | 'caption'    // Small meta text, slate-500
  | 'code'       // Inline code, indigo tint
  | 'label'      // Uppercase tracking, tiny
  | 'accent'     // Indigo accent text

export interface TextProps {
  variant?: TextVariant
  children: ReactNode
  className?: string
  as?: ElementType
  glow?: boolean
}

const VARIANT_STYLES: Record<TextVariant, string> = {
  heading: 'text-2xl font-bold tracking-wider text-slate-200',
  subheading: 'text-xl font-semibold tracking-wider text-slate-300',
  body: 'text-sm text-slate-300',
  caption: 'text-xs text-slate-500',
  code: 'text-sm bg-[#0A0A0A] rounded px-1.5 py-0.5 text-green-500',
  label: 'text-xs tracking-wider uppercase text-slate-500',
  accent: 'text-sm text-indigo-400',
}

// Glow colors match variant semantics
const GLOW_STYLES: Partial<Record<TextVariant, string>> = {
  heading: 'drop-shadow-[0_0_8px_rgba(203,213,225,0.2)]',
  code: 'shadow-[0_0_10px_rgba(34,197,94,0.3)]',
  accent: 'drop-shadow-[0_0_6px_rgba(129,140,248,0.4)]',
}

export const Text = ({
  variant = 'body',
  children,
  className = '',
  as: Component = 'span',
  glow = false,
}: TextProps) => {
  const baseStyles = 'font-mono'
  const variantStyles = VARIANT_STYLES[variant]
  const glowStyles = glow ? (GLOW_STYLES[variant] ?? '') : ''

  return (
    <Component className={`${baseStyles} ${variantStyles} ${glowStyles} ${className}`.trim()}>
      {children}
    </Component>
  )
}
