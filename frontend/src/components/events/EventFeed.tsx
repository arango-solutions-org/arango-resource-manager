import { AlertTriangle } from 'lucide-react'

import type { EventItem } from '@/lib/schemas'

export default function EventFeed({ events }: { events: EventItem[] }) {
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">No warnings recorded for this service.</p>
  }

  return (
    <ul className="space-y-2">
      {events.map((event, index) => (
        <li
          key={`${event.involved_name}-${event.reason}-${index}`}
          className="rounded-md border border-warning-ring bg-warning-subtle p-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={12} className="shrink-0 text-warning-text" aria-hidden />
            <span className="text-xs font-medium text-warning-text">{event.reason ?? 'Warning'}</span>
            {event.count > 1 && <span className="text-xs text-muted-foreground">×{event.count}</span>}
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {event.involved_name}
            </span>
          </div>
          {event.message && (
            <p className="mt-1.5 font-mono text-xs leading-relaxed break-words text-foreground">
              {event.message}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
