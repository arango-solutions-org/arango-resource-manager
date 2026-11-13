import type { LogLine } from '@/lib/schemas'

/** The viewer keeps at most this many lines; older ones fall off the top. */
export const MAX_LINES = 5000

function streamKey(line: LogLine): string {
  return `${line.pod}/${line.container}`
}

/**
 * Fold a follow poll into what is already shown.
 *
 * Each poll asks for the last few seconds, so it overlaps the previous one.
 * A line is new when it is later than the last line already held from the
 * same container. Kubelet timestamps carry nanoseconds, so two lines from one
 * container rarely share one.
 */
export function appendNew(current: LogLine[], incoming: LogLine[]): LogLine[] {
  const latest = new Map<string, string>()
  for (const line of current) {
    if (line.ts) latest.set(streamKey(line), line.ts)
  }
  const fresh = incoming.filter((line) => {
    const seen = latest.get(streamKey(line))
    return line.ts !== null && (seen === undefined || line.ts > seen)
  })
  if (fresh.length === 0) return current
  const merged = [...current, ...fresh].sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''))
  return merged.slice(-MAX_LINES)
}

/** "arangodb-file-parser-worker-pdf-64467d8d48-7txlk" under its workload reads "64467d8d48-7txlk". */
export function shortPod(pod: string, workload: string | null | undefined): string {
  if (workload && pod.startsWith(`${workload}-`)) return pod.slice(workload.length + 1)
  return pod
}

/** Local wall-clock time, to the second. */
export function clockTime(ts: string | null): string {
  if (!ts) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour12: false })
}

export function matches(line: LogLine, filter: string): boolean {
  if (!filter) return true
  return line.text.toLowerCase().includes(filter.toLowerCase())
}
