/** Workspace selection, refresh supersession, failure retention, and coalescing of the console store. */

import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { QuestionAnswer } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type {
  SessionTaskFollowFrame, SessionTaskView, SessionTasksSnapshot,
} from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectConsoleStore, type ConsoleWorkspace, type ProjectConsoleHost } from '../src/client/ProjectConsoleStore.ts'
import type { VisitMemory } from '../src/client/visit-memory.ts'

function row(sessionId: string, status: SessionTaskView['status'] = 'running'): SessionTaskView {
  return { sessionId, status, activity: [] }
}

function snapshot(workspaceId: string, sessions: readonly SessionTaskView[]): RemoteResult<SessionTasksSnapshot> {
  return { ok: true, value: { workspaceId, sessions } }
}

function hostOf(
  workspaces: readonly ConsoleWorkspace[],
  read: (workspaceId?: string) => Promise<RemoteResult<SessionTasksSnapshot>>,
  follow?: (sessionId: string, signal: AbortSignal) => AsyncIterable<SessionTaskFollowFrame>,
): ProjectConsoleHost & {
  readonly reads: (string | undefined)[]
  readonly opened: string[]
  readonly created: string[]
  readonly prompted: [string, string, 'queue' | 'steer'][]
  readonly cancelled: string[]
  readonly responses: [string, 'allowed-once' | 'rejected'][]
  readonly answered: [string, QuestionAnswer][]
  readonly visits: [string, VisitMemory][]
  readonly acknowledged: string[]
  failCreate: boolean
  failPrompt: boolean
  failCancel: boolean
  failRespond: boolean
  failAnswer: boolean
} {
  const reads: (string | undefined)[] = []
  const opened: string[] = []
  const created: string[] = []
  const prompted: [string, string, 'queue' | 'steer'][] = []
  const cancelled: string[] = []
  const responses: [string, 'allowed-once' | 'rejected'][] = []
  const answered: [string, QuestionAnswer][] = []
  const visits: [string, VisitMemory][] = []
  const acknowledged: string[] = []
  let listener: (() => void) | undefined
  const host = {
    reads,
    opened,
    created,
    prompted,
    cancelled,
    failCreate: false,
    failPrompt: false,
    failCancel: false,
    failRespond: false,
    failAnswer: false,
    responses,
    answered,
    visits,
    acknowledged,
    follow: follow ?? (() => (async function* () {})()),
    readVisit: () => undefined,
    writeVisit: (workspaceId: string, memory: VisitMemory) => { visits.push([workspaceId, memory]) },
    acknowledge: async (workspaceId: string) => { acknowledged.push(workspaceId) },
    listWorkspaces: () => workspaces,
    subscribeWorkspaces: (next: () => void) => { listener = next; return () => { listener = undefined } },
    snapshot: async (workspaceId?: string) => {
      reads.push(workspaceId)
      listener?.()
      return read(workspaceId)
    },
    openSession: (sessionId: string) => { opened.push(sessionId) },
    createSession: async (workspaceId: string) => {
      if (host.failCreate) throw new Error('create refused')
      created.push(workspaceId)
      return 'new-session'
    },
    promptSession: async (sessionId: string, prompt: string, mode: 'queue' | 'steer') => {
      if (host.failPrompt) throw new Error('prompt refused')
      prompted.push([sessionId, prompt, mode])
    },
    cancelSession: async (sessionId: string) => {
      if (host.failCancel) throw new Error('cancel refused')
      cancelled.push(sessionId)
    },
    respondApproval: async (sessionId: string, decision: 'allowed-once' | 'rejected') => {
      if (host.failRespond) throw new Error('approval refused')
      responses.push([sessionId, decision])
    },
    answerQuestion: async (sessionId: string, answer: QuestionAnswer) => {
      if (host.failAnswer) throw new Error('question refused')
      answered.push([sessionId, answer])
    },
  }
  return host
}

const alpha: ConsoleWorkspace = { id: 'alpha', title: 'Alpha', path: '/alpha' }
const beta: ConsoleWorkspace = { id: 'beta', title: 'Beta', path: '/beta' }

afterEach(() => { vi.useRealTimers() })

