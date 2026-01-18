// VoyagePickerAdapter - Renders voyage selection using primitives
// Maps VoyagePickerProps to List + Text composition
// Handles active (interactive) and resolved (collapsed) states

'use client'

import { Stack, List, Text, Card } from '@/components/ui/primitives'
import type { VoyagePickerProps, ComponentState, ComponentResolution } from '@/lib/ui/components'

interface VoyagePickerAdapterProps extends VoyagePickerProps {
  __state?: ComponentState
  __resolution?: ComponentResolution
}

export const VoyagePickerAdapter = ({
  voyages,
  onSelect,
  __state = 'active',
  __resolution,
}: VoyagePickerAdapterProps) => {
  // Resolved state - show collapsed view
  if (__state === 'resolved' && __resolution) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-500">✓</span>
        <Text variant="body">
          Switched to <span className="text-indigo-400">{__resolution.label}</span>
        </Text>
      </div>
    )
  }

  // Dismissed state - show nothing or minimal hint
  if (__state === 'dismissed') {
    return (
      <Text variant="caption" className="opacity-50">
        [Voyage selection dismissed]
      </Text>
    )
  }

  // Active state - show interactive picker
  if (!voyages.length) {
    return (
      <Text variant="caption">No voyages found</Text>
    )
  }

  return (
    <Card variant="outlined" className="border-purple-500/30 bg-purple-500/5">
      <Stack gap="xs">
        <div className="flex items-center justify-between">
          <Text variant="label" className="text-purple-300">Your voyages</Text>
          <Text variant="caption">[Click to select]</Text>
        </div>
        <List
          variant="plain"
          interactive
          items={voyages.map(v => ({
            id: v.slug,
            content: (
              <span className="flex items-center gap-2">
                {v.name}
              </span>
            ),
            meta: (
              <span className={v.role === 'private' ? 'text-slate-500' : 'text-purple-400'}>
                {v.role}
              </span>
            ),
          }))}
          onItemClick={onSelect}
        />
      </Stack>
    </Card>
  )
}
