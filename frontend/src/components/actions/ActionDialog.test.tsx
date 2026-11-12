import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ActionDialog from '@/components/actions/ActionDialog'
import type { ActionResult } from '@/lib/schemas'
import { killPlan, okResult } from '@/test/fixtures'
import { renderWithProviders as render } from '@/test/render'

vi.mock('@/lib/api', () => ({
  fetchActor: vi.fn(async () => ({ user: 'paul@arangodb.com', source: 'platform' })),
}))

const REASON = 'Freeing CPU for the Thursday demo'

describe('ActionDialog', () => {
  it('runs a dry-run first and keeps confirm disabled until reason and name are given', async () => {
    const user = userEvent.setup()
    const run = vi.fn(async (dryRun: boolean, _reason?: string) => okResult(killPlan, dryRun))
    const onDone = vi.fn()

    render(
      <ActionDialog
        title="Kill worker"
        confirmLabel="Kill the service"
        destructive
        run={run}
        onDone={onDone}
        onClose={() => undefined}
      />,
    )

    expect(await screen.findByText(/force-deleted immediately/)).toBeInTheDocument()
    expect(run).toHaveBeenCalledWith(true)

    expect(await screen.findByText('Recorded as paul@arangodb.com')).toBeInTheDocument()

    const confirm = screen.getByRole('button', { name: 'Kill the service' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: /Type/ }), killPlan.name)
    await user.click(screen.getByRole('checkbox'))
    expect(confirm).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'Reason' }), REASON)
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(run).toHaveBeenCalledWith(false, REASON)
    expect(onDone).toHaveBeenCalled()
  })

  it('shows a blocked reason instead of asking for confirmation', async () => {
    const blocked: ActionResult = {
      executed: false,
      dry_run: true,
      plan: null,
      blocked_reason: 'protected',
      detail: 'This workload is managed by an operator.',
      remediation: 'Resize this from the Database page.',
    }
    render(
      <ActionDialog
        title="Kill dbserver"
        confirmLabel="Kill"
        run={async () => blocked}
        onDone={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(await screen.findByText(/managed by an operator/)).toBeInTheDocument()
    expect(screen.getByText(/Database page/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kill' })).not.toBeInTheDocument()
  })

  it('does not accept a reason shorter than the backend allows', async () => {
    const user = userEvent.setup()
    render(
      <ActionDialog
        title="Restart worker"
        confirmLabel="Restart"
        run={async (dryRun) => okResult({ ...killPlan, requires_typed_confirmation: false }, dryRun)}
        onDone={() => undefined}
        onClose={() => undefined}
      />,
    )
    const reason = await screen.findByRole('textbox', { name: 'Reason' })
    await user.type(reason, 'ok')
    expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled()
    await user.type(reason, '!')
    expect(screen.getByRole('button', { name: 'Restart' })).toBeEnabled()
  })
})
