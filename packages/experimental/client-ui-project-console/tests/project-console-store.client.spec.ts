/** Workspace selection, refresh supersession, failure retention, and coalescing of the console store. */

import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionTaskView, SessionTasksSnapshot } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectConsoleStore, type ConsoleWorkspace, type ProjectConsoleHost } from '../src/client/ProjectConsoleStore.ts'

function row(sessionId: string, status: SessionTaskView['status'] = 'running'): SessionTaskView {
  return { sessionId, status, activity: [] }
}

function snapshot(workspaceId: string, sessions: readonly SessionTaskView[]): RemoteResult<SessionTasksSnapshot> {
  return { ok: true, value: { workspaceId, sessions } }
}

function hostOf(
  workspaces: readonly ConsoleWorkspace[],
  read: (workspaceId?: string) => Promise<RemoteResult<SessionTasksSnapshot>>,
): ProjectConsoleHost & {
  readonly reads: (string | undefined)[]
  readonly opened: string[]
  readonly started: [string, string][]
  failStart: boolean
} {
  const reads: (string | undefined)[] = []
  const opened: string[] = []
  const started: [string, string][] = []
  let listener: (() => void) | undefined
  const host = {
    reads,
    opened,
    started,
    failStart: false,
    listWorkspaces: () => workspaces,
    subscribeWorkspaces: (next: () => void) => { listener = next; return () => { listener = undefined } },
    snapshot: async (workspaceId?: string) => {
      reads.push(workspaceId)
      listener?.()
      return read(workspaceId)
    },
    openSession: (sessionId: string) => { opened.push(sessionId) },
    startSession: (workspaceId: string, prompt: string) => {
      if (host.failStart) throw new Error('start refused')
      started.push([workspaceId, prompt])
    },
  }
  return host
}

const alpha: ConsoleWorkspace = { id: 'alpha', title: 'Alpha', path: '/alpha' }
const beta: ConsoleWorkspace = { id: 'beta', title: 'Beta', path: '/beta' }

afterEach(() => { vi.useRealTimers() })

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

  it('dispatches a trimmed prompt into the selected Workspace', async () => {
    const host = hostOf([alpha, beta], async id => snapshot(id ?? '', [row('one')]))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    expect(store.dispatch('  fix the build  ')).toBe(true)
    expect(host.started).toEqual([['alpha', 'fix the build']])
    expect(store.getSnapshot()).toMatchObject({ dispatch: 'idle' })
    store.dispose()
  })

  it('refuses an empty prompt or a missing Workspace without calling the host', async () => {
    const host = hostOf([], async () => ({ ok: true, value: { sessions: [] } }))
    const store = new ProjectConsoleStore(host)
    expect(store.dispatch('   ')).toBe(false)
    expect(store.dispatch('fix the build')).toBe(false)
    expect(host.started).toEqual([])
    store.dispose()
  })

  it('reports a dispatch failure and returns to the idle form state', async () => {
    const host = hostOf([alpha], async id => snapshot(id ?? '', []))
    const store = new ProjectConsoleStore(host)
    await store.refresh()
    host.failStart = true
    expect(store.dispatch('fix the build')).toBe(false)
    expect(store.getSnapshot()).toMatchObject({ dispatch: 'idle', dispatchFailed: true })
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
