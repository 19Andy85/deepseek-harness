import { beforeEach, describe, expect, it } from 'vitest'
import {
  readActions, readDraft, readReplyDraft, writeActions, writeDraft, writeReplyDraft,
} from '../src/client/durable.ts'

describe('console durable state', () => {
  beforeEach(() => { localStorage.clear() })

  it('round-trips actions and drafts per workspace', () => {
    const actions = [{ id: 1, label: '批准一次', at: 10 }]
    writeActions('ws-a', actions)
    writeDraft('ws-a', 'prompt', 'hello')
    writeReplyDraft('session-1', 'reply')
    expect(readActions('ws-a')).toEqual(actions)
    expect(readDraft('ws-a', 'prompt')).toBe('hello')
    expect(readDraft('ws-a', 'card')).toBe('')
    expect(readReplyDraft('session-1')).toBe('reply')
    expect(readActions('ws-b')).toEqual([])
  })

  it('caps the action log and tolerates bad storage', () => {
    writeActions('ws-a', Array.from({ length: 80 }, (_, id) => ({ id, label: String(id), at: id })))
    expect(readActions('ws-a')).toHaveLength(50)
    localStorage.setItem('dsh.project-console.durable.v1:actions:ws-a', '{bad')
    expect(readActions('ws-a')).toEqual([])
  })
})
