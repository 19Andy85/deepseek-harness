/** Durable derivation slices from persisted session headers. */

import { describe, expect, it } from 'vitest'
import { buildChildRelations } from '../src/relations.ts'

describe('buildChildRelations', () => {
  it('groups subagent children by parent and keeps liveness', () => {
    const records = [
      { header: { id: 'child-a', parentSession: 'parent', origin: 'subagent' as const, delegationDepth: 1 }, live: true },
      { header: { id: 'child-b', parentSession: 'parent', origin: 'subagent' as const, delegationDepth: 1 }, live: false },
      { header: { id: 'fork', parentSession: 'parent' }, live: false },
      { header: { id: 'top' }, live: true },
    ]
    const byParent = buildChildRelations(records)
    expect(byParent.get('parent')).toEqual([
      { sessionId: 'child-a', live: true, depth: 1 },
      { sessionId: 'child-b', depth: 1 },
    ])
    expect(byParent.has('top')).toBe(false)
  })

  it('ignores subagent records without a persisted parent', () => {
    expect(buildChildRelations([{ header: { id: 'orphan', origin: 'subagent' }, live: false }]).size).toBe(0)
  })
})
