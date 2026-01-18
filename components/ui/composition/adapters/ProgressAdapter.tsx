// ProgressAdapter - Renders progress/loading states
// Maps ProgressProps to Progress primitive

'use client'

import { Progress, Text, Stack } from '@/components/ui/primitives'
import type { ProgressProps } from '@/lib/ui/components'

export const ProgressAdapter = ({ message, indeterminate, progress }: ProgressProps) => {
  // Indeterminate state - show pulsing message
  if (indeterminate || progress === undefined) {
    return (
      <Stack gap="xs">
        <Text variant="caption" className="animate-pulse">{message}</Text>
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full w-1/3 bg-indigo-500 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]"
            style={{
              animation: 'indeterminate 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </Stack>
    )
  }

  // Determinate progress
  return (
    <Progress
      value={progress}
      label={message}
      variant="default"
    />
  )
}
