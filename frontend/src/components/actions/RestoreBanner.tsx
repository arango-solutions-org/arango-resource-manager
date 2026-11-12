import { useQueryClient } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { useState } from 'react'

import ActionDialog from '@/components/actions/ActionDialog'
import Hint from '@/components/common/Hint'
import { restoreWorkload } from '@/lib/api'
import type { Stopped } from '@/lib/schemas'

interface Props {
  kind: string
  name: string
  record?: Stopped[string]
  readOnly: boolean
}

/**
 * Shown on anything sitting at zero replicas. If this tool stopped it, the
 * previous count is known and offered. If it did not, it says so rather than
 * inventing a number.
 */
export default function RestoreBanner({ kind, name, record, readOnly }: Props) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning-ring bg-warning-subtle px-3 py-2">
      <span className="text-xs text-foreground">
        {record ? (
          <>
            Stopped by {record.actor} on {new Date(record.stopped_at).toLocaleString()}. It
            had{' '}
            <span className="font-mono font-semibold">{record.previous_replicas}</span>{' '}
            {record.previous_replicas === 1 ? 'replica' : 'replicas'}.
          </>
        ) : (
          <>Stopped, but not by this tool. The previous replica count is unknown.</>
        )}
      </span>
      <Hint
        label={
          readOnly
            ? 'Read-only mode is on (ARM_READ_ONLY). No action will run.'
            : record
              ? `Scale back to ${record.previous_replicas}, the count recorded when it was stopped`
              : 'Scale back to 1. The previous count was not recorded, so 1 is a guess'
        }
      >
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setOpen(true)}
          className="ml-auto inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 size={11} aria-hidden />
          Restore to {record?.previous_replicas ?? 1}
        </button>
      </Hint>

      {open && (
        <ActionDialog
          title={`Restore ${name}`}
          confirmLabel="Restore"
          run={(dryRun, reason) => restoreWorkload(kind, name, dryRun, reason)}
          onDone={() => {
            setOpen(false)
            void queryClient.invalidateQueries()
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
