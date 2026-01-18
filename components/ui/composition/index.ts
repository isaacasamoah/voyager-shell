// UI Composition Layer
// Bridges Voyager's component instructions → React primitives
//
// Usage:
//   import { ComponentRenderer } from '@/components/ui/composition'
//   <ComponentRenderer component={inlineComponent} onAction={handleAction} />

export { ComponentRenderer } from './ComponentRenderer'
export type { ComponentRendererProps } from './ComponentRenderer'

// Individual adapters for direct composition
export {
  adapters,
  VoyagePickerAdapter,
  ActionButtonsAdapter,
  ProgressAdapter,
} from './adapters'
