// Inline primitive - Horizontal arrangement of children
// For buttons, badges, or any horizontal groupings

import { type ReactNode } from 'react'

export type InlineGap = 'xs' | 'sm' | 'md' | 'lg'
export type InlineAlign = 'start' | 'center' | 'end' | 'baseline'
export type InlineJustify = 'start' | 'center' | 'end' | 'between'

export interface InlineProps {
  children: ReactNode
  gap?: InlineGap
  align?: InlineAlign
  justify?: InlineJustify
  wrap?: boolean
  className?: string
}

const GAP_STYLES: Record<InlineGap, string> = {
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-8',
}

const ALIGN_STYLES: Record<InlineAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  baseline: 'items-baseline',
}

const JUSTIFY_STYLES: Record<InlineJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
}

export const Inline = ({
  children,
  gap = 'sm',
  align = 'center',
  justify = 'start',
  wrap = false,
  className = '',
}: InlineProps) => {
  return (
    <div
      className={`flex ${wrap ? 'flex-wrap' : 'flex-nowrap'} ${GAP_STYLES[gap]} ${ALIGN_STYLES[align]} ${JUSTIFY_STYLES[justify]} ${className}`.trim()}
    >
      {children}
    </div>
  )
}
