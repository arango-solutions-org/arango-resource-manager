import type { ReactNode } from 'react'

interface Props {
  label: string
  value: string
  unit?: string
  sub?: string
  footer?: ReactNode
  children?: ReactNode
  tone?: 'default' | 'attention'
}

export default function StatTile({
  label,
  value,
  unit,
  sub,
  footer,
  children,
  tone = 'default',
}: Props) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === 'attention' ? 'border-warning-ring bg-warning-subtle' : 'border-border bg-card'
      }`}
    >
      <h3 className="text-xs text-muted-foreground">{label}</h3>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-2xl leading-none text-foreground">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      {children && <div className="mt-3">{children}</div>}
      {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
    </div>
  )
}
