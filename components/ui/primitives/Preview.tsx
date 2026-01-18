// Preview primitive - Content snippets
// Variants: code (monospace block), text (prose), link (URL preview)
// Code: optional line numbers, language label
// Text: truncated with "Show more" expansion

'use client'

import { type ReactNode, useState } from 'react'

export type PreviewVariant = 'code' | 'text' | 'link'

export interface PreviewProps {
  variant: PreviewVariant
  // Code variant
  code?: string
  language?: string
  showLineNumbers?: boolean
  // Text variant
  text?: string
  maxLines?: number
  // Link variant
  url?: string
  title?: string
  description?: string
  favicon?: ReactNode
  // Common
  className?: string
}

const MAX_HEIGHT = '200px'

export const Preview = ({
  variant,
  code,
  language,
  showLineNumbers = false,
  text,
  maxLines = 5,
  url,
  title,
  description,
  favicon,
  className = '',
}: PreviewProps) => {
  const [expanded, setExpanded] = useState(false)

  // Code variant
  if (variant === 'code' && code) {
    const lines = code.split('\n')

    return (
      <div
        className={`rounded-sm border border-white/10 overflow-hidden ${className}`.trim()}
      >
        {language && (
          <div className="px-3 py-1.5 bg-white/5 border-b border-white/10">
            <span className="text-[10px] tracking-wider uppercase text-slate-500 font-mono">
              {language}
            </span>
          </div>
        )}
        <div
          className="bg-[#0A0A0A] overflow-auto"
          style={{ maxHeight: MAX_HEIGHT }}
        >
          <pre className="p-3 text-xs font-mono text-slate-300 leading-relaxed">
            {showLineNumbers ? (
              <code>
                {lines.map((line, i) => (
                  <div key={i} className="flex">
                    <span className="select-none text-slate-600 w-8 text-right pr-3 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1">{line || ' '}</span>
                  </div>
                ))}
              </code>
            ) : (
              <code>{code}</code>
            )}
          </pre>
        </div>
      </div>
    )
  }

  // Text variant
  if (variant === 'text' && text) {
    const lines = text.split('\n')
    const isLong = lines.length > maxLines
    const displayText = expanded ? text : lines.slice(0, maxLines).join('\n')

    return (
      <div
        className={`rounded-sm border border-white/10 overflow-hidden ${className}`.trim()}
      >
        <div className="p-4 bg-[#0A0A0A]">
          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {displayText}
            {!expanded && isLong && '...'}
          </p>
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors border-t border-white/10 font-mono tracking-wider"
          >
            {expanded ? '── Show less ──' : '── Show more ──'}
          </button>
        )}
      </div>
    )
  }

  // Link variant
  if (variant === 'link' && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block rounded-sm border border-white/10 bg-[#0A0A0A] hover:bg-white/5 transition-colors no-underline ${className}`.trim()}
      >
        <div className="flex items-start gap-3 p-4">
          {favicon && (
            <div className="flex-shrink-0 w-5 h-5 text-slate-500">
              {favicon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            {title && (
              <div className="text-sm font-medium text-slate-300 truncate">
                {title}
              </div>
            )}
            {description && (
              <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                {description}
              </div>
            )}
            <div className="text-[10px] text-slate-600 font-mono mt-2 truncate">
              {url}
            </div>
          </div>
        </div>
      </a>
    )
  }

  return null
}
