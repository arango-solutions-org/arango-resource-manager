import { describe, expect, it } from 'vitest'

import { lastUsed, whatItIs, whenText } from '@/lib/about'
import type { WorkloadAbout } from '@/lib/schemas'

const base: WorkloadAbout = {
  category: 'other',
  label: null,
  project_name: null,
  database: null,
  chat_model: null,
  embedding_model: null,
  app: null,
  created_at: '2026-10-19T09:00:00Z',
  activity_known: false,
  last_request_at: null,
  last_change_at: null,
}

describe('about', () => {
  it('ignores AutoGraph reads, which are the platform UI polling', () => {
    const about = {
      ...base,
      category: 'genai' as const,
      label: 'AutoGraph project',
      activity_known: true,
      last_request_at: '2026-11-13T19:00:00Z',
      last_change_at: '2026-11-03T20:00:00Z',
    }
    expect(lastUsed(about)).toBe('2026-11-03T20:00:00Z')
  })

  it('counts any request for a retriever', () => {
    const about = {
      ...base,
      category: 'genai' as const,
      label: 'GraphRAG retriever',
      activity_known: true,
      last_request_at: '2026-11-11T10:00:00Z',
      last_change_at: '2026-11-11T08:00:00Z',
    }
    expect(lastUsed(about)).toBe('2026-11-11T10:00:00Z')
  })

  it('says not used rather than nothing when Prometheus saw no requests', () => {
    expect(whenText({ ...base, activity_known: true })).toMatch(/not used in 15 days$/)
    // Not scraped at all: unknown, so it is left out, not called unused.
    expect(whenText(base)).not.toMatch(/used/)
  })

  it('describes projects and user apps', () => {
    expect(
      whatItIs({
        ...base,
        category: 'genai',
        label: 'GraphRAG retriever',
        project_name: 'ai-infra',
        database: 'arrow_demo',
      }),
    ).toBe('GraphRAG retriever ai-infra, database arrow_demo')
    expect(
      whatItIs({
        ...base,
        category: 'user_app',
        database: 'temporal',
        app: {
          app_name: 'chronograph',
          package: 'chronograph',
          package_version: '0.3.0-1',
          runtime: 'Python 3.12 package',
          image: null,
          database: 'temporal',
        },
      }),
    ).toBe('User app chronograph 0.3.0-1, database temporal')
  })
})
