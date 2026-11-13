import Panel from '@/components/common/Panel'
import { shortDate } from '@/lib/about'
import type { WorkloadAbout } from '@/lib/schemas'
import { formatUptime } from '@/lib/uptime'

/** What a user-defined app is: the package it runs, on what, against which database. */
export default function UserAppCard({ about }: { about: WorkloadAbout }) {
  const app = about.app
  if (!app) return null
  const installed = about.created_at ? new Date(about.created_at) : null

  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">User app</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Item label="App" value={app.app_name} mono />
        <Item
          label="Package"
          value={app.package ? `${app.package} ${app.package_version ?? ''}`.trim() : null}
          mono
        />
        <Item label="Runs as" value={app.runtime} />
        {app.image && <Item label="Image" value={app.image} mono />}
        <Item label="Database" value={app.database} mono />
        <Item
          label="Installed"
          value={
            installed
              ? `${shortDate(about.created_at)}, ${formatUptime(
                  Math.floor((Date.now() - installed.getTime()) / 1000),
                )} ago`
              : null
          }
          hint={about.created_at ?? undefined}
        />
      </dl>
    </Panel>
  )
}

function Item({
  label,
  value,
  mono,
  hint,
}: {
  label: string
  value: string | null
  mono?: boolean
  hint?: string
}) {
  return (
    <div title={hint}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-xs break-all text-foreground' : 'text-foreground'}>
        {value ?? 'n/a'}
      </dd>
    </div>
  )
}
