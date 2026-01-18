// ActionButtonsAdapter - Renders action buttons inline
// Maps ActionButtonsProps to Inline + Button composition

'use client'

import { Inline, Button } from '@/components/ui/primitives'
import type { ActionButtonsProps } from '@/lib/ui/components'

const VARIANT_MAP = {
  primary: 'primary',
  secondary: 'secondary',
  danger: 'danger',
} as const

export const ActionButtonsAdapter = ({ actions }: ActionButtonsProps) => {
  if (!actions.length) return null

  return (
    <Inline gap="sm" wrap>
      {actions.map(action => (
        <Button
          key={action.id}
          variant={action.variant ? VARIANT_MAP[action.variant] : 'secondary'}
          size="sm"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </Inline>
  )
}
