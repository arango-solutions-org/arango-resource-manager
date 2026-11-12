import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * neutral, good, warn and bad are states (a badge). accent is a tag, what a
 * thing is rather than how it is, so it renders as a static combobox chip.
 */
export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent'

const VARIANT = {
  neutral: 'secondary',
  good: 'success',
  warn: 'warning',
  bad: 'destructive',
} as const

interface Props {
  tone?: Tone
  title?: string
  mono?: boolean
  children: ReactNode
}

export default function StatusBadge({ tone = 'neutral', title, mono, children }: Props) {
  if (tone === 'accent') {
    return (
      <span
        title={title}
        className={cn(
          'inline-flex h-[21px] items-center gap-1 rounded-sm bg-chip px-1.5 text-sm leading-5 text-chip-text',
          mono && 'font-mono text-xs',
        )}
      >
        {children}
      </span>
    )
  }
  return (
    <Badge variant={VARIANT[tone]} title={title} className={cn(mono && 'font-mono')}>
      {children}
    </Badge>
  )
}
