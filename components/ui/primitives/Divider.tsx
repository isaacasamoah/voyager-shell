// Divider primitive - Box-drawing separators
// Based on Gemini design, simplified implementation
//
// Variants: line (────), dashed (╌╌╌), double (════), fade (gradient)
// Orientations: horizontal, vertical
// Optional centered label

export type DividerVariant = 'line' | 'dashed' | 'double' | 'fade'
export type DividerOrientation = 'horizontal' | 'vertical'

export interface DividerProps {
  variant?: DividerVariant
  orientation?: DividerOrientation
  label?: string
  className?: string
  glow?: boolean
}

// Box-drawing characters for terminal aesthetic
const BOX_CHARS: Record<string, string> = {
  line: '─',
  dashed: '╌',
  double: '═',
}

export const Divider = ({
  variant = 'line',
  orientation = 'horizontal',
  label,
  className = '',
  glow = false,
}: DividerProps) => {
  const glowStyles = glow ? 'opacity-60' : 'opacity-40'

  // Vertical divider
  if (orientation === 'vertical') {
    return (
      <div
        className={`w-px bg-white/10 self-stretch ${className}`.trim()}
        role="separator"
        aria-orientation="vertical"
      />
    )
  }

  // Horizontal with centered label
  if (label) {
    return (
      <div
        className={`flex items-center gap-3 ${className}`.trim()}
        role="separator"
        aria-orientation="horizontal"
      >
        <div className={`flex-1 h-px bg-white/10 ${glowStyles}`} />
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-600">
          {label}
        </span>
        <div className={`flex-1 h-px bg-white/10 ${glowStyles}`} />
      </div>
    )
  }

  // Fade variant - gradient
  if (variant === 'fade') {
    return (
      <div
        className={`h-px bg-gradient-to-r from-transparent via-white/10 to-transparent ${className}`.trim()}
        role="separator"
        aria-orientation="horizontal"
      />
    )
  }

  // Box-drawing character divider
  const char = BOX_CHARS[variant] ?? BOX_CHARS.line

  return (
    <div
      className={`font-mono text-xs text-white/20 select-none overflow-hidden whitespace-nowrap ${glowStyles} ${className}`.trim()}
      role="separator"
      aria-orientation="horizontal"
    >
      {char.repeat(80)}
    </div>
  )
}
