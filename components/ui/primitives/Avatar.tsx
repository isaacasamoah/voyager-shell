// Avatar primitive - User/entity representation
// Variants: user, system, voyage
// Sizes: xs, sm, md, lg
// Optional status indicator dot

import { type ReactNode } from 'react'

export type AvatarVariant = 'user' | 'system' | 'voyage'
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'
export type AvatarStatus = 'online' | 'offline' | 'busy'

export interface AvatarProps {
  variant?: AvatarVariant
  size?: AvatarSize
  initials?: string
  icon?: ReactNode
  status?: AvatarStatus
  className?: string
}

const SIZE_STYLES: Record<AvatarSize, { container: string; text: string; status: string }> = {
  xs: { container: 'w-4 h-4', text: 'text-[8px]', status: 'w-1.5 h-1.5' },
  sm: { container: 'w-6 h-6', text: 'text-[10px]', status: 'w-2 h-2' },
  md: { container: 'w-8 h-8', text: 'text-xs', status: 'w-2.5 h-2.5' },
  lg: { container: 'w-12 h-12', text: 'text-sm', status: 'w-3 h-3' },
}

const VARIANT_STYLES: Record<AvatarVariant, { border: string; glow: string }> = {
  user: {
    border: 'border-slate-500/50',
    glow: 'hover:shadow-[0_0_8px_rgba(100,116,139,0.3)]',
  },
  system: {
    border: 'border-indigo-500/50',
    glow: 'hover:shadow-[0_0_8px_rgba(129,140,248,0.3)]',
  },
  voyage: {
    border: 'border-purple-500/50',
    glow: 'hover:shadow-[0_0_8px_rgba(168,85,247,0.3)]',
  },
}

const STATUS_STYLES: Record<AvatarStatus, string> = {
  online: 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]',
  offline: 'bg-slate-500',
  busy: 'bg-amber-500 animate-pulse',
}

export const Avatar = ({
  variant = 'user',
  size = 'md',
  initials,
  icon,
  status,
  className = '',
}: AvatarProps) => {
  const sizeStyles = SIZE_STYLES[size]
  const variantStyles = VARIANT_STYLES[variant]

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full border-2 bg-[#0A0A0A] font-mono uppercase tracking-wider transition-shadow ${sizeStyles.container} ${sizeStyles.text} ${variantStyles.border} ${variantStyles.glow} text-slate-300 hover:bg-white/5 ${className}`.trim()}
    >
      {initials ? (
        <span className="select-none">{initials.slice(0, 2)}</span>
      ) : icon ? (
        <span className="flex items-center justify-center">{icon}</span>
      ) : (
        <span className="text-slate-500">?</span>
      )}

      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border border-[#050505] ${sizeStyles.status} ${STATUS_STYLES[status]}`}
          title={status}
        />
      )}
    </div>
  )
}
