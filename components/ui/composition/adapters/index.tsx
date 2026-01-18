// Adapter registry - Maps component types to React adapters
// Add new adapters here as they're built

import type { ComponentType } from '@/lib/ui/components'
import type { FC } from 'react'

import { VoyagePickerAdapter } from './VoyagePickerAdapter'
import { ActionButtonsAdapter } from './ActionButtonsAdapter'
import { ProgressAdapter } from './ProgressAdapter'

// Placeholder for unimplemented adapters
const NotImplementedAdapter: FC<{ type?: string }> = ({ type }) => {
  if (process.env.NODE_ENV === 'development') {
    return (
      <div className="text-xs text-amber-500/70 font-mono p-2 border border-amber-500/20 rounded-sm bg-amber-500/5">
        [Component: {type ?? 'unknown'} - adapter not implemented]
      </div>
    )
  }
  return null
}

// Adapter type - accepts any props, specific adapters narrow internally
type AnyAdapter = FC<Record<string, unknown>>

// Registry of all component adapters
export const adapters: Record<ComponentType, AnyAdapter> = {
  voyage_picker: VoyagePickerAdapter as unknown as AnyAdapter,
  conversation_picker: () => <NotImplementedAdapter type="conversation_picker" />,
  create_voyage_form: () => <NotImplementedAdapter type="create_voyage_form" />,
  invite_card: () => <NotImplementedAdapter type="invite_card" />,
  confirmation: () => <NotImplementedAdapter type="confirmation" />,
  action_buttons: ActionButtonsAdapter as unknown as AnyAdapter,
  progress: ProgressAdapter as unknown as AnyAdapter,
  auth_prompt: () => <NotImplementedAdapter type="auth_prompt" />,
}

// Re-export individual adapters for direct use
export { VoyagePickerAdapter } from './VoyagePickerAdapter'
export { ActionButtonsAdapter } from './ActionButtonsAdapter'
export { ProgressAdapter } from './ProgressAdapter'
