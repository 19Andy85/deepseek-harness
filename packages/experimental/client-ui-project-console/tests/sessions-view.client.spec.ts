/** Console row projection: placeholder filtering and relevance order. */

import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import { describe, expect, it } from 'vitest'
import { runningCount, visibleSessions } from '../src/client/sessions-view.ts'

function row(sessionId: string, status: SessionTaskView['status'], extra: Partial<SessionTaskView> = {}): SessionTaskView {
  return { sessionId, status, activity: [], ...extra }
}

describe('visibleSessions', () => {
  it('hides blank placeholder sessions', () => {
    const rows = visibleSessions([row('blank', 'idle', { blank: true }), row('real', 'idle')])
    expect(rows.map(item => item.sessionId)).toEqual(['real'])
  })

  it('orders running rows first, then by latest prompt time', () => {
    const rows = visibleSessions([
      row('old-idle', 'idle', { lastPromptAt: 100 }),
      row('new-idle', 'idle', { lastPromptAt: 300 }),
      row('running', 'running', { lastPromptAt: 200 }),
      row('no-time', 'idle'),
    ])
    expect(rows.map(item => item.sessionId)).toEqual(['running', 'new-idle', 'old-idle', 'no-time'])
  })

  it('counts running rows only among the visible ones', () => {
    expect(runningCount(visibleSessions([
      row('running', 'running'),
      row('idle', 'idle'),
      row('blank-running', 'running', { blank: true }),
    ]))).toBe(1)
  })
})
