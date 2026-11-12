import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useState } from 'react'

import ActionDialog from '@/components/actions/ActionDialog'
import ConditionList from '@/components/services/ConditionList'
import StatusBadge from '@/components/common/StatusBadge'
import Panel from '@/components/common/Panel'
import ErrorPanel from '@/components/common/ErrorPanel'
import Loading from '@/components/common/Loading'
import { fetchDatabase, scaleDatabase } from '@/lib/api'
import type { Tier } from '@/lib/schemas'

/**
 * The correct way to resize the cluster. Everywhere else in this app, an
 * ArangoDB member is protected and its buttons are absent, because scaling it
 * through the core Kubernetes API is reconciled straight back by the operator.
 * Here the ArangoDeployment spec is edited instead, which is what the operator
 * actually reads.
 */
export default function Database() {
  const { data, error, isPending } = useQuery({
    queryKey: ['database'],
    queryFn: fetchDatabase,
    refetchInterval: 10_000,
  })

  if (isPending) return <Loading label="Reading the database…" />
  if (error) return <ErrorPanel title="Could not read the ArangoDeployment" error={error} />

  return (
    <div className="max-w-4xl space-y-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{data.name}</h2>
        <StatusBadge tone="neutral" mono>
          {data.mode ?? 'unknown'}
        </StatusBadge>
        <StatusBadge tone={data.ready ? 'good' : 'warn'}>{data.ready ? 'ready' : 'not ready'}</StatusBadge>
      </header>

      {!data.scaling_enabled && (
        <p className="rounded-md border border-border bg-card p-3 text-xs text-foreground">
          Resizing is disabled. Set{' '}
          <code className="font-mono text-xs">ARM_ALLOW_DATABASE_SCALING=true</code> where the
          API is started to enable it. Agents stay fixed regardless (see below).
        </p>
      )}

      <section className="space-y-3">
        {data.tiers.map((tier) => (
          <TierRow key={tier.name} tier={tier} />
        ))}
      </section>

      <Panel className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Operator status</h3>
        <ConditionList conditions={data.conditions} />
      </Panel>
    </div>
  )
}

function TierRow({ tier }: { tier: Tier }) {
  const [target, setTarget] = useState(tier.count)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const immutable = tier.policy === 'immutable'
  const changed = target !== tier.count

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-sm text-foreground">{tier.name}</h3>
        <StatusBadge tone="neutral" mono>
          {tier.ready}/{tier.count} ready
        </StatusBadge>
        {immutable && (
          <StatusBadge tone="neutral" title={tier.note}>
            <Lock size={11} aria-hidden />
            fixed
          </StatusBadge>
        )}
        {tier.policy === 'drain-on-shrink' && (
          <StatusBadge tone="warn" title={tier.note}>
            drains on shrink
          </StatusBadge>
        )}

        {!immutable && (
          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={16}
              value={target}
              disabled={!tier.scalable}
              onChange={(event) => setTarget(Number(event.target.value))}
              className="w-16 rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground disabled:opacity-40"
            />
            <button
              type="button"
              disabled={!tier.scalable || !changed}
              onClick={() => setOpen(true)}
              className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 max-w-prose text-xs text-muted-foreground">{tier.note}</p>

      {open && (
        <ActionDialog
          title={`Scale ${tier.name} to ${target}`}
          confirmLabel={`Set ${tier.name} to ${target}`}
          destructive={target < tier.count}
          run={(dryRun, reason) => scaleDatabase(tier.name, target, dryRun, reason)}
          onDone={() => {
            setOpen(false)
            void queryClient.invalidateQueries()
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </Panel>
  )
}
