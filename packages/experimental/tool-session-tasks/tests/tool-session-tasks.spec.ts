/**
 * Read-only visibility, aggregation, and rendering behavior of the overview tool.
 */

import { SessionId } from '@deepseek-ai/dsh-session'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'
import { describe, expect, it } from 'vitest'
import {
  callerAgent, gatherSessionTasks, renderSessionTasks,
  type SessionTaskAgent, type SessionTaskHost,
} from '../src/tasks.ts'

function agent(id: string, status: SessionTaskAgent['status'], cwd?: string): SessionTaskAgent {
  return {
    session: { id: SessionId(id), header: cwd === undefined ? {} : { cwd } },
    status,
  }
}

function host(agents: readonly SessionTaskAgent[], activities: Readonly<Record<string, readonly SessionActivity[]>> = {}): SessionTaskHost {
  return {
    agents: { list: () => agents },
    activityOf: async sessionId => activities[sessionId] ?? [],
  }
}

const never = new AbortController().signal

describe('gatherSessionTasks', () => {
  it('reveals the caller and same-working-directory sessions only', async () => {
    const caller = agent('caller', 'running', '/work')
    const rows = await gatherSessionTasks(host([
      caller,
      agent('sibling', 'idle', '/work'),
      agent('outside', 'running', '/elsewhere'),
      agent('no-cwd', 'idle'),
    ]), caller, { scope: 'same-cwd' }, never)
    expect(rows.map(row => row.sessionId)).toEqual(['caller', 'sibling'])
    expect(rows[0]).toMatchObject({ cwd: '/work', status: 'running' })
  })

  it('carries title and last prompt time through the tool result', async () => {
    const caller = agent('caller', 'idle', '/work')
    const hostWithMetadata: SessionTaskHost = {
      ...host([caller]),
      metadataOf: () => ({ title: 'Fix the build', lastPromptAt: 1_760_000_000_000 }),
    }
    const rows = await gatherSessionTasks(hostWithMetadata, caller, { scope: 'same-cwd' }, never)
    expect(JSON.parse(renderSessionTasks(rows))).toEqual([expect.objectContaining({
      sessionId: 'caller', title: 'Fix the build', lastPromptAt: 1_760_000_000_000,
    })])
  })

  it('restricts the self scope to the caller and the host scope to every live session', async () => {
    const caller = agent('caller', 'idle', '/work')
    const agents = [caller, agent('sibling', 'idle', '/work'), agent('outside', 'running', '/elsewhere')]
    expect((await gatherSessionTasks(host(agents), caller, { scope: 'self' }, never)).map(row => row.sessionId))
      .toEqual(['caller'])
    expect((await gatherSessionTasks(host(agents), caller, { scope: 'host' }, never)).map(row => row.sessionId))
      .toEqual(['outside', 'caller', 'sibling'])
  })

  it('keeps only the caller when the caller has no working directory', async () => {
    const caller = agent('caller', 'idle')
    const rows = await gatherSessionTasks(host([caller, agent('other', 'idle')]), caller, { scope: 'same-cwd' }, never)
    expect(rows.map(row => row.sessionId)).toEqual(['caller'])
  })

  it('aggregates provider activity and drops filtered families', async () => {
    const caller = agent('caller', 'running', '/work')
    const rows = await gatherSessionTasks(host([caller], {
      caller: [
        { kind: 'turn' },
        { kind: 'job', items: [{ id: 'job-1', label: 'Build' }, { id: 'job-2' }] },
        { kind: 'schedule', items: [{ id: 'schedule-1', label: 'Morning review' }] },
      ],
    }), caller, { scope: 'same-cwd', include: ['job', 'schedule'] }, never)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.activity).toEqual([
      { kind: 'job', items: [{ id: 'job-1', label: 'Build' }, { id: 'job-2' }] },
      { kind: 'schedule', items: [{ id: 'schedule-1', label: 'Morning review' }] },
    ])
  })

  it('restricts the overview to one visible session id and hides an unknown or invisible id', async () => {
    const caller = agent('caller', 'idle', '/work')
    const agents = [caller, agent('sibling', 'running', '/work'), agent('outside', 'running', '/elsewhere')]
    expect((await gatherSessionTasks(host(agents), caller, { scope: 'same-cwd', sessionId: 'sibling' }, never))
      .map(row => row.sessionId)).toEqual(['sibling'])
    expect(await gatherSessionTasks(host(agents), caller, { scope: 'same-cwd', sessionId: 'outside' }, never))
      .toEqual([])
    expect(await gatherSessionTasks(host(agents), caller, { scope: 'same-cwd', sessionId: 'missing' }, never))
      .toEqual([])
  })

  it('orders running sessions before idle ones and ignores settled cancellation', async () => {
    const caller = agent('caller', 'idle', '/work')
    const rows = await gatherSessionTasks(host([
      agent('a-idle', 'idle', '/work'),
      agent('b-running', 'running', '/work'),
      agent('c-running', 'running', '/work'),
    ]), caller, { scope: 'same-cwd' }, never)
    expect(rows.map(row => row.sessionId)).toEqual(['b-running', 'c-running', 'a-idle'])
  })

  it('surfaces cancellation between sessions', async () => {
    const caller = agent('caller', 'running', '/work')
    const controller = new AbortController()
    const pending = gatherSessionTasks(host([caller, agent('sibling', 'idle', '/work')]), caller,
      { scope: 'same-cwd' }, controller.signal)
    controller.abort(new Error('cancelled by caller'))
    await expect(pending).rejects.toThrow('cancelled by caller')
  })
})

describe('renderSessionTasks', () => {
  it('renders one sentence for an empty overview', () => {
    expect(renderSessionTasks([])).toBe('No visible sessions are currently active.')
  })

  it('renders rows as JSON without losing activity identity', () => {
    const rows = [{
      sessionId: 's',
      cwd: '/work',
      status: 'running' as const,
      activity: [{ kind: 'job', items: [{ id: 'job-1', label: 'Build' }] }],
    }]
    expect(JSON.parse(renderSessionTasks(rows))).toEqual(rows)
  })
})

describe('callerAgent', () => {
  it('returns the bound agent', () => {
    const caller = agent('caller', 'idle')
    expect(callerAgent({ agent: caller })).toBe(caller)
  })

  it('rejects an unbound execution with a stable code', () => {
    let failure: unknown
    try { callerAgent({}) } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(HarnessError)
    expect(failure).toMatchObject({ code: 'SESSION_TASKS_MISSING_AGENT' })
  })
})
