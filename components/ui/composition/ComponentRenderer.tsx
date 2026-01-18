// ComponentRenderer - Dispatches InlineComponent to React adapters
// The bridge between Voyager's component instructions and React primitives

'use client'

import { type InlineComponent } from '@/lib/ui/components'
import { adapters } from './adapters'

export interface ComponentRendererProps {
  component: InlineComponent
  onAction?: (action: string, data?: unknown) => void
}

export const ComponentRenderer = ({ component, onAction }: ComponentRendererProps) => {
  const Adapter = adapters[component.type]

  if (!Adapter) {
    // Unknown component type - fail silently in production
    if (process.env.NODE_ENV === 'development') {
      console.warn(`ComponentRenderer: Unknown component type "${component.type}"`)
    }
    return null
  }

  // Pass component state and resolution to adapter alongside props
  const adapterProps = {
    ...component.props,
    __state: component.state,
    __resolution: component.resolution,
    onAction,
  }

  return (
    <div
      data-component-id={component.id}
      data-ephemeral={component.ephemeral}
      data-state={component.state}
    >
      <Adapter {...adapterProps} />
    </div>
  )
}
