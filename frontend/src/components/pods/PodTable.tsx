import { ArrowDown, ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'

import PodKillButton from '@/components/actions/PodKillButton'
import ProtectedBadge from '@/components/actions/ProtectedBadge'
import type { PodQuery } from '@/lib/api'
import { formatCpu, formatMemory } from '@/lib/format'
import type { Pod } from '@/lib/schemas'
import PodStatusPill from './PodStatusPill'
import RestartBadge from './RestartBadge'
import UptimeCell from './UptimeCell'

type SortKey = NonNullable<PodQuery['sort']>

interface Props {
  pods: Pod[]
  onSelect?: (name: string) => void
  sort: SortKey
  order: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  showService?: boolean
  readOnly?: boolean
}

const HEADERS: { key: SortKey | null; label: string; align?: string }[] = [
  { key: null, label: 'Status' },
  { key: 'name', label: 'Pod' },
  { key: null, label: 'Workload' },
  { key: 'uptime', label: 'Uptime' },
  { key: 'restarts', label: 'Restarts' },
  { key: 'cpu', label: 'CPU used / reserved', align: 'text-right' },
  { key: 'memory', label: 'Memory used / reserved', align: 'text-right' },
  { key: null, label: 'Actions', align: 'text-right' },
]

export default function PodTable({
  pods,
  sort,
  order,
  onSort,
  showService = true,
  onSelect,
  readOnly = true,
}: Props) {
  return (
    // Wide tables scroll inside their own container; the page never scrolls
    // sideways.
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[56rem] border-collapse bg-background text-sm">
        <thead>
          <tr className="border-b border-border bg-card text-left">
            {HEADERS.filter((h) => showService || h.label !== 'Workload').map((header) => (
              <th
                key={header.label}
                className={`px-3 py-2 text-xs font-medium text-muted-foreground ${header.align ?? ''}`}
              >
                {header.key ? (
                  <button
                    type="button"
                    onClick={() => onSort(header.key as SortKey)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {header.label}
                    {sort === header.key &&
                      (order === 'asc' ? (
                        <ArrowUp size={11} aria-hidden />
                      ) : (
                        <ArrowDown size={11} aria-hidden />
                      ))}
                  </button>
                ) : (
                  header.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pods.map((pod) => (
            <tr
              key={pod.name}
              onClick={onSelect ? () => onSelect(pod.name) : undefined}
              className={`border-b border-border last:border-0 hover:bg-muted-subtle ${
                onSelect ? 'cursor-pointer' : ''
              }`}
            >
              <td className="px-3 py-2">
                <PodStatusPill
                  phase={pod.phase}
                  ready={pod.ready}
                  readyContainers={pod.ready_containers}
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs break-all text-foreground">{pod.name}</span>
                  <ProtectedBadge protection={pod.protection} />
                </div>
                {showService && pod.service && (
                  <Link
                    to={`/services/${encodeURIComponent(pod.service)}`}
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    {pod.service}
                  </Link>
                )}
              </td>
              {showService && (
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {pod.workload?.name ?? 'None'}
                </td>
              )}
              <td className="px-3 py-2">
                <UptimeCell seconds={pod.age_seconds} startedAt={pod.start_time} />
              </td>
              <td className="px-3 py-2">
                <RestartBadge count={pod.restart_count} lastRestartAt={pod.last_restart_at} />
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                <span className="text-foreground">{formatCpu(pod.resources.usage.cpu_cores)}</span>
                <span className="text-muted-foreground"> / {formatCpu(pod.resources.requests.cpu_cores)}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                <span className="text-foreground">{formatMemory(pod.resources.usage.memory_bytes)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  / {formatMemory(pod.resources.requests.memory_bytes)}
                </span>
              </td>
              <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <div className="flex justify-end">
                  <PodKillButton
                    name={pod.name}
                    protection={pod.protection}
                    readOnly={readOnly}
                    compact
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
