import { useQuery } from '@tanstack/react-query'
import { Pause, Play, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchServiceLogs } from '@/lib/api'
import { appendNew, clockTime, matches, shortPod } from '@/lib/logs'
import type { LogLine, Pod } from '@/lib/schemas'

const ALL = '__all__'
const FOLLOW_EVERY_MS = 3000
/** Each follow poll looks this far back, so a slow poll never leaves a gap. */
const FOLLOW_WINDOW_SECONDS = 15
const TAIL_OPTIONS = [100, 500, 2000]

interface Props {
  service: string
  pods: Pod[]
}

/**
 * Every container of a service in one timeline, like `k9s` on a deployment.
 *
 * Opens on the last lines of each container, merged by time. Follow polls the
 * last few seconds and appends what is new, so the view keeps up without a
 * held-open stream through the platform proxy.
 */
export default function LogViewer({ service, pods }: Props) {
  const [workload, setWorkload] = useState(ALL)
  const [container, setContainer] = useState(ALL)
  const [tail, setTail] = useState(TAIL_OPTIONS[0])
  const [filter, setFilter] = useState('')
  const [following, setFollowing] = useState(false)
  const [lines, setLines] = useState<LogLine[]>([])
  const [followError, setFollowError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const filterId = useId()

  const workloads = useMemo(
    () => [...new Set(pods.map((p) => p.workload?.name).filter(Boolean) as string[])].sort(),
    [pods],
  )
  const containers = useMemo(
    () =>
      [
        ...new Set(
          pods
            .filter((p) => workload === ALL || p.workload?.name === workload)
            .flatMap((p) => p.containers),
        ),
      ].sort(),
    [pods, workload],
  )
  const podWorkload = useMemo(
    () => new Map(pods.map((p) => [p.name, p.workload?.name ?? null])),
    [pods],
  )

  const query = {
    workload: workload === ALL ? undefined : workload,
    container: container === ALL ? undefined : container,
  }

  const initial = useQuery({
    queryKey: ['services', service, 'logs', query.workload, query.container, tail],
    queryFn: () => fetchServiceLogs(service, { ...query, tailLines: tail }),
    retry: false,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (initial.data) setLines(initial.data.lines)
  }, [initial.data])

  useEffect(() => {
    if (!following) return
    let cancelled = false
    const timer = window.setInterval(() => {
      fetchServiceLogs(service, {
        ...query,
        tailLines: 2000,
        sinceSeconds: FOLLOW_WINDOW_SECONDS,
      })
        .then((result) => {
          if (cancelled) return
          setFollowError(null)
          setLines((current) => appendNew(current, result.lines))
        })
        .catch((err: unknown) => {
          if (!cancelled) setFollowError(err instanceof Error ? err.message : String(err))
        })
    }, FOLLOW_EVERY_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // query is rebuilt every render from workload and container.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, service, workload, container])

  // Stay at the bottom while new lines arrive, unless the reader scrolled up.
  useEffect(() => {
    const element = scroller.current
    if (element && pinned.current) element.scrollTop = element.scrollHeight
  }, [lines])

  const shown = lines.filter((line) => matches(line, filter))
  const errors = initial.data?.errors ?? []

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Picker
          label="Workload"
          value={workload}
          onChange={(value) => {
            setWorkload(value)
            setContainer(ALL)
          }}
          options={workloads}
          allLabel="All workloads"
        />
        <Picker
          label="Container"
          value={container}
          onChange={setContainer}
          options={containers}
          allLabel="All containers"
        />
        <Picker
          label="Lines"
          value={String(tail)}
          onChange={(value) => setTail(Number(value))}
          options={TAIL_OPTIONS.map(String)}
          suffix="per container"
        />
        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor={filterId}>Filter</Label>
          <Input
            id={filterId}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="error"
            spellCheck={false}
            className="font-mono"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => initial.refetch()}
          disabled={initial.isFetching}
          aria-label="Reload"
        >
          <RefreshCw className={initial.isFetching ? 'animate-spin' : undefined} />
        </Button>
        <Button
          variant={following ? 'secondary' : 'default'}
          onClick={() => setFollowing((value) => !value)}
        >
          {following ? <Pause /> : <Play />}
          {following ? 'Pause' : 'Follow'}
        </Button>
      </div>

      {initial.error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Could not read the logs</AlertTitle>
          <AlertDescription>{(initial.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {(errors.length > 0 || initial.data?.truncated || followError) && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Some containers are missing from this view</AlertTitle>
          <AlertDescription>
            <ul className="space-y-0.5">
              {initial.data?.truncated && (
                <li>
                  Read the first {initial.data.sources} containers only. Pick a workload or
                  container.
                </li>
              )}
              {errors.map((e) => (
                <li key={`${e.pod}/${e.container}`}>
                  <span className="font-mono">
                    {shortPod(e.pod, podWorkload.get(e.pod))}/{e.container}
                  </span>
                  : {e.detail}
                </li>
              ))}
              {followError && <li>Follow failed: {followError}</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {initial.isPending ? (
        <div className="space-y-1.5" role="status" aria-label="Loading logs">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : (
        <div
          ref={scroller}
          onScroll={(event) => {
            const el = event.currentTarget
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="h-[32rem] overflow-auto rounded-lg border border-border bg-card p-3 font-mono text-xs leading-relaxed"
          role="log"
          aria-live={following ? 'polite' : 'off'}
          aria-label={`Logs for ${service}`}
        >
          {shown.length === 0 ? (
            <p className="text-muted-foreground">
              {lines.length === 0 ? 'No log lines.' : 'No lines match the filter.'}
            </p>
          ) : (
            shown.map((line, index) => (
              <div
                key={`${line.pod}/${line.container}/${line.ts}/${index}`}
                className="flex gap-3 whitespace-pre-wrap break-all"
              >
                <time dateTime={line.ts ?? undefined} className="shrink-0 text-muted-foreground">
                  {clockTime(line.ts)}
                </time>
                <span
                  className="w-44 shrink-0 truncate text-muted-foreground"
                  title={`${line.pod}/${line.container}`}
                >
                  {shortPod(line.pod, podWorkload.get(line.pod))}/{line.container}
                </span>
                <span className="min-w-0 flex-1 text-foreground">{line.text}</span>
              </div>
            ))
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {shown.length} of {lines.length} lines
        {following && ', following'}
      </p>
    </div>
  )
}

function Picker({
  label,
  value,
  onChange,
  options,
  allLabel,
  suffix,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  allLabel?: string
  suffix?: string
}) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-w-36 font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option} value={option} className="font-mono">
              {option}
              {suffix && <span className="text-muted-foreground"> {suffix}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
