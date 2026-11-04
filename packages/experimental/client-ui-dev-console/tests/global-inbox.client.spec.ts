/** Global inbox grouping and ordering. */

import { describe, expect, it } from 'vitest'
import { globalInboxCount, globalInboxGroups } from '../src/client/global-inbox.ts'

const workspaces = [
  { id: 'a', title: 'Alpha', sessionIds: ['a1', 'a2'] },
  { id: 'b', title: 'Beta', sessionIds: ['b1'] },
]

describe('globalInboxGroups', () => {
  it('groups waiting sessions per workspace, pending before completed', () => {
    const groups = globalInboxGroups(new Map([
      ['a1', { completionUnread: true }],
      ['a2', { pendingInteraction: { kind: 'plan-review' } }],
      ['b1', { pendingInteraction: { kind: 'question' } }],
    ]), workspaces)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ workspaceId: 'a', title: 'Alpha' })
    expect(groups[0]?.items.map(item => item.kind)).toEqual(['plan-review', 'completed'])
    expect(groups[1]?.items[0]).toMatchObject({ sessionId: 'b1', kind: 'question' })
    expect(globalInboxCount(groups)).toBe(3)
  })

  it('skips workspaces without waiting sessions', () => {
    expect(globalInboxGroups(new Map([['a2', { completionUnread: false }]]), workspaces)).toEqual([])
  })
})