describe('ProjectConsoleStore focus', () => {
  it('follows a focused session, updates its row, and ends when the session stops being live', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const follow = (_sessionId: string): AsyncIterable<SessionTaskFollowFrame> => (async function* () {
      yield { sessionId: 's1', row: row('s1') }
      await gate
      yield { sessionId: 's1' }
    })()
    const store = new ProjectConsoleStore(hostOf(
      [{ id: 'ws', title: 'Workspace', path: '/work' }],
      async () => snapshot('ws', []),
      follow,
    ))
    store.selectWorkspace('ws')
    store.focusSession('s1')
    await vi.waitFor(() => {
      expect(store.getSnapshot().focus).toMatchObject({ phase: 'live', row: { sessionId: 's1' } })
    })
    release()
    await vi.waitFor(() => { expect(store.getSnapshot().focus?.phase).toBe('ended') })
    expect(store.getSnapshot().focus?.timeline.map(entry => entry.kind)).toEqual(['baseline', 'ended'])
    store.dispose()
  })

  it('closes the focus and aborts its stream', async () => {
    let seen: AbortSignal | undefined
    const follow = (_sessionId: string, signal: AbortSignal): AsyncIterable<SessionTaskFollowFrame> => {
      seen = signal
      return (async function* () {
        await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      })()
    }
    const store = new ProjectConsoleStore(hostOf(
      [{ id: 'ws', title: 'Workspace', path: '/work' }],
      async () => snapshot('ws', []),
      follow,
    ))
    store.selectWorkspace('ws')
    store.focusSession('s1')
    await vi.waitFor(() => { expect(seen).toBeDefined() })
    store.closeFocus()
    expect(store.getSnapshot().focus).toBeUndefined()
    expect(seen?.aborted).toBe(true)
    store.dispose()
  })
})

