import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

describe('Tooltip', () => {
  // An open tooltip is positioned with ResizeObserver, which jsdom lacks. This
  // crashed CI when a click happened to hover a button long enough to open one.
  // Checked synchronously: see renderWithProviders for why no findBy here.
  it('renders open without crashing the test environment', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Kill</TooltipTrigger>
          <TooltipContent>Read-only mode is on</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    expect(screen.getAllByText('Read-only mode is on').length).toBeGreaterThan(0)
  })
})
