import { describe, expect, it } from 'vitest'

import { appendNew, matches, shortPod } from '@/lib/logs'
import type { LogLine } from '@/lib/schemas'

const line = (pod: string, ts: string, text = ts): LogLine => ({
  pod,
  container: 'worker',
  ts,
  text,
})

describe('appendNew', () => {
  it('keeps only lines later than the last one held from the same container', () => {
    const shown = [line('a', '2026-11-13T10:00:01Z'), line('b', '2026-11-13T10:00:02Z')]
    // The follow poll overlaps the previous one.
    const poll = [
      line('a', '2026-11-13T10:00:01Z'),
      line('b', '2026-11-13T10:00:02Z'),
      line('a', '2026-11-13T10:00:03Z'),
    ]
    const next = appendNew(shown, poll)
    expect(next.map((l) => `${l.pod}@${l.ts}`)).toEqual([
      'a@2026-11-13T10:00:01Z',
      'b@2026-11-13T10:00:02Z',
      'a@2026-11-13T10:00:03Z',
    ])
  })

  it('returns the same array when nothing is new, so React skips a render', () => {
    const shown = [line('a', '2026-11-13T10:00:01Z')]
    expect(appendNew(shown, [line('a', '2026-11-13T10:00:01Z')])).toBe(shown)
  })

  it('takes lines from a container it has not seen yet', () => {
    const shown = [line('a', '2026-11-13T10:00:05Z')]
    const next = appendNew(shown, [line('b', '2026-11-13T10:00:01Z')])
    expect(next.map((l) => l.pod)).toEqual(['b', 'a'])
  })
})

describe('shortPod', () => {
  it('drops the workload name the reader already knows', () => {
    expect(shortPod('parser-worker-pdf-64467d8d48-7txlk', 'parser-worker-pdf')).toBe(
      '64467d8d48-7txlk',
    )
    expect(shortPod('other-pod', 'parser-worker-pdf')).toBe('other-pod')
    expect(shortPod('other-pod', null)).toBe('other-pod')
  })
})

describe('matches', () => {
  it('filters case-insensitively and lets everything through when empty', () => {
    expect(matches(line('a', 't', 'Claim FAILED'), 'failed')).toBe(true)
    expect(matches(line('a', 't', 'ok'), 'failed')).toBe(false)
    expect(matches(line('a', 't', 'ok'), '')).toBe(true)
  })
})
