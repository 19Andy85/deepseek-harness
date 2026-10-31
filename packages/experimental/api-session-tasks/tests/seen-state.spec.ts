/** Acknowledged-baseline comparison. */

import type { SessionTaskView } from '../src/types.ts'
import { describe, expect, it } from 'vitest'
import { changedSessionIds, seenRowsOf } from '../src/seen-state.ts'

function row(sessionId: string, extra: Partial<SessionTaskView> = {}): SessionTaskView {
  return { sessionId, status: 'idle', activity: [], ...extra }
}

describe('seen-state', () => {
  it('returns no changes before the first acknowledgement', () => {
    expect(changedSessionIds(undefined, [row('a')])).toEqual([])
  })

  it('reports appeared, changed, and disappeared sessions', () => {
    const previous = { lastSeenAt: 1, rows: seenRowsOf([row('same'), row('changed'), row('gone')]) }
    const changed = changedSessionIds(previous, [
      row('same'),
      row('changed', { status: 'running' }),
      row('appeared'),
    ])
    expect(changed.sort()).toEqual(['appeared', 'changed', 'gone'])
  })

  it('round-trips rows without inventing changes', () => {
    const rows = [row('a', { lastPromptAt: 5, outcomeAt: 6, activity: [{ kind: 'job' }] })]
    expect(changedSessionIds({ lastSeenAt: 1, rows: seenRowsOf(rows) }, rows)).toEqual([])
  })
})
