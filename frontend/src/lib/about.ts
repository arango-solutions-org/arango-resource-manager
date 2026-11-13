import type { WorkloadAbout } from '@/lib/schemas'

/** The window the platform Prometheus keeps. Matches the backend. */
export const ACTIVITY_WINDOW_DAYS = 15

/**
 * When someone last used it. For AutoGraph that is the last request that was
 * not a GET, because the platform UI polls every instance with GETs.
 */
export function lastUsed(about: WorkloadAbout): string | null {
  if (about.label === 'AutoGraph project') return about.last_change_at
  return about.last_change_at && about.last_request_at
    ? [about.last_change_at, about.last_request_at].sort()[1]
    : (about.last_request_at ?? about.last_change_at)
}

export function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "AutoGraph project ai-infra, database arrow_demo" or "User app chronograph 0.3.0-1". */
export function whatItIs(about: WorkloadAbout): string | null {
  if (about.category === 'genai') {
    const parts = [about.label ?? 'GenAI service']
    if (about.project_name) parts[0] += ` ${about.project_name}`
    if (about.database) parts.push(`database ${about.database}`)
    return parts.join(', ')
  }
  if (about.category === 'user_app' && about.app) {
    const app = about.app
    const parts = [`User app ${app.package ?? app.app_name}`]
    if (app.package_version) parts[0] += ` ${app.package_version}`
    if (about.database) parts.push(`database ${about.database}`)
    return parts.join(', ')
  }
  return null
}

/** "Installed Oct 19, last used Nov 3", with unknowns left out rather than guessed. */
export function whenText(about: WorkloadAbout): string {
  const parts: string[] = []
  const installed = shortDate(about.created_at)
  if (installed) parts.push(`installed ${installed}`)
  if (about.activity_known) {
    const used = shortDate(lastUsed(about))
    parts.push(used ? `last used ${used}` : `not used in ${ACTIVITY_WINDOW_DAYS} days`)
  }
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
