import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import ProtectedBadge from '@/components/actions/ProtectedBadge'
import RestoreBanner from '@/components/actions/RestoreBanner'
import ServiceActions from '@/components/actions/ServiceActions'
import WorkloadActions from '@/components/actions/WorkloadActions'
import EventFeed from '@/components/events/EventFeed'
import ServiceProject, { useServiceProject } from '@/components/genai/ServiceProject'
import UserAppCard from '@/components/services/UserAppCard'
import LogViewer from '@/components/log-viewer/LogViewer'
import PodDrawer from '@/components/pods/PodDrawer'
import PodTable from '@/components/pods/PodTable'
import ConditionList from '@/components/services/ConditionList'
import { serviceStatus } from '@/components/services/ServiceCard'
import StatusBadge from '@/components/common/StatusBadge'
import Panel from '@/components/common/Panel'
import ErrorPanel from '@/components/common/ErrorPanel'
import Loading from '@/components/common/Loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchClusterInfo, fetchService, fetchServiceAbout, fetchStopped } from '@/lib/api'
import { formatCpu, formatMemory } from '@/lib/format'
import type { Workload } from '@/lib/schemas'

export default function ServiceDetail() {
  const { name = '' } = useParams()
  const [selectedPod, setSelectedPod] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'logs' ? 'logs' : 'overview'
  const { data, error, isPending } = useQuery({
    queryKey: ['services', name],
    queryFn: () => fetchService(name),
    refetchInterval: 10_000,
  })
  const info = useQuery({ queryKey: ['cluster', 'info'], queryFn: fetchClusterInfo })
  const stopped = useQuery({ queryKey: ['actions', 'stopped'], queryFn: fetchStopped })
  const readOnly = info.data?.safety.read_only ?? true
  const project = useServiceProject(name)
  const about = useQuery({
    queryKey: ['services', name, 'about'],
    queryFn: () => fetchServiceAbout(name),
    staleTime: 60_000,
  })
  const abouts = Object.values(about.data ?? {})
  const userApps = abouts.filter((a) => a.category === 'user_app')
  const genaiAbout = abouts.find((a) => a.category === 'genai')

  if (isPending) return <Loading label={`Reading ${name}…`} />
  if (error) return <ErrorPanel title={`Could not read ${name}`} error={error} />
  const state = serviceStatus(data)

  return (
    <div className="space-y-5">
      <Link
        to="/services"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={12} aria-hidden />
        All services
      </Link>

      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{data.title}</h2>
        <StatusBadge tone={state.tone} title={state.title}>
          {state.label}
        </StatusBadge>
        <ProtectedBadge protection={data.protection} />
        {data.chart_version && (
          <StatusBadge tone="neutral" mono title={data.chart_name ?? undefined}>
            {data.chart_version}
          </StatusBadge>
        )}
        {data.route_path && (
          <a
            href={data.route_path}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
          >
            <ExternalLink size={11} aria-hidden />
            {data.route_path}
          </a>
        )}
        <span className="ml-auto">
          <ServiceActions service={data} readOnly={readOnly} />
        </span>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setParams(value === 'logs' ? { tab: 'logs' } : {}, { replace: true })
        }
      >
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-5">
          {project && <ServiceProject service={name} project={project} about={genaiAbout} />}
          {userApps.map((a) => (
            <UserAppCard key={a.app?.app_name} about={a} />
          ))}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Status</h3>
              <ConditionList conditions={data.conditions} />
            </Panel>

            <Panel className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Warnings
                {data.warning_count > 0 && (
                  <span className="ml-2 text-xs font-normal text-warning-text">
                    {data.warning_count}
                  </span>
                )}
              </h3>
              {/* Conditions name the failed check; the events say what went wrong. */}
              <EventFeed events={data.events.slice(0, 4)} />
            </Panel>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Workloads{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {data.workload_count}
              </span>
            </h3>
            {data.workloads
              .filter((w) => w.desired_replicas === 0 && w.protection.level !== 'protected')
              .map((w) => (
                <div key={`restore-${w.name}`} className="mb-2">
                  <RestoreBanner
                    kind={w.kind}
                    name={w.name}
                    record={stopped.data?.[`${w.kind}/${w.name}`]}
                    readOnly={readOnly}
                  />
                </div>
              ))}

            {data.workloads.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted-subtle px-4 py-6 text-center text-xs text-muted-foreground">
                This service is declared but nothing is running under it. See the warnings above.
              </p>
            ) : (
              <WorkloadTable workloads={data.workloads} readOnly={readOnly} />
            )}
          </section>

          {data.pods.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Pods{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {data.pods.length}
                </span>
              </h3>
              <PodTable
                pods={data.pods}
                sort="name"
                order="asc"
                onSort={() => undefined}
                showService={false}
                onSelect={setSelectedPod}
                readOnly={readOnly}
              />
            </section>
          )}
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          {/* Mounted only while open, so the logs are read when someone looks. */}
          {tab === 'logs' && <LogViewer service={name} pods={data.pods} />}
        </TabsContent>
      </Tabs>

      {selectedPod && <PodDrawer name={selectedPod} onClose={() => setSelectedPod(null)} />}
    </div>
  )
}

function WorkloadTable({ workloads, readOnly }: { workloads: Workload[]; readOnly: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[44rem] border-collapse bg-background text-sm">
        <thead>
          <tr className="border-b border-border bg-card text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Workload</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Replicas</th>
            <th className="px-3 py-2 text-right font-medium">CPU used / reserved</th>
            <th className="px-3 py-2 text-right font-medium">Memory used / reserved</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {workloads.map((workload) => (
            <tr
              key={`${workload.kind}-${workload.name}`}
              className="border-b border-border last:border-0"
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs break-all text-foreground">
                    {workload.name}
                  </span>
                  <ProtectedBadge protection={workload.protection} />
                </div>
                {workload.component && (
                  <span className="text-xs text-muted-foreground">{workload.component}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {workload.kind}
                {workload.tier && <span className="font-mono">, {workload.tier}</span>}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-foreground">
                {workload.ready_replicas}/{workload.desired_replicas}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                <span className="text-foreground">
                  {formatCpu(workload.resources.usage.cpu_cores)}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  / {formatCpu(workload.resources.requests.cpu_cores)}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                <span className="text-foreground">
                  {formatMemory(workload.resources.usage.memory_bytes)}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  / {formatMemory(workload.resources.requests.memory_bytes)}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end">
                  <WorkloadActions workload={workload} readOnly={readOnly} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
