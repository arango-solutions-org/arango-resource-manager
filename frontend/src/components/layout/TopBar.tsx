import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'

import Hint from '@/components/common/Hint'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { fetchActor } from '@/lib/api'
import type { Chip } from '@/lib/capability'

import { NAV_ITEMS, REFERENCE_ITEM } from './SideMenu'

interface Props {
  namespace?: string
  context?: string
  chips: Chip[]
}

const VARIANT = { ok: 'success', off: 'outline', warn: 'warning' } as const

/** Page title and breadcrumb trail for the current route. */
function trail(pathname: string): { title: string; parent?: { to: string; label: string } } {
  const items = [...NAV_ITEMS, REFERENCE_ITEM]
  const exact = items.find((item) => item.to === pathname)
  if (exact) return { title: exact.label }
  const parent = items.find((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`))
  const leaf = decodeURIComponent(pathname.split('/').pop() ?? '')
  return parent ? { title: leaf, parent: { to: parent.to, label: parent.label } } : { title: leaf }
}

export default function TopBar({ namespace, context, chips }: Props) {
  const { pathname } = useLocation()
  const { title, parent } = trail(pathname)
  const actor = useQuery({ queryKey: ['actor'], queryFn: fetchActor, staleTime: Infinity })

  return (
    <header className="border-b border-border px-6 pt-4 pb-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-2" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Hint label={context ? `Context ${context}` : undefined} side="bottom">
                <span className="font-mono">{namespace ?? 'Connecting'}</span>
              </Hint>
            </BreadcrumbItem>
            {parent && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={parent.to}>{parent.label}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          {actor.data?.user && (
            <Hint label="Actions you take are recorded under this name" side="bottom">
              <span className="text-sm text-muted-foreground">{actor.data.user}</span>
            </Hint>
          )}
          <ThemeToggle />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <h1
          className={`text-3xl font-bold tracking-[-0.75px] text-foreground ${parent ? 'font-mono' : ''}`}
        >
          {title}
        </h1>
        <div className="ml-auto flex flex-wrap items-center gap-2 pt-2">
          {chips.map((chip) => (
            <Hint key={chip.label} label={chip.title} side="bottom">
              <Badge variant={VARIANT[chip.tone]}>{chip.label}</Badge>
            </Hint>
          ))}
        </div>
      </div>
    </header>
  )
}
