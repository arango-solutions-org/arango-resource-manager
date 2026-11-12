import { Spinner } from '@/components/ui/spinner'

export default function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Spinner />
      {label}
    </p>
  )
}
