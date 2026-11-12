import {
  Activity,
  BookOpen,
  Boxes,
  CircleAlert,
  CircleCheck,
  Container,
  Database,
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  Settings,
  Sparkles,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/services', label: 'Services', icon: Boxes },
  { to: '/genai', label: 'GenAI', icon: Sparkles },
  { to: '/pods', label: 'Pods', icon: Container },
  { to: '/capacity', label: 'Capacity', icon: Gauge },
  { to: '/database', label: 'Database', icon: Database },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export const REFERENCE_ITEM = { to: '/howto', label: 'How-to', icon: BookOpen, end: false }

interface Props {
  healthy: boolean | null
}

export default function SideMenu({ healthy }: Props) {
  const { pathname } = useLocation()
  const active = (to: string, end?: boolean) =>
    end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)

  return (
    <Sidebar collapsible="icon" className="dark">
      <SidebarHeader className="px-4 py-4 group-data-[collapsible=icon]:px-2">
        <img
          src="./arango-logo-reversed.svg"
          alt="Arango"
          className="h-6 w-auto self-start group-data-[collapsible=icon]:hidden"
        />
        <img
          src="./arango-mark.svg"
          alt="Arango"
          className="hidden size-6 self-center group-data-[collapsible=icon]:block"
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <NavItem key={item.to} {...item} isActive={active(item.to, item.end)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <NavItem {...REFERENCE_ITEM} isActive={active(REFERENCE_ITEM.to)} />
          <SidebarMenuItem>
            <Connection healthy={healthy} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  isActive,
}: {
  to: string
  label: string
  icon: typeof BookOpen
  end?: boolean
  isActive: boolean
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <NavLink to={to} end={end}>
          <Icon aria-hidden />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function Connection({ healthy }: { healthy: boolean | null }) {
  const [Icon, label] =
    healthy === null
      ? [LoaderCircle, 'Connecting']
      : healthy
        ? [CircleCheck, 'Connected']
        : [CircleAlert, 'Not connected']
  return (
    <div
      role="status"
      className="flex h-8 items-center gap-2 px-2 text-sm text-sidebar-foreground"
      title={label}
    >
      <Icon className={`size-4 shrink-0 ${healthy === null ? 'animate-spin' : ''}`} aria-hidden />
      <span className="group-data-[collapsible=icon]:hidden">{label}</span>
    </div>
  )
}
