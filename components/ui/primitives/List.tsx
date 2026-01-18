// List primitive - Collections with plain, numbered, tree variants
// Based on Gemini design, restructured as List wrapper
//
// Variants: plain, numbered, bullets, tree (├─ └─)
// Items have content and optional meta
// Tree variant supports nested children

import { type ReactNode } from 'react'

export type ListVariant = 'plain' | 'numbered' | 'bullets' | 'tree'

export interface ListItem {
  id: string
  content: ReactNode
  meta?: ReactNode    // Right-aligned metadata
  children?: ListItem[]  // Nested items for tree variant
}

export interface ListProps {
  variant?: ListVariant
  items: ListItem[]
  className?: string
  compact?: boolean
  interactive?: boolean
  onItemClick?: (id: string) => void
}

// Tree prefixes using box-drawing characters
const TREE = {
  branch: '├─ ',
  last: '└─ ',
  pipe: '│  ',
  space: '   ',
}

const renderTreeItem = (
  item: ListItem,
  isLast: boolean,
  depth: number,
  prefix: string,
  interactive: boolean,
  onItemClick?: (id: string) => void
): ReactNode => {
  const currentPrefix = prefix + (isLast ? TREE.last : TREE.branch)
  const childPrefix = prefix + (isLast ? TREE.space : TREE.pipe)

  return (
    <div key={item.id}>
      <div
        className={`flex items-center gap-1 py-0.5 ${
          interactive ? 'hover:bg-white/5 cursor-pointer rounded-sm' : ''
        }`}
        onClick={interactive && onItemClick ? () => onItemClick(item.id) : undefined}
      >
        <span className="text-slate-600 select-none whitespace-pre font-mono text-sm">
          {depth > 0 ? currentPrefix : ''}
        </span>
        <span className="text-slate-300 text-sm flex-1">{item.content}</span>
        {item.meta && (
          <span className="text-xs text-slate-500 ml-2">{item.meta}</span>
        )}
      </div>
      {item.children?.map((child, idx) =>
        renderTreeItem(
          child,
          idx === item.children!.length - 1,
          depth + 1,
          depth > 0 ? childPrefix : '',
          interactive,
          onItemClick
        )
      )}
    </div>
  )
}

export const List = ({
  variant = 'plain',
  items,
  className = '',
  compact = false,
  interactive = false,
  onItemClick,
}: ListProps) => {
  const spacing = compact ? 'space-y-0.5' : 'space-y-1'

  // Tree variant with box-drawing
  if (variant === 'tree') {
    return (
      <div className={`font-mono ${className}`.trim()}>
        {items.map((item, idx) =>
          renderTreeItem(item, idx === items.length - 1, 0, '', interactive, onItemClick)
        )}
      </div>
    )
  }

  // Numbered variant
  if (variant === 'numbered') {
    return (
      <ol className={`${spacing} ${className}`.trim()}>
        {items.map((item, idx) => (
          <li
            key={item.id}
            className={`flex items-start gap-2 text-sm ${
              interactive ? 'hover:bg-white/5 cursor-pointer py-1 px-1 -mx-1 rounded-sm' : ''
            }`}
            onClick={interactive && onItemClick ? () => onItemClick(item.id) : undefined}
          >
            <span className="text-slate-500 font-mono w-5 text-right flex-shrink-0">
              {idx + 1}.
            </span>
            <span className="text-slate-300 flex-1">{item.content}</span>
            {item.meta && (
              <span className="text-xs text-slate-500">{item.meta}</span>
            )}
          </li>
        ))}
      </ol>
    )
  }

  // Bullets variant
  if (variant === 'bullets') {
    return (
      <ul className={`${spacing} ${className}`.trim()}>
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-2 text-sm ${
              interactive ? 'hover:bg-white/5 cursor-pointer py-1 px-1 -mx-1 rounded-sm' : ''
            }`}
            onClick={interactive && onItemClick ? () => onItemClick(item.id) : undefined}
          >
            <span className="text-slate-500 font-mono flex-shrink-0">•</span>
            <span className="text-slate-300 flex-1">{item.content}</span>
            {item.meta && (
              <span className="text-xs text-slate-500">{item.meta}</span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  // Plain variant (default)
  return (
    <div className={`${spacing} ${className}`.trim()}>
      {items.map((item) => (
        <div
          key={item.id}
          className={`flex items-center justify-between text-sm ${
            interactive ? 'hover:bg-white/5 cursor-pointer py-1 px-1 -mx-1 rounded-sm' : ''
          }`}
          onClick={interactive && onItemClick ? () => onItemClick(item.id) : undefined}
        >
          <span className="text-slate-300">{item.content}</span>
          {item.meta && (
            <span className="text-xs text-slate-500">{item.meta}</span>
          )}
        </div>
      ))}
    </div>
  )
}
