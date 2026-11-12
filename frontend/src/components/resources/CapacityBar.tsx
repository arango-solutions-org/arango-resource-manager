interface Props {
  used: number | null
  reserved: number | null
  limit: number | null
  budget: number | null
  format: (value: number | null) => string
  label: string
}

/**
 * One bar, reused at every scope: namespace, service, workload, pod.
 *
 * Dark teal (chart-5) for what is actually used, lime (chart-2) for what is
 * reserved around it, and a tick where the burst limit sits. The whole point
 * is that the gap between the two is the waste.
 *
 * Never colour-only: the same numbers appear in the caption beneath and in the
 * aria-label.
 */
export default function CapacityBar({ used, reserved, limit, budget, format, label }: Props) {
  // The track is whatever is largest, so nothing is ever drawn off the end.
  const track = Math.max(budget ?? 0, reserved ?? 0, limit ?? 0, used ?? 0) || 1
  const pct = (value: number | null) => (value === null ? 0 : Math.min(100, (value / track) * 100))

  const overBudget = budget !== null && limit !== null && limit > budget

  const caption = [
    `${format(used)} used`,
    `${format(reserved)} reserved`,
    `${format(limit)} limit`,
    budget !== null ? `${format(budget)} budget` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${caption}`}
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="absolute inset-y-0 left-0 bg-chart-2"
          style={{ width: `${pct(reserved)}%` }}
        />
        <div className="absolute inset-y-0 left-0 bg-chart-5" style={{ width: `${pct(used)}%` }} />
        {limit !== null && (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: `calc(${pct(limit)}% - 1px)` }}
            title={`limit ${format(limit)}`}
          />
        )}
      </div>

      <p className="mt-1 font-mono text-xs text-muted-foreground">{caption}</p>
      {overBudget && (
        // Its own line: wrapped mid-caption on a narrow tile it read as part of
        // the numbers rather than as a remark about them.
        <p className="font-mono text-xs text-warning-text" title="Limits exceed the budget">
          ▸ limits exceed the budget
        </p>
      )}
    </div>
  )
}
