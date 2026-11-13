import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LogViewer from '@/components/log-viewer/LogViewer'
import { TooltipProvider } from '@/components/ui/tooltip'
import * as api from '@/lib/api'
import type { Pod } from '@/lib/schemas'

const pod = (name: string, workload: string): Pod =>
  ({
    name,
    workload: { kind: 'Deployment', name: workload },
    containers: ['worker', 'integration'],
  }) as unknown as Pod

function renderViewer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={600_000}>
        <LogViewer
          service="file-parser"
          pods={[pod('worker-pdf-abc-1', 'worker-pdf'), pod('worker-pdf-abc-2', 'worker-pdf')]}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('LogViewer', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows every container in one timeline, tagged by pod and container', async () => {
    vi.spyOn(api, 'fetchServiceLogs').mockResolvedValue({
      lines: [
        {
          ts: '2026-11-13T10:00:01Z',
          pod: 'worker-pdf-abc-1',
          container: 'worker',
          text: 'claim failed',
        },
        {
          ts: '2026-11-13T10:00:02Z',
          pod: 'worker-pdf-abc-2',
          container: 'integration',
          text: 'ready',
        },
      ],
      errors: [{ pod: 'worker-pdf-abc-2', container: 'worker', detail: 'Pod is gone.' }],
      sources: 4,
      truncated: false,
    })
    renderViewer()

    expect(await screen.findByText('claim failed')).toBeInTheDocument()
    expect(screen.getByText('abc-1/worker')).toBeInTheDocument()
    expect(screen.getByText('abc-2/integration')).toBeInTheDocument()
    expect(screen.getByText('Some containers are missing from this view')).toBeInTheDocument()
    expect(screen.getByText(/Pod is gone/)).toBeInTheDocument()
  })

  it('filters lines without reading the logs again', async () => {
    const fetch = vi.spyOn(api, 'fetchServiceLogs').mockResolvedValue({
      lines: [
        {
          ts: '2026-11-13T10:00:01Z',
          pod: 'worker-pdf-abc-1',
          container: 'worker',
          text: 'claim failed',
        },
        {
          ts: '2026-11-13T10:00:02Z',
          pod: 'worker-pdf-abc-1',
          container: 'worker',
          text: 'all good',
        },
      ],
      errors: [],
      sources: 2,
      truncated: false,
    })
    const user = userEvent.setup()
    renderViewer()
    await screen.findByText('all good')

    await user.type(screen.getByLabelText('Filter'), 'FAILED')
    expect(screen.queryByText('all good')).not.toBeInTheDocument()
    expect(screen.getByText('claim failed')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 lines')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
