/** Attention outside the selected Workspace. */

import { describe, expect, it } from 'vitest'
import { otherWorkspaceAttention } from '../src/client/cross-workspace.ts'

const workspaces = [
  { id: 'a', title: 'Alpha', sessionIds: ['a1', 'a2'] },
  { id: 'b', title: 'Beta', sessionIds: ['b1'] },
]

describe('otherWorkspaceAttention', () => {
  it('counts pending and unread sessions outside the selected workspace', () => {
    const result = otherWorkspaceAttention(
      new Map([
        ['a1', { pendingInteraction: { kind: 'approval' } }],
        ['b1', { completionUnread: true }],
        ['a2', { completionUnread: false }],
      ]),
      workspaces,
      'a',
    )
    expect(result).toEqual([{ workspaceId: 'b', title: 'Beta', count: 1 }])
  })

  it('returns nothing when only the selected workspace needs attention', () => {
    expect(otherWorkspaceAttention(new Map([['a1', { completionUnread: true }]]), workspaces, 'a')).toEqual([])
  })
})
