import { whatItIs, whenText } from '@/lib/about'
import type { WorkloadAbout } from '@/lib/schemas'

/** Two short lines under a workload name: what it is, and when it was installed and last used. */
export default function AboutLine({ about }: { about: WorkloadAbout | undefined }) {
  if (!about) return null
  const what = whatItIs(about)
  const when = whenText(about)
  if (!what && !when) return null
  return (
    <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
      {what && <p className="break-words">{what}</p>}
      {when && <p>{when}</p>}
    </div>
  )
}
