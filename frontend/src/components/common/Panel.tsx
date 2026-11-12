import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  className?: string
}

/** A card surface. Padding is the caller's, since panels hold tables as well as text. */
export default function Panel({ children, className }: Props) {
  return (
    <section
      className={cn('rounded-xl border border-card-border bg-card text-card-foreground', className)}
    >
      {children}
    </section>
  )
}
