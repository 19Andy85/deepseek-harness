/** Attention lane derivation, health counts, and visit comparison. */

import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import { describe, expect, it } from 'vitest'
import {
  attentionItems, healthCounts, type AttentionDescriptor,
} from '../src/client/attention.ts'
import { compareVisit, rememberVisit, type VisitMemory } from '../src/client/visit-memory.ts'

function row(sessionId: string, status: SessionTaskView['status'] = 'idle', extra: Partial<SessionTaskView> = {}): SessionTaskView {
  return { sessionId, status, activity: [], ...extra }
}

describe('attentionItems', () => {
  it('lists pending interactions before unread completions', () => {
    const descriptor = (sessionId: string): AttentionDescriptor | undefined => sessionId === 'question'
      ? { kind: 'question', firstQuestion: { id: 'q', question: 'Which?' } }
      : sessionId === 'approval' ? { kind: 'approval', toolName: 'bash', answerable: true } : undefined
    const items = attentionItems(
      [row('done', 'idle', { lastPromptAt: 300 }), row('approval', 'running'), row('question', 'running')],
      new Map([['done', { completionUnread: true }]]),
      descriptor,
    )
    expect(items.map(item => item.sessionId)).toEqual(['approval', 'question', 'done'])
    expect(items[2]?.pending).toBeUndefined()
  })

  it('keeps a running session with a pending interaction as one item', () => {
    const items = attentionItems(
      [row('running', 'running')],
      new Map([['running', { completionUnread: true }]]),
      () => ({ kind: 'approval', toolName: 'bash', answerable: true }),
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.pending?.kind).toBe('approval')
  })
})

describe('healthCounts', () => {
  it('counts running, pending, unread, and idle separately', () => {
    const descriptor = (sessionId: string): AttentionDescriptor | undefined => sessionId === 'approval'
      ? { kind: 'approval', toolName: 'bash', answerable: true } : undefined
    const counts = healthCounts(
      [
        row('running', 'running'),
        row('approval', 'running'),
        row('done', 'idle'),
        row('idle', 'idle'),
      ],
      new Map([['done', { completionUnread: true }]]),
      descriptor,
    )
    expect(counts).toEqual({ running: 1, needsYou: 1, failed: 0, completedUnread: 1, idle: 1 })
  })
})

describe('attention failures', () => {
  it('lists failed sessions after pending ones and counts them as failures', () => {
    const items = attentionItems(
      [row('failed', 'idle', { lastPromptAt: 100 }), row('pending', 'running'), row('idle', 'idle', { title: 'Idle' })],
      new Map(),
      sessionId => sessionId === 'pending' ? { kind: 'approval', toolName: 'bash', answerable: true } : undefined,
      sessionId => sessionId === 'failed' ? 'boom' : undefined,
    )
    expect(items.map(item => item.sessionId)).toEqual(['pending', 'failed'])
    expect(items[1]?.failed?.reason).toBe('boom')
    expect(healthCounts([row('failed')], new Map(), () => undefined, () => 'boom')).toMatchObject({ failed: 1 })
  })
})

describe('visit comparison', () => {
  it('reports appeared, finished, changed, and updated sessions', () => {
    const previous: VisitMemory = {
      lastSeenAt: 1,
      rows: {
        finished: { status: 'running', activityKey: 'turn' },
        changed: { status: 'idle', activityKey: 'job' },
        updated: { status: 'idle', activityKey: 'turn' },
        gone: { status: 'idle', activityKey: '' },
      },
    }
    const changes = compareVisit(previous, [
      row('finished', 'idle'),
      row('changed', 'running'),
      row('updated', 'idle', { activity: [{ kind: 'job' }] }),
      row('appeared', 'running'),
    ])
    expect(Object.fromEntries(changes)).toEqual({
      appeared: 'appeared',
      finished: 'finished',
      changed: 'status-changed',
      updated: 'updated',
      gone: 'finished',
    })
  })

  it('records a baseline without inventing changes on the first visit', () => {
    expect(compareVisit(undefined, [row('a')]).size).toBe(0)
    const memory = rememberVisit([row('a', 'running', { title: 'A', lastPromptAt: 5 })], 9)
    expect(memory).toMatchObject({ lastSeenAt: 9, rows: { a: { status: 'running', title: 'A', lastPromptAt: 5 } } })
  })
})
