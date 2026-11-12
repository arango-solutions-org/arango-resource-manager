import { useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Power, RotateCw, Undo2, XCircle } from 'lucide-react'
import { useState } from 'react'

import ActionDialog from '@/components/actions/ActionDialog'
import Hint from '@/components/common/Hint'
import {
  killWorkload,
  restartWorkload,
  restoreWorkload,
  scaleWorkload,
  stopWorkload,
} from '@/lib/api'
import { formatCpu, formatMemory } from '@/lib/format'
import type { Workload } from '@/lib/schemas'

type Open = 'scale' | 'stop' | 'restart' | 'restore' | 'kill' | null

interface Props {
  workload: Workload
  readOnly: boolean
}

export default function WorkloadActions({ workload, readOnly }: Props) {
  const [open, setOpen] = useState<Open>(null)
  const [target, setTarget] = useState(workload.desired_replicas)
  const queryClient = useQueryClient()

  // Protected workloads get no buttons at all; the badge beside them explains
  // why and points at the Database page.
  if (workload.protection.level === 'protected') return null

  const disabled = readOnly
  const hint = readOnly ? 'Read-only mode is on (ARM_READ_ONLY). No action will run.' : undefined

  // What stopping this would hand back to the pool. It is the reason to do it,
  // so it belongs on the button rather than one page deeper.
  const frees = `${formatCpu(workload.resources.requests.cpu_cores)}, ${formatMemory(
    workload.resources.requests.memory_bytes
  )}`
  const alreadyStopped = workload.desired_replicas === 0
  const stopHint = hint ?? `Scale to 0, freeing ${frees}`
  const killHint =
    hint ??
    (alreadyStopped
      ? 'Force-delete leftover pods immediately. The replica count is already 0, so nothing comes back.'
      : 'Force-delete pods and scale to 0. The service dies immediately, with no graceful shutdown')

  function done() {
    setOpen(null)
    void queryClient.invalidateQueries()
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center rounded border border-border bg-background">
        <Step
          icon={<Minus size={11} />}
          label="one fewer replica"
          hint={hint ?? (workload.desired_replicas <= 0 ? 'Already at 0 replicas.' : 'One fewer replica')}
          disabled={disabled || target <= 0}
          onClick={() => {
            setTarget(Math.max(0, target - 1))
            setOpen('scale')
          }}
        />
        <span className="px-1.5 font-mono text-xs text-foreground">{workload.desired_replicas}</span>
        <Step
          icon={<Plus size={11} />}
          label="one more replica"
          hint={hint ?? 'One more replica'}
          disabled={disabled}
          onClick={() => {
            setTarget(target + 1)
            setOpen('scale')
          }}
        />
      </div>

      <IconButton
        icon={<RotateCw size={12} />}
        label="Rolling restart"
        title={hint ?? 'Rolling restart: replaces pods one at a time, no downtime'}
        disabled={disabled}
        onClick={() => setOpen('restart')}
      />
      {alreadyStopped ? (
        <IconButton
          icon={<Undo2 size={12} />}
          label="Restore"
          title={hint ?? 'Scale back up to the replica count recorded when it stopped'}
          disabled={disabled}
          onClick={() => setOpen('restore')}
        />
      ) : (
        <IconButton
          icon={<Power size={12} />}
          label="Stop"
          title={stopHint}
          disabled={disabled}
          danger
          onClick={() => setOpen('stop')}
        />
      )}
      <IconButton
        icon={<XCircle size={12} />}
        label="Kill"
        title={killHint}
        disabled={disabled}
        danger
        onClick={() => setOpen('kill')}
      />

      {open === 'scale' && (
        <ActionDialog
          title={`Scale ${workload.name}`}
          confirmLabel={`Scale to ${target}`}
          run={(dryRun, reason) =>
            scaleWorkload({
              kind: workload.kind,
              name: workload.name,
              replicas: target,
              dryRun,
              reason,
            })
          }
          onDone={done}
          onClose={() => setOpen(null)}
        />
      )}

      {open === 'restart' && (
        <ActionDialog
          title={`Restart ${workload.name}`}
          confirmLabel="Restart"
          run={(dryRun, reason) => restartWorkload(workload.kind, workload.name, dryRun, reason)}
          onDone={done}
          onClose={() => setOpen(null)}
        />
      )}

      {open === 'restore' && (
        <ActionDialog
          title={`Restore ${workload.name}`}
          confirmLabel="Restore"
          run={(dryRun, reason) => restoreWorkload(workload.kind, workload.name, dryRun, reason)}
          onDone={done}
          onClose={() => setOpen(null)}
        />
      )}

      {open === 'stop' && (
        <ActionDialog
          title={`Stop ${workload.name}`}
          confirmLabel="Stop the service"
          destructive
          run={(dryRun, reason) => stopWorkload(workload.kind, workload.name, dryRun, reason)}
          onDone={done}
          onClose={() => setOpen(null)}
        />
      )}

      {open === 'kill' && (
        <ActionDialog
          title={`Kill ${workload.name}`}
          confirmLabel="Kill the service"
          destructive
          run={(dryRun, reason) => killWorkload(workload.kind, workload.name, dryRun, reason)}
          onDone={done}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function Step({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Hint label={hint ?? label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="px-1.5 py-1 text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
      >
        {icon}
      </button>
    </Hint>
  )
}

function IconButton({
  icon,
  label,
  title,
  disabled,
  danger,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  title?: string
  disabled: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <Hint label={title ?? label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`rounded border border-border bg-background px-1.5 py-1 disabled:cursor-not-allowed disabled:opacity-30 ${
          danger ? 'text-muted-foreground hover:text-destructive-text' : 'text-muted-foreground hover:text-primary'
        }`}
      >
        {icon}
      </button>
    </Hint>
  )
}
