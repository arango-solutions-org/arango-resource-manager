import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * Render inside the providers the app shell supplies.
 *
 * Tooltips get a delay no test reaches. Under jsdom an open tooltip keeps
 * repositioning itself, which starves the event loop, so any async query
 * (findBy, waitFor) that runs while one is open never resolves or times out.
 * The app's delay is 0, so a click that rests on a button for a moment opens
 * one: that is how CI hung while local runs passed.
 */
export function renderWithProviders(ui: ReactElement, { sidebar = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = sidebar ? <SidebarProvider>{ui}</SidebarProvider> : ui
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={600_000}>{content}</TooltipProvider>
    </QueryClientProvider>,
  )
}
