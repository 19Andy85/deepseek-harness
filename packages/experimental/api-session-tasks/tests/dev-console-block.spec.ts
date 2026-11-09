/**
 * Interactive block registration, the Host-owned status machine, and
 * idempotent action execution over a bus-shaped port.
 */
import { describe, expect, it } from 'vitest'
import { devConsoleBusDomain } from '../src/dev-console-bus.ts'
import {
  DevConsoleBlockActionError, createDevConsoleBlock,
  executeDevConsoleBlockAction, readDevConsoleBlockState,
  type DevConsoleBlock, type DevConsoleBlockActionRecord,
} from '../src/dev-console-block.ts'

function choiceBlock(overrides: Partial<DevConsoleBlock> = {}): DevConsoleBlock {
  return {
    id: 'block-1', sessionId: 'session-1', type: 'choice', props: { options: ['A', 'B'] },
    actions: ['A', 'B'], status: 'pending', createdAt: 1, updatedAt: 1, ...overrides,
  }
}

function fixture(blocks: readonly DevConsoleBlock[] = [choiceBlock()], records: readonly DevConsoleBlockActionRecord[] = []) {
  const state = { blocks: [...blocks], records: [...records] }
  let commits = 0
  return {
    state,
    commits: () => commits,
    port: {
      blocks: () => state.blocks,
      records: () => state.records,
      commit: async (next: {
        readonly blocks: readonly DevConsoleBlock[]
        readonly blockActions: readonly DevConsoleBlockActionRecord[]
      }) => {
        commits += 1
        state.blocks = [...next.blocks]
        state.records = [...next.blockActions]
      },
    },
  }
}

const request = {
  blockId: 'block-1', actionId: 'A', sessionId: 'session-1', idempotencyKey: 'key-1',
}

describe('dev console bus compatibility', () => {
  it('opens bus records written before blocks existed', () => {
    const legacy = { messages: [], briefs: [] }
    const parsed = devConsoleBusDomain.global.schema.parse(legacy)
    expect(parsed.blocks).toEqual([])
    expect(parsed.blockActions).toEqual([])
    // Round-tripping the upgraded record keeps the added lists.
    expect(devConsoleBusDomain.global.schema.parse(parsed).blockActions).toEqual([])
  })
})

describe('createDevConsoleBlock', () => {
  it('registers a pending block and keeps one entry per action id', () => {
    const created = createDevConsoleBlock({
      sessionId: 'session-1', type: 'choice', props: { options: ['A', 'A', 'B'] }, actions: ['A', 'A', 'B'],
    }, 42)
    expect(created.status).toBe('pending')
    expect(created.actions).toEqual(['A', 'B'])
    expect(created.createdAt).toBe(42)
    expect(created.updatedAt).toBe(42)
  })
})