describe('ProjectConsoleStore', () => {
  it('reads the first Workspace and publishes its rows', async () => {
    const host = hostOf([alpha, beta], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    expect(host.reads).toEqual(['alpha'])
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', workspaceId: 'alpha' })
    expect(store.getSnapshot().sessions.map(session => session.sessionId)).toEqual(['one'])
    store.dispose()
  })

  it('selects another Workspace and keeps only the latest read visible', async () => {
    const pending = new Map<string, (value: RemoteResult<SessionTasksSnapshot>) => void>()
    const host = hostOf([alpha, beta], id => new Promise((resolve) => { pending.set(id ?? '', resolve) }))
    const store = new ProjectConsoleStore(host)
    const first = store.refresh()
    const second = store.selectWorkspace('beta')
    await Promise.resolve()
    await Promise.resolve()
    pending.get('alpha')?.(snapshot('alpha', [row('one')]))
    await first
    expect(store.getSnapshot().workspaceId).toBe('beta')
    await Promise.resolve()
    await Promise.resolve()
    pending.get('beta')?.(snapshot('beta', [row('two')]))
    await second
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', workspaceId: 'beta' })
    expect(store.getSnapshot().sessions.map(session => session.sessionId)).toEqual(['two'])
    store.dispose()
  })

  it('keeps the previous rows visible when a refresh fails', async () => {
    let calls = 0
    const host = hostOf([alpha], async () => {
      calls += 1
      return calls === 1
        ? snapshot('alpha', [row('one')])
        : { ok: false, error: new RemoteError('session-tasks/workspace-not-found', 'workspace is not registered', {}) }
    })
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    await store.refresh()
    expect(store.getSnapshot()).toMatchObject({ status: 'error', workspaceId: 'alpha', error: 'workspace is not registered' })
    expect(store.getSnapshot().sessions.map(session => session.sessionId)).toEqual(['one'])
    store.dispose()
  })

  it('coalesces event-triggered refreshes into one read', async () => {
    vi.useFakeTimers()
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    store.scheduleRefresh()
    store.scheduleRefresh()
    store.scheduleRefresh()
    await vi.advanceTimersByTimeAsync(200)
    expect(host.reads).toEqual(['alpha'])
    store.dispose()
  })

  it('opens a session in its Conversation through the host port', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    store.openSession('one')
    expect(host.opened).toEqual(['one'])
    store.dispose()
  })

  it('creates a session, sends its trimmed first prompt, and opens it', async () => {
    const host = hostOf([alpha, beta], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    expect(await store.dispatch('  fix the build  ')).toBe(true)
    expect(host.created).toEqual(['alpha'])
    expect(host.prompted).toEqual([['new-session', 'fix the build', 'queue']])
    expect(host.opened).toEqual(['new-session'])
    expect(store.getSnapshot()).toMatchObject({ dispatch: 'idle', dispatchFailed: undefined })
    store.dispose()
  })

  it('refuses an empty prompt or a missing Workspace without calling the host', async () => {
    const host = hostOf([], async () => ({ ok: true, value: { sessions: [] } }))
    const store = new ProjectConsoleStore(host)
    expect(await store.dispatch('   ')).toBe(false)
    expect(await store.dispatch('fix the build')).toBe(false)
    expect(host.created).toEqual([])
    store.dispose()
  })

  it('reports a prompt failure, keeps the session unopened, and returns to idle', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', []))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    host.failPrompt = true
    expect(await store.dispatch('fix the build')).toBe(false)
    expect(host.opened).toEqual([])
    expect(store.getSnapshot()).toMatchObject({ dispatch: 'idle', dispatchFailed: true })
    store.dispose()
  })

  it('reports a creation failure and returns to idle', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', []))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    host.failCreate = true
    expect(await store.dispatch('fix the build')).toBe(false)
    expect(host.prompted).toEqual([])
    expect(store.getSnapshot()).toMatchObject({ dispatch: 'idle', dispatchFailed: true })
    store.dispose()
  })

  it('sends a prompt into an existing Session with the requested mode', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    expect(await store.sendToSession('one', '  continue  ', 'steer')).toBe(true)
    expect(host.prompted).toEqual([['one', 'continue', 'steer']])
    expect(store.getSnapshot()).toMatchObject({ busySessionId: undefined, actionFailed: undefined })
    store.dispose()
  })

  it('reports a prompt failure without pretending the row sent', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    host.failPrompt = true
    expect(await store.sendToSession('one', 'continue', 'queue')).toBe(false)
    expect(store.getSnapshot()).toMatchObject({ busySessionId: undefined, actionFailed: true })
    store.dispose()
  })

  it('cancels an active turn and refreshes the overview', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    expect(await store.cancelSession('one')).toBe(true)
    expect(host.cancelled).toEqual(['one'])
    expect(store.getSnapshot()).toMatchObject({ busySessionId: undefined, actionFailed: undefined })
    store.dispose()
  })

  it('reports a cancellation failure', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    host.failCancel = true
    expect(await store.cancelSession('one')).toBe(false)
    expect(store.getSnapshot()).toMatchObject({ busySessionId: undefined, actionFailed: true })
    store.dispose()
  })

  it('answers a pending approval with the requested decision', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    expect(await store.answerApproval('one', 'allowed-once')).toBe(true)
    expect(host.responses).toEqual([['one', 'allowed-once']])
    expect(store.getSnapshot()).toMatchObject({ busySessionId: undefined, actionFailed: undefined })
    store.dispose()
  })

  it('reports an approval failure', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    host.failRespond = true
    expect(await store.answerApproval('one', 'rejected')).toBe(false)
    expect(store.getSnapshot()).toMatchObject({ busySessionId: undefined, actionFailed: true })
    store.dispose()
  })

  it('submits a complete answer batch to a pending question', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    const answer = { answers: [{ id: 'q1', selected: ['Approval work'] }] }
    expect(await store.answerQuestion('one', answer)).toBe(true)
    expect(host.answered).toEqual([['one', answer]])
    expect(store.getSnapshot()).toMatchObject({ busySessionId: undefined, actionFailed: undefined })
    store.dispose()
  })

  it('reports a question answer failure', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    host.failAnswer = true
    expect(await store.answerQuestion('one', { answers: [{ id: 'q1', selected: [] }] })).toBe(false)
    expect(store.getSnapshot()).toMatchObject({ busySessionId: undefined, actionFailed: true })
    store.dispose()
  })

  it('stops publishing after disposal', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    const listener = vi.fn()
    store.subscribe(listener)
    store.dispose()
    await store.refresh()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('ProjectConsoleStore overlapping reads', () => {
  it('coalesces reads of the same workspace', async () => {
    let reads = 0
    let release: (() => void) | undefined
    const host = hostOf(
      [{ id: 'ws', title: 'Workspace', path: '/work' }],
      async () => {
        reads += 1
        await new Promise<void>((resolve) => { release = resolve })
        return snapshot('ws', [row('a')])
      },
    )
    const store = new ProjectConsoleStore(host)
    const first = store.selectWorkspace('ws')
    const second = store.refresh()
    expect(reads).toBe(1)
    release?.()
    await Promise.all([first, second])
    expect(store.getSnapshot().status).toBe('ready')
  })
})

describe('ProjectConsoleStore workspace switching', () => {
  it('clears the previous rows when switching workspaces', async () => {
    const host = hostOf(
      [{ id: 'a', title: 'A', path: '/a' }, { id: 'b', title: 'B', path: '/b' }],
      async workspaceId => snapshot(workspaceId ?? 'a', [row(workspaceId === 'b' ? 'b1' : 'a1')]),
    )
    const store = new ProjectConsoleStore(host)
    await store.selectWorkspace('a')
    expect(store.getSnapshot().sessions[0]?.sessionId).toBe('a1')
    const pending = store.selectWorkspace('b')
    expect(store.getSnapshot().sessions).toEqual([])
    await pending
    expect(store.getSnapshot().sessions[0]?.sessionId).toBe('b1')
    const back = store.selectWorkspace('a')
    expect(store.getSnapshot().status).toBe('ready')
    expect(store.getSnapshot().sessions[0]?.sessionId).toBe('a1')
    await back
  })
})

describe('ProjectConsoleStore periodic refresh', () => {
  it('keeps the ready state while re-reading the same workspace', async () => {
    const host = hostOf(
      [{ id: 'ws', title: 'Workspace', path: '/work' }],
      async () => snapshot('ws', [row('a')]),
    )
    const store = new ProjectConsoleStore(host)
    await store.selectWorkspace('ws')
    expect(store.getSnapshot().status).toBe('ready')
    const pending = store.refresh()
    expect(store.getSnapshot().status).toBe('ready')
    await pending
    expect(store.getSnapshot().status).toBe('ready')
  })
})

describe('ProjectConsoleStore server read state', () => {
  it('prefers the Host changes and last-seen time, and acknowledges on dispose', async () => {
    const host = hostOf(
      [{ id: 'ws', title: 'Workspace', path: '/work' }],
      async () => ({ ok: true, value: { workspaceId: 'ws', sessions: [row('a')], changes: ['a'], lastSeenAt: 42 } }),
    )
    const store = new ProjectConsoleStore(host)
    await store.selectWorkspace('ws')
    expect(store.getSnapshot().lastSeenAt).toBe(42)
    expect([...(store.getSnapshot().changes?.keys() ?? [])]).toEqual(['a'])
    store.dispose()
    expect(host.acknowledged).toContain('ws')
  })
})

describe('ProjectConsoleStore visit memory', () => {
  it('summarizes changes against the previous visit and records the next baseline', async () => {
    const host = hostOf(
      [{ id: 'ws', title: 'Workspace', path: '/work' }],
      async () => snapshot('ws', [row('finished', 'idle'), row('new-row')]),
    )
    host.readVisit = (): VisitMemory => ({
      lastSeenAt: 1_700_000_000_000,
      rows: { finished: { status: 'running', activityKey: '' } },
    })
    const store = new ProjectConsoleStore(host)
    await store.selectWorkspace('ws')
    const state = store.getSnapshot()
    expect(state.lastSeenAt).toBe(1_700_000_000_000)
    expect(Object.fromEntries(state.changes ?? [])).toEqual({ 'new-row': 'appeared', finished: 'finished' })
    const writes = host.visits.filter(([workspaceId]) => workspaceId === 'ws')
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.at(-1)?.[1].rows['new-row']?.status).toBe('running')
    store.dispose()
  })
})

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => { data.clear() },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size },
  }
}

describe('ProjectConsoleStore shift counters', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('counts dispatched, interrupted, answered, appeared, and observed completion events', async () => {
    vi.stubGlobal('localStorage', memoryStorage())
    let current = [row('a', 'running')]
    const store = new ProjectConsoleStore(hostOf(
      [{ id: 'ws', title: 'Workspace', path: '/work' }],
      async () => snapshot('ws', current),
    ))
    await store.selectWorkspace('ws')
    await store.dispatch('hello')
    await store.cancelSession('a')
    await store.answerApproval('a', 'allowed-once')
    current = [row('a', 'idle'), row('b', 'running')]
    await store.refresh()
    expect(store.getSnapshot().shift).toMatchObject({
      dispatched: 1,
      interrupted: 1,
      approvals: 1,
      completed: 1,
      newSession: 1,
    })
    store.dispose()
  })
})
