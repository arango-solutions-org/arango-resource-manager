import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import Panel from '@/components/common/Panel'
import StatusBadge, { type Tone } from '@/components/common/StatusBadge'
import { fetchGenAiProjects } from '@/lib/api'
import { ACTIVITY_WINDOW_DAYS, lastUsed, shortDate } from '@/lib/about'
import type { GenAiComponent, GenAiProject, WorkloadAbout } from '@/lib/schemas'
import { formatUptime } from '@/lib/uptime'

const ROLE: Record<GenAiComponent['role'], string> = {
  project: 'AutoGraph project',
  retriever: 'GraphRAG retriever',
  importer: 'GraphRAG importer',
}

const STATUS: Record<GenAiProject['status'], { tone: Tone; label: string }> = {
  paired: { tone: 'good', label: 'Project and retriever' },
  project_only: { tone: 'neutral', label: 'No retriever' },
  retriever_only: { tone: 'warn', label: 'Retriever without a project' },
  unidentified: { tone: 'warn', label: 'Project unknown' },
}

function components(project: GenAiProject): GenAiComponent[] {
  return [...(project.project ? [project.project] : []), ...project.retrievers, ...project.others]
}

/** The AI project a service belongs to, or null when it is not an AI service. */
export function useServiceProject(service: string) {
  const projects = useQuery({ queryKey: ['genai', 'projects'], queryFn: fetchGenAiProjects })
  const project = projects.data?.find((p) => components(p).some((c) => c.service === service))
  return project ?? null
}

/**
 * Which AI project and database an AutoGraph, retriever or importer serves,
 * when it was installed, and the other services in the same project.
 *
 * The pairing comes from the project name and database set on each release's
 * pod spec; the GenAI page explains it.
 */
export default function ServiceProject({
  service,
  project,
  about,
}: {
  service: string
  project: GenAiProject
  /** This service's workload, for when it was last used. */
  about?: WorkloadAbout
}) {
  const all = components(project)
  const self = all.find((c) => c.service === service)
  const siblings = all.filter((c) => c.service !== service)
  const status = STATUS[project.status]
  const installed = self?.created_at ? new Date(self.created_at) : null

  return (
    <Panel className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">GenAI project</h3>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <Link to="/genai" className="ml-auto text-xs text-muted-foreground hover:text-primary">
          All projects
        </Link>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Item label="Project" value={project.project_name} mono />
        <Item label="Database" value={project.db_name} mono />
        <Item label="This service" value={self ? ROLE[self.role] : null} />
        <Item
          label="Installed"
          value={
            installed
              ? `${installed.toLocaleDateString()}, ${formatUptime(
                  Math.floor((Date.now() - installed.getTime()) / 1000),
                )} ago`
              : null
          }
          hint={self?.created_at ?? undefined}
        />
        {about?.activity_known && (
          <Item
            label="Last used"
            value={shortDate(lastUsed(about)) ?? `Not in ${ACTIVITY_WINDOW_DAYS} days`}
            hint={
              about.label === 'AutoGraph project'
                ? 'Last request that changed something. The platform UI reads every instance constantly, so reads are not counted.'
                : undefined
            }
          />
        )}
        <Item label="Chat model" value={self?.chat_model ?? null} mono />
        <Item label="Embedding model" value={self?.embedding_model ?? null} mono />
      </dl>

      {siblings.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">Same project</h4>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
            {siblings.map((c) => {
              const row = (
                <>
                  <span className="w-40 shrink-0 text-xs text-muted-foreground">
                    {ROLE[c.role]}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {c.name}
                  </span>
                  <StatusBadge
                    tone={c.ready_pods === c.pod_count && c.pod_count > 0 ? 'good' : 'warn'}
                  >
                    {c.pod_count === 0 ? 'Stopped' : `${c.ready_pods}/${c.pod_count} ready`}
                  </StatusBadge>
                </>
              )
              return (
                <li key={`${c.kind}/${c.name}`}>
                  {c.service ? (
                    <Link
                      to={`/services/${encodeURIComponent(c.service)}`}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted"
                    >
                      {row}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-3 px-3 py-2">{row}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function Item({
  label,
  value,
  mono,
  hint,
}: {
  label: string
  value: string | null
  mono?: boolean
  hint?: string
}) {
  return (
    <div title={hint}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-xs break-all text-foreground' : 'text-foreground'}>
        {value ?? 'n/a'}
      </dd>
    </div>
  )
}
