// Grid primitive - CSS grid for dashboard layouts
// Cols: 1-4 or auto-fit with minChildWidth
// Responsive by default

import { type ReactNode } from 'react'

export type GridCols = 1 | 2 | 3 | 4 | 'auto'
export type GridGap = 'xs' | 'sm' | 'md' | 'lg'

export interface GridProps {
  children: ReactNode
  cols?: GridCols
  gap?: GridGap
  minChildWidth?: string  // e.g., '200px', '16rem'
  className?: string
}

const GAP_STYLES: Record<GridGap, string> = {
  xs: 'gap-2',
  sm: 'gap-3',
  md: 'gap-4',
  lg: 'gap-6',
}

const COLS_STYLES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
}

export const Grid = ({
  children,
  cols = 1,
  gap = 'md',
  minChildWidth = '200px',
  className = '',
}: GridProps) => {
  // Auto-fit: use inline style for repeat(auto-fit, minmax(...))
  if (cols === 'auto') {
    return (
      <div
        className={`grid w-full ${GAP_STYLES[gap]} ${className}`.trim()}
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(${minChildWidth}, 1fr))`,
        }}
      >
        {children}
      </div>
    )
  }

  // Fixed columns
  return (
    <div
      className={`grid w-full ${COLS_STYLES[cols]} ${GAP_STYLES[gap]} ${className}`.trim()}
    >
      {children}
    </div>
  )
}
