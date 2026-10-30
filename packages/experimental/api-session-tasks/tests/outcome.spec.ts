/** Fold of turn events into the last outcome. */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { sessionTaskOutcomeProjection as projection } from '../src/outcome.ts'

function event<K extends SessionEvent['type']>(type: K, time: number, data: Extract<SessionEvent, { type: K }>['data']): SessionEvent {
  return { type, seq: 1, time, data } as SessionEvent
}

describe('sessionTaskOutcome projection', () => {
  it('records the failure message and code of a failed turn', () => {
    const state = projection.apply(
      projection.apply({}, event('turn/start', 100, { turn: 2 })),
      event('turn/end', 200, { turn: 2, reason: { kind: 'error', error: { message: 'provider exploded', code: 'PROVIDER_ERROR' } } }),
    )
    expect(state).toEqual({ kind: 'failed', turn: 2, at: 200, reason: 'provider exploded', code: 'PROVIDER_ERROR' })
  })

  it('maps completion, cancellation, blocking, and truncation', () => {
    const end = (reason: unknown, time: number) => projection.apply({}, event('turn/end', time, { turn: 1, reason } as never))
    expect(end({ kind: 'completed' }, 10)).toMatchObject({ kind: 'completed', at: 10 })
    expect(end({ kind: 'aborted', reason: 'user' }, 11)).toMatchObject({ kind: 'cancelled' })
    expect(end({ kind: 'blocked' }, 12)).toMatchObject({ kind: 'blocked' })
    expect(end({ kind: 'max-tokens' }, 13)).toMatchObject({ kind: 'truncated' })
  })

  it('clears the previous outcome when a new turn starts', () => {
    const finished = projection.apply({}, event('turn/end', 20, { turn: 1, reason: { kind: 'completed' } }))
    expect(projection.apply(finished, event('turn/start', 30, { turn: 2 }))).toEqual({ turn: 2, at: 30 })
  })
})
