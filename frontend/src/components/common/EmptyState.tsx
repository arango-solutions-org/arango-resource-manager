interface Props {
  title: string
  hint?: string
}

export default function EmptyState({ title, hint }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}
