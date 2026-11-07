/** Cross-workspace health and unified action item construction. */

import { describe, expect, it } from 'vitest'
import { buildSessionActionItems, buildWorkActionItems } from '../src/client/action-items.ts'
import { globalHealthCounts, globalRunningByWorkspace } from '../src/client/global-inbox.ts'

const workspaces = [
  { id: 'a', title: 'Alpha', sessionIds: ['a1', 'a2'] },
  { id: 'b', title: 'Beta', sessionIds: ['b1'] },
]

describe('globalHealthCounts', () => {
  it('counts pending, unread, running, and idle across workspaces', () => {
    const counts = globalHealthCounts(new Map([
      ['a1', { pendingInteraction: { kind: 'approval' } }],
      ['a2', { running: true }],
      ['b1', { completionUnread: true }],
    ]), workspaces)
    expect(counts).toEqual({ needsYou: 1, running: 1, completedUnread: 1, idle: 0 })
  })

  it('counts a known idle session and a running workspace', () => {
    const statuses = new Map([
      ['a1', { running: false }],
      ['a2', { running: true }],
    ])
    expect(globalHealthCounts(statuses, workspaces)).toEqual({ needsYou: 0, running: 1, completedUnread: 0, idle: 1 })
    expect(globalRunningByWorkspace(statuses, workspaces)).toEqual([{ workspaceId: 'a', title: 'Alpha', count: 1 }])
  })
})

describe('buildSessionActionItems', () => {
  it('keeps current attention titles and adds other workspace sessions once', () => {
    const items = buildSessionActionItems([
      {
        sessionId: 'a1',
        row: { sessionId: 'a1', title: 'Current work' } as never,
        pending: { kind: 'approval', toolName: 'shell', answerable: true },
      },
    ], [
      { workspaceId: 'b', title: 'Beta', items: [{ workspaceId: 'b', sessionId: 'b1', kind: 'completed' }] },
    ])
    expect(items.map(item => item.id)).toEqual(['session:a1', 'session:b1'])
    expect(items[1]).toMatchObject({ title: 'Beta', workspaceId: 'b', detailKind: 'completed' })
  })
})

describe('buildWorkActionItems', () => {
  it('preserves message and plan identity', () => {
    const items = buildWorkActionItems([
      { id: 'm1', kind: 'message', title: 'Message', detail: 'Body', action: 'handle-message' },
      { id: 'p1', kind: 'plan', title: 'Plan', detail: 'Review', planId: 'plan-1', action: 'approve-plan' },
    ])
    expect(items[0]).toMatchObject({ source: 'message', messageId: 'm1' })
    expect(items[1]).toMatchObject({ source: 'plan', planId: 'plan-1' })
  })
})
