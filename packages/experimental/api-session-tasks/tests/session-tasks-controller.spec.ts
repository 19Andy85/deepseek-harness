/**
 * Workspace scoping, activity aggregation, and failure behavior of the
 * session task overview Remote.
 */

import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'
import { describe, expect, it } from 'vitest'
import { collectSessionTasks, followSessionTask, observeActivity, readSessionTasks, type WorkspaceLookup } from '../src/aggregation.ts'
import type { SessionTaskAgent, SessionTaskHost } from '../src/types.ts'

function agent(id: string, status: SessionTaskAgent['status'], cwd?: string): SessionTaskAgent {
  return { session: { id: SessionId(id), header: cwd === undefined ? {} : { cwd } }, status }
}

function host(
  agents: readonly SessionTaskAgent[],
  activities: Readonly<Record<string, readonly SessionActivity[]>> = {},
  metadata: Readonly<Record<string, import('../src/types.ts').SessionTaskMetadata>> = {},
): SessionTaskHost {
  return {
    agents: { list: () => agents },
    activityOf: async sessionId => activities[sessionId] ?? [],
    metadataOf: sessionId => metadata[sessionId],
  }
}

const never = new AbortController().signal
const registry: WorkspaceLookup = {
  get: id => id === 'workspace-a' ? { id: 'workspace-a', path: '/work' }
    : id === 'workspace-empty' ? { id: 'workspace-empty', path: '/empty' }
      : undefined,
}

describe('collectSessionTasks', () => {
  it('aggregates provider activity families and keeps running sessions first', async () => {
    const rows = await collectSessionTasks(host([
      agent('idle-a', 'idle', '/work'),
      agent('running-b', 'running', '/work'),
    ], {
      'idle-a': [{ kind: 'schedule', items: [{ id: 'schedule-1', label: 'Morning review' }] }],
      'running-b': [{ kind: 'turn' }, { kind: 'job', items: [{ id: 'job-1' }] }],
    }), {}, never)
    expect(rows.map(row => row.sessionId)).toEqual(['running-b', 'idle-a'])
    expect(rows[0]?.activity).toEqual([
      { kind: 'turn' },
      { kind: 'job', items: [{ id: 'job-1' }] },
    ])
    expect(rows[1]?.activity).toEqual([{ kind: 'schedule', items: [{ id: 'schedule-1', label: 'Morning review' }] }])
  })

  it('keeps only sessions created in the requested working directory', async () => {
    const rows = await collectSessionTasks(host([
      agent('caller', 'idle', '/work'),
      agent('sibling', 'running', '/work'),
      agent('outside', 'running', '/elsewhere'),
      agent('no-cwd', 'idle'),
    ]), { cwd: '/work' }, never)
    expect(rows.map(row => row.sessionId)).toEqual(['sibling', 'caller'])
  })

  it('keeps only requested activity families', async () => {
    const rows = await collectSessionTasks(host([agent('caller', 'running', '/work')], {
      caller: [
        { kind: 'turn' },
        { kind: 'job', items: [{ id: 'job-1', label: 'Build' }] },
        { kind: 'subagent', items: [{ id: 'subagent-1' }] },
      ],
    }), { include: ['job'] }, never)
    expect(rows[0]?.activity).toEqual([{ kind: 'job', items: [{ id: 'job-1', label: 'Build' }] }])
  })

  it('includes the title, last prompt time, and blank flag reported by the owning services', async () => {
    const rows = await collectSessionTasks(host(
      [agent('caller', 'running', '/work')],
      {},
      { caller: { title: 'Fix the build', lastPromptAt: 1_760_000_000_000, blank: false } },
    ), {}, never)
    expect(rows[0]).toMatchObject({ title: 'Fix the build', lastPromptAt: 1_760_000_000_000, blank: false })
  })

  it('omits metadata fields when the owning services report none', async () => {
    const rows = await collectSessionTasks(host([agent('caller', 'running', '/work')]), {}, never)
    expect(rows[0]).not.toHaveProperty('title')
    expect(rows[0]).not.toHaveProperty('lastPromptAt')
  })

  it('surfaces cancellation between session reads', async () => {
    const controller = new AbortController()
    const pending = collectSessionTasks(host([agent('a', 'running', '/work'), agent('b', 'idle', '/work')]), {}, controller.signal)
    controller.abort(new Error('cancelled by caller'))
    await expect(pending).rejects.toThrow('cancelled by caller')
  })
})

describe('outcome metadata', () => {
  it('projects a failed turn outcome onto the row', async () => {
    const rows = await collectSessionTasks(host([agent('s', 'idle', '/work')], {}, {
      s: { outcome: 'failed', outcomeAt: 500, outcomeReason: 'provider exploded' },
    }), {}, never)
    expect(rows[0]).toMatchObject({ outcome: 'failed', outcomeAt: 500, outcomeReason: 'provider exploded' })
  })
})

