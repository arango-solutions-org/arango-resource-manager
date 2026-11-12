import { RotateCcw } from 'lucide-react'

import StatusBadge from '@/components/common/StatusBadge'
import { isRecent } from '@/lib/uptime'

interface Props {
  count: number
  lastRestartAt: string | null
}

export default function RestartBadge({ count, lastRestartAt }: Props) {
  if (count === 0) return <span className="text-xs text-muted-foreground">0</span>

  const recent = isRecent(lastRestartAt)
  return (
    <StatusBadge
      tone={recent ? 'warn' : 'neutral'}
      title={
        lastRestartAt
          ? `Last restart ${lastRestartAt}${recent ? ' (within the last hour)' : ''}`
          : undefined
      }
    >
      <RotateCcw size={11} aria-hidden />
      {count}
    </StatusBadge>
  )
}
