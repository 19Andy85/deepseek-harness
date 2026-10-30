/** Derivation hints among visible console rows. */

import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import { describe, expect, it } from 'vitest'
import { relationHints } from '../src/client/relations.ts'

function row(sessionId: string, activity: SessionTaskView['activity'] = []): SessionTaskView {
  return { sessionId, status: 'running', activity }
}

describe('relationHints', () => {
  it('links a visible derived session to the session that carries it as a subagent item', () => {
    const hints = relationHints([
      row('parent', [{ kind: 'subagent', items: [{ id: 'child', label: 'reviewer' }] }]),
      row('child'),
    ])
    expect(hints.parentOf.get('child')).toBe('parent')
    expect([...(hints.derivedBy.get('parent') ?? [])]).toEqual(['child'])
  })

  it('ignores subagent items that are not visible rows', () => {
    const hints = relationHints([row('parent', [{ kind: 'subagent', items: [{ id: 'gone' }] }])])
    expect(hints.parentOf.size).toBe(0)
    expect(hints.derivedBy.size).toBe(0)
  })
})