describe('executeDevConsoleBlockAction', () => {
  it('executes once and replays the stored result for the same key', async () => {
    const { port, state, commits } = fixture()
    const runs: string[] = []
    const run = async (_block: DevConsoleBlock, action: { readonly actionId: string }): Promise<string> => {
      runs.push(action.actionId)
      return JSON.stringify({ actionId: action.actionId })
    }
    const first = await executeDevConsoleBlockAction(port, new Map(), request, run)
    expect(first).toEqual({
      blockId: 'block-1', actionId: 'A', status: 'resolved', replayed: false, result: '{"actionId":"A"}',
    })
    const second = await executeDevConsoleBlockAction(port, new Map(), request, run)
    expect(second.replayed).toBe(true)
    expect(second.result).toBe(first.result)
    expect(runs).toEqual(['A'])
    expect(commits()).toBe(1)
    expect(state.blocks[0]?.status).toBe('resolved')
    expect(state.records).toHaveLength(1)
    expect(state.records[0]).toMatchObject({
      blockId: 'block-1', actionId: 'A', sessionId: 'session-1', idempotencyKey: 'key-1',
    })
  })

  it('runs one execution for two concurrent clicks of the same key', async () => {
    const { port, commits } = fixture()
    let runs = 0
    const run = async (): Promise<string> => {
      runs += 1
      return JSON.stringify({ actionId: 'A' })
    }
    const locks = new Map<string, Promise<void>>()
    const [left, right] = await Promise.all([
      executeDevConsoleBlockAction(port, locks, request, run),
      executeDevConsoleBlockAction(port, locks, request, run),
    ])
    expect(runs).toBe(1)
    expect(commits()).toBe(1)
    expect([left.replayed, right.replayed].sort()).toEqual([false, true])
    expect(left.result).toBe(right.result)
  })

  it('rejects a second action with a fresh key once the block resolved', async () => {
    const { port, commits } = fixture()
    const run = async (): Promise<string> => JSON.stringify({ actionId: 'A' })
    await executeDevConsoleBlockAction(port, new Map(), request, run)
    await expect(executeDevConsoleBlockAction(port, new Map(), { ...request, actionId: 'B', idempotencyKey: 'key-2' }, run))
      .rejects.toMatchObject({ code: 'block-not-actionable' })
    expect(commits()).toBe(1)
  })

  it('rejects a key already used by another block action', async () => {
    const { port } = fixture()
    const run = async (): Promise<string> => JSON.stringify({ actionId: 'A' })
    await executeDevConsoleBlockAction(port, new Map(), request, run)
    await expect(executeDevConsoleBlockAction(port, new Map(), { ...request, actionId: 'B' }, run))
      .rejects.toMatchObject({ code: 'block-idempotency-conflict' })
  })

  it('replays a kept record whose block was pruned from the bus', async () => {
    const record = {
      blockId: 'block-gone', actionId: 'A', sessionId: 'session-1', idempotencyKey: 'key-1',
      result: '{"actionId":"A"}', at: 5,
    }
    const { port } = fixture([], [record])
    const run = async (): Promise<string> => { throw new Error('the pruned block must not run') }
    const value = await executeDevConsoleBlockAction(port, new Map(), { ...request, blockId: 'block-gone' }, run)
    expect(value).toEqual({ blockId: 'block-gone', actionId: 'A', status: 'resolved', replayed: true, result: '{"actionId":"A"}' })
  })

  it('rejects a missing block, a foreign Session, and an undeclared action', async () => {
    const run = async (): Promise<string> => JSON.stringify({})
    const { port } = fixture()
    await expect(executeDevConsoleBlockAction(port, new Map(), { ...request, blockId: 'block-x' }, run))
      .rejects.toMatchObject({ code: 'block-not-found' })
    await expect(executeDevConsoleBlockAction(port, new Map(), { ...request, sessionId: 'session-2' }, run))
      .rejects.toMatchObject({ code: 'block-session-mismatch' })
    await expect(executeDevConsoleBlockAction(port, new Map(), { ...request, actionId: 'C' }, run))
      .rejects.toMatchObject({ code: 'block-action-unknown' })
  })

  it('accepts no new action while submitted or expired', async () => {
    const run = async (): Promise<string> => JSON.stringify({})
    for (const status of ['submitted', 'expired'] as const) {
      const { port } = fixture([choiceBlock({ status })])
      await expect(executeDevConsoleBlockAction(port, new Map(), request, run))
        .rejects.toMatchObject({ code: 'block-not-actionable' })
    }
  })

  it('keeps the block pending when the action itself fails, then retries the same key', async () => {
    const { port, state } = fixture()
    const failure = new Error('proposal is already decided')
    let attempts = 0
    const run = async (): Promise<string> => {
      attempts += 1
      if (attempts === 1) throw failure
      return JSON.stringify({ status: 'accepted' })
    }
    await expect(executeDevConsoleBlockAction(port, new Map(), request, run)).rejects.toBe(failure)
    expect(state.blocks[0]?.status).toBe('pending')
    expect(state.records).toEqual([])
    const retried = await executeDevConsoleBlockAction(port, new Map(), request, run)
    expect(retried.replayed).toBe(false)
    expect(retried.result).toBe('{"status":"accepted"}')
    expect(state.blocks[0]?.status).toBe('resolved')
    expect(state.records).toHaveLength(1)
  })
})

describe('readDevConsoleBlockState', () => {
  it('reports the stored status and the last action value', async () => {
    const { port, state } = fixture()
    expect(readDevConsoleBlockState(state.blocks, state.records, { blockId: 'block-1', sessionId: 'session-1' }))
      .toEqual({ blockId: 'block-1', status: 'pending', actions: ['A', 'B'] })
    await executeDevConsoleBlockAction(port, new Map(), request, async () => JSON.stringify({ actionId: 'A' }))
    expect(readDevConsoleBlockState(state.blocks, state.records, { blockId: 'block-1', sessionId: 'session-1' }))
      .toEqual({ blockId: 'block-1', status: 'resolved', actions: ['A', 'B'], actionId: 'A', result: '{"actionId":"A"}' })
  })

  it('rejects a foreign Session and an unknown block', () => {
    expect(() => readDevConsoleBlockState([choiceBlock()], [], { blockId: 'block-1', sessionId: 'session-2' }))
      .toThrow(DevConsoleBlockActionError)
    expect(() => readDevConsoleBlockState([], [], { blockId: 'block-1', sessionId: 'session-1' }))
      .toThrow(DevConsoleBlockActionError)
  })
})
