import { useQuery } from '@tanstack/react-query'

import EmptyState from '@/components/common/EmptyState'
import ErrorPanel from '@/components/common/ErrorPanel'
import StatusBadge, { type Tone } from '@/components/common/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchHistory } from '@/lib/api'
import type { ActionRecord } from '@/lib/schemas'

const LABELS: Record<string, string> = {
  scale: 'Scaled',
  stop: 'Stopped',
  restore: 'Restored',
  restart: 'Restarted',
  delete_pod: 'Deleted pod',
  kill: 'Killed',
  kill_service: 'Killed service',
  database_scale: 'Resized database',
}

/** ok and error are outcomes; pending means the process stopped mid-action. */
const RESULT: Record<string, { tone: Tone; label?: string }> = {
  ok: { tone: 'good' },
  error: { tone: 'bad', label: 'Failed' },
  pending: { tone: 'warn', label: 'Unfinished' },
}

export default function Activity() {
  const { data, error, isPending } = useQuery({
    queryKey: ['actions', 'history'],
    queryFn: () => fetchHistory(100),
    refetchInterval: 15_000,
  })

  if (isPending) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading activity">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  if (error) return <ErrorPanel title="Could not read the activity log" error={error} />

  if (data.length === 0) {
    return (
      <EmptyState
        title="No changes yet"
        hint="Every change made here is recorded with who made it and why."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Workload</TableHead>
            <TableHead className="text-right">Replicas</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry, index) => (
            <Row key={`${entry.ts}-${index}`} entry={entry} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Row({ entry }: { entry: ActionRecord }) {
  const result = RESULT[entry.result] ?? RESULT.ok
  const label = LABELS[entry.action] ?? entry.action
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
        <time dateTime={entry.ts}>{new Date(entry.ts).toLocaleString()}</time>
      </TableCell>
      <TableCell>
        <StatusBadge tone={result.tone}>
          {result.label ? `${label}: ${result.label.toLowerCase()}` : label}
        </StatusBadge>
      </TableCell>
      <TableCell className="font-mono text-xs">
        {entry.name}
        {entry.detail && (
          <p className="mt-1 font-sans text-sm whitespace-normal text-destructive-text">
            {entry.detail}
          </p>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-xs tabular-nums">
        {entry.from_replicas !== null && entry.to_replicas !== null
          ? `${entry.from_replicas} → ${entry.to_replicas}`
          : ''}
      </TableCell>
      <TableCell className="whitespace-nowrap">{entry.actor ?? 'Unknown'}</TableCell>
      <TableCell className="max-w-md whitespace-normal">{entry.reason ?? ''}</TableCell>
    </TableRow>
  )
}
