// Stack primitive - Vertical arrangement with consistent spacing
// Gap sizes: xs, sm, md, lg
// Optional dividers between items

import { type ReactNode, Children, isValidElement } from 'react'

export type StackGap = 'xs' | 'sm' | 'md' | 'lg'
export type StackAlign = 'start' | 'center' | 'end' | 'stretch'
export type StackJustify = 'start' | 'center' | 'end' | 'between'

export interface StackProps {
  children: ReactNode
  gap?: StackGap
  align?: StackAlign
  justify?: StackJustify
  dividers?: boolean
  className?: string
}

const GAP_STYLES: Record<StackGap, string> = {
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
}

const ALIGN_STYLES: Record<StackAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
}

const JUSTIFY_STYLES: Record<StackJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
}

export const Stack = ({
  children,
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  dividers = false,
  className = '',
}: StackProps) => {
  const childArray = Children.toArray(children).filter(isValidElement)

  if (!dividers) {
    return (
      <div
        className={`flex flex-col ${GAP_STYLES[gap]} ${ALIGN_STYLES[align]} ${JUSTIFY_STYLES[justify]} ${className}`.trim()}
      >
        {children}
      </div>
    )
  }

  // With dividers - render separator lines between items
  return (
    <div
      className={`flex flex-col ${GAP_STYLES[gap]} ${ALIGN_STYLES[align]} ${JUSTIFY_STYLES[justify]} ${className}`.trim()}
    >
      {childArray.map((child, index) => (
        <div key={index}>
          {child}
          {index < childArray.length - 1 && (
            <div className="border-b border-white/10 mt-4" />
          )}
        </div>
      ))}
    </div>
  )
}
