import { useQuery } from '@tanstack/react-query'
import { Check, Minus } from 'lucide-react'
import { Link } from 'react-router-dom'

import StatusBadge from '@/components/common/StatusBadge'
import Panel from '@/components/common/Panel'
import ErrorPanel from '@/components/common/ErrorPanel'
import Loading from '@/components/common/Loading'
import { fetchClusterInfo, fetchOverview } from '@/lib/api'
import { formatCpu, formatMemory } from '@/lib/format'

/**
 * Read-only by design. Every value here comes from the environment the API was
 * started with, so showing an editable field would imply a write path that does
 * not and should not exist: changing a safety gate belongs in deployment
 * config, not in a button on a web page.
 */
export default function Settings() {
  const info = useQuery({ queryKey: ['cluster', 'info'], queryFn: fetchClusterInfo })
  const overview = useQuery({ queryKey: ['namespace', 'overview'], queryFn: fetchOverview })

  if (info.isPending || overview.isPending) return <Loading />
  if (info.error) return <ErrorPanel title="Could not read settings" error={info.error} />
  if (overview.error) return <ErrorPanel title="Could not read the namespace" error={overview.error} />

  const budget = overview.data.budget
  const caps = info.data.capabilities
  const safety = info.data.safety

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-xs text-muted-foreground">
        <Link to="/howto" className="text-primary hover:underline">
          How to use this tool
        </Link>
      </p>

      <Panel className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Budget</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          What reservations are measured against on the Overview and Capacity pages.
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="CPU" value={`${formatCpu(budget.cpu_cores)} cores`} />
          <Field label="Memory" value={formatMemory(budget.memory_bytes)} />
          <Field label="Source" value={budget.label} />
        </dl>

        {budget.is_policy ? (
          <p className="mt-3 rounded-md bg-warning-subtle p-3 text-xs text-foreground">
            This is a number someone chose, not a limit the cluster enforces. This credential is
            scoped to the namespace and cannot read node capacity, so the tool has no way to know
            how much room the cluster actually has. Set{' '}
            <code className="font-mono text-xs">ARM_BUDGET_CPU_CORES</code> and{' '}
            <code className="font-mono text-xs">ARM_BUDGET_MEMORY_GI</code> to replace the
            derived figure with the allowance your team actually agreed.
          </p>
        ) : (
          <p className="mt-3 rounded-md bg-success-subtle p-3 text-xs text-foreground">
            Enforced by a ResourceQuota on this namespace: a real ceiling, not a policy number.
          </p>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Safety gates</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Set where the API is started. Actions stay unavailable until they are opened.
        </p>
        <ul className="mt-3 space-y-2">
          <Gate
            name="ARM_READ_ONLY"
            on={safety.read_only}
            onLabel="every mutating route returns 403"
            offLabel="mutating routes are enabled"
            safeWhenOn
          />
          <Gate
            name="ARM_ALLOW_GUARDED_ACTIONS"
            on={safety.allow_guarded_actions}
            onLabel="platform infrastructure may be acted on"
            offLabel="platform infrastructure is refused"
          />
          <Gate
            name="ARM_ALLOW_DATABASE_SCALING"
            on={safety.allow_database_scaling}
            onLabel="ArangoDeployment tiers may be resized"
            offLabel="the database cannot be resized"
          />
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Workloads owned by the operator are refused regardless of any of these.
        </p>
      </Panel>

      <Panel className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Cost</h2>
        {overview.data.reclaimable_cost_per_day === null ? (
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            No rates are configured, so no cost is shown anywhere. Set{' '}
            <code className="font-mono text-xs">ARM_COST_PER_CORE_HOUR</code> and{' '}
            <code className="font-mono text-xs">ARM_COST_PER_GI_HOUR</code> to price the
            reclaimable figures. The tool will not invent a price.
          </p>
        ) : (
          <p className="mt-1 font-mono text-xs text-foreground">
            ≈ ${overview.data.reclaimable_cost_per_day.toFixed(2)}/day reclaimable
          </p>
        )}
      </Panel>

      <Panel className="p-4">
        <h2 className="text-sm font-semibold text-foreground">What this credential can do</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Probed once at startup. A panel that looks empty is usually explained here.
        </p>
        <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {Object.entries(caps)
            .filter(([, value]) => typeof value === 'boolean')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => (
              <li key={key} className="flex items-center gap-2 text-xs">
                {value ? (
                  <Check size={12} className="shrink-0 text-primary" aria-label="yes" />
                ) : (
                  <Minus size={12} className="shrink-0 text-muted-foreground" aria-label="no" />
                )}
                <span className={value ? 'font-mono text-foreground' : 'font-mono text-muted-foreground'}>
                  {key}
                </span>
              </li>
            ))}
        </ul>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Namespace" value={info.data.namespace} mono />
          <Field label="Context" value={info.data.context} mono />
          <Field label="Kubernetes" value={info.data.server_version ?? 'unknown'} mono />
          <Field label="Config source" value={info.data.config_source} mono />
        </dl>

        {overview.data.degraded.length > 0 && (
          <p className="mt-3 rounded-md bg-warning-subtle p-3 text-xs text-foreground">
            Could not be read: <span className="font-mono">{overview.data.degraded.join(', ')}</span>
            . Anything depending on these is shown as unknown rather than as zero.
          </p>
        )}
      </Panel>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`break-words text-xs text-foreground ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function Gate({
  name,
  on,
  onLabel,
  offLabel,
  safeWhenOn,
}: {
  name: string
  on: boolean
  onLabel: string
  offLabel: string
  safeWhenOn?: boolean
}) {
  const safe = safeWhenOn ? on : !on
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <code className="font-mono text-foreground">{name}</code>
      <StatusBadge tone={safe ? 'good' : 'warn'} mono>
        {String(on)}
      </StatusBadge>
      <span className="text-muted-foreground">{on ? onLabel : offLabel}</span>
    </li>
  )
}
