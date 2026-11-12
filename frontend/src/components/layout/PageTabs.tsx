import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'

import { NAV_ITEMS, REFERENCE_ITEM } from './SideMenu'

/** The app's pages as line tabs, for when the platform supplies the sidebar. */
export default function PageTabs() {
  return (
    <nav aria-label="Pages" className="-mb-px overflow-x-auto">
      <ul className="flex gap-1">
        {[...NAV_ITEMS, REFERENCE_ITEM].map(({ to, label, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