describe('workspace changes metadata', () => {
  it('projects the summarized changed-file totals onto the row', async () => {
    const rows = await collectSessionTasks(host([agent('s', 'idle', '/work')], {}, {
      s: { changes: { total: 3, added: 12, deleted: 4, files: ['src/a.ts'] } },
    }), {}, never)
    expect(rows[0]?.changes).toEqual({ total: 3, added: 12, deleted: 4, files: ['src/a.ts'] })
  })
})

describe('activity timing', () => {
  it('projects provider timestamps and flags a stalled running row', async () => {
    const rows = await collectSessionTasks(host([agent('s', 'running', '/work')], {
      s: [{ kind: 'job', startedAt: 100, lastActivityAt: 100, items: [{ id: 'job-1', startedAt: 100 }] }],
    }), {}, never, { now: 1_000, stallAfterMs: 500 })
    expect(rows[0]?.activity[0]).toMatchObject({ kind: 'job', startedAt: 100, lastActivityAt: 100 })
    expect(rows[0]?.activity[0]?.items?.[0]).toMatchObject({ id: 'job-1', startedAt: 100 })
    expect(rows[0]?.stalled).toBe(true)
  })

  it('does not flag a row without timed activity', async () => {
    const rows = await collectSessionTasks(host([agent('s', 'running', '/work')], {
      s: [{ kind: 'turn' }],
    }), {}, never, { now: 10_000, stallAfterMs: 100 })
    expect(rows[0]?.stalled).toBeUndefined()
  })

  it('keeps the first sighting and refreshes the change time when items change', () => {
    const observed = new Map<string, import('../src/aggregation.ts').ObservedActivity>()
    const first = observeActivity(observed, 's', [{ kind: 'job', items: [{ id: 'a' }] }], 1_000)
    const same = observeActivity(observed, 's', [{ kind: 'job', items: [{ id: 'a' }] }], 2_000)
    const changed = observeActivity(observed, 's', [{ kind: 'job', items: [{ id: 'a' }, { id: 'b' }] }], 3_000)
    expect(first[0]).toMatchObject({ startedAt: 1_000, lastActivityAt: 1_000 })
    expect(same[0]).toMatchObject({ startedAt: 1_000, lastActivityAt: 1_000 })
    expect(changed[0]).toMatchObject({ startedAt: 1_000, lastActivityAt: 3_000 })
  })
})

describe('followSessionTask', () => {
  it('emits the row on open, after a change, and a final frame once the session is gone', async () => {
    const state = { agents: [agent('followed', 'idle', '/work')] as SessionTaskAgent[] }
    const mutable: SessionTaskHost = {
      agents: { list: () => state.agents },
      activityOf: async () => [],
    }
    const abort = new AbortController()
    const frames = followSessionTask(mutable, { sessionId: 'followed' }, 1, abort.signal)[Symbol.asyncIterator]()
    expect((await frames.next()).value).toMatchObject({ row: { status: 'idle' } })
    state.agents = [agent('followed', 'running', '/work')]
    expect((await frames.next()).value).toMatchObject({ row: { status: 'running' } })
    state.agents = []
    expect((await frames.next()).value).toEqual({ sessionId: 'followed' })
    expect((await frames.next()).done).toBe(true)
    abort.abort()
  })

  it('rejects a session that is not live when the stream opens', async () => {
    const frames = followSessionTask(host([]), { sessionId: 'missing' }, 1, never)[Symbol.asyncIterator]()
    await expect(frames.next()).rejects.toMatchObject({ code: 'session-tasks/session-not-found' })
  })
})

describe('readSessionTasks', () => {
  it('projects one workspace scope and echoes its identity and path', async () => {
    const snapshot = await readSessionTasks(host([
      agent('caller', 'idle', '/work'),
      agent('outside', 'running', '/elsewhere'),
    ]), { workspaceId: 'workspace-a' }, registry, never)
    expect(snapshot).toMatchObject({ workspaceId: 'workspace-a', workspacePath: '/work' })
    expect(snapshot.sessions.map(row => row.sessionId)).toEqual(['caller'])
  })

  it('reads every live session when no workspace is requested', async () => {
    const snapshot = await readSessionTasks(host([
      agent('caller', 'idle', '/work'),
      agent('outside', 'running', '/elsewhere'),
    ]), {}, registry, never)
    expect(snapshot.workspaceId).toBeUndefined()
    expect(snapshot.sessions.map(row => row.sessionId)).toEqual(['outside', 'caller'])
  })

  it('returns an empty session list for a workspace without live sessions', async () => {
    const snapshot = await readSessionTasks(host([agent('caller', 'idle', '/work')]), { workspaceId: 'workspace-empty' }, registry, never)
    expect(snapshot.sessions).toEqual([])
  })

  it('rejects an unknown workspace with a stable code', async () => {
    await expect(readSessionTasks(host([]), { workspaceId: 'missing' }, registry, never))
      .rejects.toMatchObject({ code: 'session-tasks/workspace-not-found' })
  })

  it('rejects a workspace request when no registry is mounted', async () => {
    await expect(readSessionTasks(host([]), { workspaceId: 'workspace-a' }, undefined, never))
      .rejects.toMatchObject({ code: 'session-tasks/workspace-unavailable' })
  })
})
