import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import PlanDiff from '@/components/actions/PlanDiff'
import Loading from '@/components/common/Loading'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { fetchActor } from '@/lib/api'
import type { ActionPlan, ActionResult } from '@/lib/schemas'

/** The backend refuses shorter reasons. */
export const MIN_REASON_LENGTH = 3

interface Props {
  title: string
  confirmLabel: string
  destructive?: boolean
  /** Runs the action. Called first as a dry run, then for real with the reason. */
  run: (dryRun: boolean, reason?: string) => Promise<ActionResult>
  onDone: () => void
  onClose: () => void
  children?: React.ReactNode
}

/**
 * The confirmation ladder.
 *
 * The dialog opens by running the action as a server-side dry run, so the user
 * is never asked to approve something whose consequences have not been
 * computed, and an RBAC gap or webhook rejection surfaces before they type
 * anything.
 *
 * Every executed action is recorded with the signed-in user and a reason, so
 * confirming needs one. When the plan says so, it also needs the workload's
 * name typed out: reserved for actions that stop a service serving requests.
 */
export default function ActionDialog({
  title,
  confirmLabel,
  destructive,
  run,
  onDone,
  onClose,
  children,
}: Props) {
  const [plan, setPlan] = useState<ActionPlan | null>(null)
  const [blocked, setBlocked] = useState<ActionResult | null>(null)
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const actor = useQuery({ queryKey: ['actor'], queryFn: fetchActor, staleTime: Infinity })
  const reasonId = useId()
  const typedId = useId()

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    run(true)
      .then((result) => {
        if (cancelled) return
        if (result.blocked_reason) setBlocked(result)
        else setPlan(result.plan)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => !cancelled && setBusy(false))
    return () => {
      cancelled = true
    }
    // The dry run runs once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const needsTyping = plan?.requires_typed_confirmation ?? false
  const hasReason = reason.trim().length >= MIN_REASON_LENGTH
  const ready =
    plan !== null &&
    hasReason &&
    (!needsTyping || (typed === plan.name && acknowledged)) &&
    !busy

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await run(false, reason.trim())
      if (result.blocked_reason) setBlocked(result)
      else onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {actor.data?.user && (
            <DialogDescription>Recorded as {actor.data.user}</DialogDescription>
          )}
        </DialogHeader>

        {busy && !plan && !blocked && <Loading label="Checking what this would do" />}

        {blocked && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>{blocked.detail}</AlertTitle>
            {blocked.remediation && <AlertDescription>{blocked.remediation}</AlertDescription>}
          </Alert>
        )}

        {plan && !blocked && (
          <div className="space-y-4">
            {children}
            <PlanDiff plan={plan} />

            <Field>
              <FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Freeing CPU for the Thursday demo"
              />
            </Field>

            {needsTyping && (
              <Field>
                <FieldLabel htmlFor={typedId}>
                  Type <span className="font-mono">{plan.name}</span> to confirm
                </FieldLabel>
                <Input
                  id={typedId}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  Requests to this service fail until it is restored.
                </label>
              </Field>
            )}
          </div>
        )}

        {error && <p className="font-mono text-xs break-all text-destructive-text">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!blocked && (
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={!ready}
              onClick={confirm}
            >
              {busy && plan ? 'Working' : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
