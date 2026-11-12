import type { ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  /** The tooltip text. When empty, the child renders bare. */
  label?: string
  side?: 'top' | 'bottom'
  children: ReactNode
}

/**
 * A tooltip that also works over a disabled control. A browser fires no pointer
 * events on a disabled button, and those buttons carry their explanation
 * ("read-only mode is on") exactly when disabled, so the trigger is a wrapping
 * span, which still gets hover and focus.
 */
export default function Hint({ label, side = 'top', children }: Props) {
  if (!label) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
