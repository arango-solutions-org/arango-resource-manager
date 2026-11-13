import { formatUptime } from '@/lib/uptime'

/** Below this the peaks may have missed a daily job. Matches the backend. */
export const MIN_HISTORY_SECONDS = 24 * 3600

/** How long peaks have been watched, and a warning when that is too short to trust. */
export default function PeakNote({ watchedSeconds }: { watchedSeconds: number }) {
  const watched = formatUptime(Math.floor(watchedSeconds))
  if (watchedSeconds >= MIN_HISTORY_SECONDS) {
    return <span className="text-muted-foreground">Measured against peak use over {watched}.</span>
  }
  return (
    <span className="text-warning-text">
      Peak use watched for {watched} only. A job that runs daily or weekly may not have run yet, so
      these figures can be too high.
    </span>
  )
}
