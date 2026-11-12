interface Props {
  label: string
  value: number | null
  total: number | null
  format: (value: number | null) => string
}

/** Reserved against budget. Used on the overview tile that pairs CPU and memory. */
export default function DualBar({ label, value, total, format }: Props) {
  const ratio = value !== null && total ? Math.min(1, value / total) : 0
  const pct = Math.round(ratio * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">
          {format(value)} / {format(total)}
          <span className="ml-1 text-muted-foreground">{total ? `${pct}%` : ''}</span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${format(value)} of ${format(total)}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
