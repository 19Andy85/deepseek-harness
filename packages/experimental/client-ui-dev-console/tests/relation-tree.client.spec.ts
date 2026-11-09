/** Relation graph grouping from visible rows. */

import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import { describe, expect, it } from 'vitest'
import { relationGroups } from '../src/client/relation-tree.ts'

function row(sessionId: string, extra: Partial<SessionTaskView> = {}): SessionTaskView {
  return { sessionId, status: 'idle', activity: [], ...extra }
}

describe('relationGroups', () => {
  it('groups visible parents with visible and historical children', () => {
    const groups = relationGroups([
      row('parent', { title: 'Parent', relations: { children: [{ sessionId: 'child', live: true }, { sessionId: 'gone', depth: 1 }] } }),
      row('child', { title: 'Child', status: 'running' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.parent.title).toBe('Parent')
    expect(groups[0]?.children[0]).toMatchObject({ sessionId: 'child', title: 'Child', status: 'running' })
    expect(groups[0]?.children[1]).toEqual({ sessionId: 'gone' })
  })

  it('skips parents without durable children', () => {
    expect(relationGroups([row('a'), row('b', { relations: { children: [] } })])).toHaveLength(0)
  })

  it('walks visible grandchildren with depth and activity', () => {
    const groups = relationGroups([
      row('parent', { activity: [{ kind: 'job', items: [{ id: 'job-1', label: 'sleep 60' }] }], relations: { children: [{ sessionId: 'child' }] } }),
      row('child', { activity: [{ kind: 'turn' }], relations: { children: [{ sessionId: 'grand' }] } }),
      row('grand', { title: 'Grand', status: 'running' }),
    ])
    expect(groups[0]?.children.map(child => child.depth)).toEqual([1, 2])
    expect(groups[0]?.children[1]?.title).toBe('Grand')
    expect(groups[0]?.parent.jobs).toEqual(['sleep 60'])
    expect(groups[0]?.children[0]?.activity).toBe('turn')
  })

  it('caps listed children', () => {
    const children = Array.from({ length: 12 }, (_, index) => ({ sessionId: `c${String(index)}` }))
    const groups = relationGroups([row('parent', { relations: { children } })])
    expect(groups[0]?.children).toHaveLength(8)
  })
})
