/** @vitest-environment jsdom */
/** Unified block action dispatch: Host-owned status, idempotent clicks, and reload recovery. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerChoiceBlock } from '../src/client/ChoiceBlock.tsx'
import { renderInteractiveBlock, type InteractiveBlockSpec } from '../src/client/block-registry.tsx'
import {
  dispatchBlockAction, readBlockState, setBlockActionDispatcher, setBlockStateReader,
  type BlockActionInput, type BlockActionOutcome, type BlockStateSnapshot,
} from '../src/client/block-actions.ts'
import '../src/client/TaskProposalCard.tsx'

const SESSION = 'session-1'

function t(key: string): string {
  return key
}

function option(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

interface FakeHost {
  readonly calls: BlockActionInput[]
  readonly executed: Map<string, BlockActionOutcome>
  setState(snapshot: BlockStateSnapshot): void
  failNext(error: Error): void
}

function fakeHost(initial: BlockStateSnapshot): FakeHost {
  const calls: BlockActionInput[] = []
  const executed = new Map<string, BlockActionOutcome>()
  let state = initial
  let rejection: Error | undefined
  setBlockActionDispatcher(async (input) => {
    calls.push(input)
    if (rejection !== undefined) {
      const error = rejection
      rejection = undefined
      throw error
    }
    const stored = executed.get(input.idempotencyKey)
    if (stored !== undefined) return { ...stored, replayed: true }
    const outcome: BlockActionOutcome = {
      blockId: input.blockId, actionId: input.actionId, status: 'resolved', replayed: false,
      result: JSON.stringify({ actionId: input.actionId }),
    }
    executed.set(input.idempotencyKey, outcome)
    return outcome
  })
  setBlockStateReader(async () => state)
  return {
    calls,
    executed,
    setState: (snapshot) => { state = snapshot },
    failNext: (error) => { rejection = error },
  }
}

function choiceBlock(overrides: Partial<InteractiveBlockSpec> = {}): InteractiveBlockSpec {
  return { version: 1, type: 'choice', props: { options: ['A', 'B'] }, blockId: 'block-1', actions: ['A', 'B'], status: 'pending', ...overrides }
}

function renderBlock(block: InteractiveBlockSpec): void {
  render(<>{renderInteractiveBlock(block, { t, sessionId: SESSION })}</>)
}

const pending: BlockStateSnapshot = { blockId: 'block-1', status: 'pending', actions: ['A', 'B'] }

beforeEach(() => {
  registerChoiceBlock()
})

afterEach(() => {
  cleanup()
  setBlockActionDispatcher(undefined)
  setBlockStateReader(undefined)
})

describe('choice block dispatch', () => {
  it('sends one Host action for one click and keeps the result Host-owned', async () => {
    const host = fakeHost(pending)
    renderBlock(choiceBlock())
    fireEvent.click(option('A'))
    await waitFor(() => { expect(host.calls).toHaveLength(1) })
    expect(host.calls[0]).toEqual({
      blockId: 'block-1', actionId: 'A', sessionId: SESSION, idempotencyKey: expect.any(String),
    })
    await waitFor(() => { expect(option('A').disabled).toBe(true) })
    fireEvent.click(option('A'))
    expect(host.calls).toHaveLength(1)
  })

  it('reuses the gesture key when a click is retried after a failure', async () => {
    const host = fakeHost(pending)
    host.failNext(new Error('the Host did not answer'))
    renderBlock(choiceBlock())
    fireEvent.click(option('A'))
    await screen.findByRole('alert')
    fireEvent.click(option('A'))
    await waitFor(() => { expect(host.calls).toHaveLength(2) })
    expect(host.calls[0]?.idempotencyKey).toBe(host.calls[1]?.idempotencyKey)
    await waitFor(() => { expect(host.executed.size).toBe(1) })
  })

  it('renders the status the Host stored after a reload', async () => {
    const host = fakeHost({
      blockId: 'block-1', status: 'resolved', actions: ['A', 'B'], actionId: 'B', result: '{"actionId":"B"}',
    })
    renderBlock(choiceBlock())
    await waitFor(() => { expect(option('B').disabled).toBe(true) })
    expect(option('A').disabled).toBe(true)
    expect(host.calls).toEqual([])
  })

  it('offers no action for a block with no Host registration', () => {
    const host = fakeHost(pending)
    renderBlock(choiceBlock({ blockId: undefined }))
    expect(option('A').disabled).toBe(true)
    expect(host.calls).toEqual([])
  })

  it('falls back for a choice block without usable options', () => {
    renderBlock(choiceBlock({ props: {} }))
    expect(document.querySelector('[data-interactive-block-fallback]')).not.toBeNull()
    cleanup()
    renderBlock(choiceBlock({ props: { options: [1, 'A'] } }))
    expect(document.querySelector('[data-interactive-block-fallback]')).toBeNull()
  })

  it('reports a rejected action and keeps the block pending', async () => {
    const host = fakeHost(pending)
    host.failNext(new Error('block is expired'))
    renderBlock(choiceBlock())
    fireEvent.click(option('A'))
    expect((await screen.findByRole('alert')).textContent).toBe('blockActionFailed')
    expect(option('A').disabled).toBe(false)
  })
})

describe('task proposal block dispatch', () => {
  const proposal = {
    messageId: 'message-1', title: 'Ship it', goal: 'Ship the bridge', acceptance: 'Bridge works',
    steps: [{ title: 'Implement', outcome: 'Bridge exists' }],
  }
  const block: InteractiveBlockSpec = {
    version: 1, type: 'task-proposal', props: { messageId: 'message-1', proposal },
    blockId: 'block-1', actions: ['confirm', 'ignore'], status: 'pending',
  }

  it('confirms through the block action, not a card-local decision', async () => {
    const calls: BlockActionInput[] = []
    setBlockStateReader(async () => ({ blockId: 'block-1', status: 'pending', actions: ['confirm', 'ignore'] }))
    setBlockActionDispatcher(async (input) => {
      calls.push(input)
      return {
        blockId: input.blockId, actionId: input.actionId, status: 'resolved', replayed: false,
        result: JSON.stringify({ status: 'accepted', messageId: 'message-1', briefId: 'brief-1' }),
      }
    })
    renderBlock(block)
    fireEvent.click(option('proposalCardConfirm'))
    await screen.findByText('proposalCardAccepted')
    expect(calls[0]).toMatchObject({ blockId: 'block-1', actionId: 'confirm', sessionId: SESSION, payload: '{}' })
  })

  it('shows the decided state read from the Host after a reload', async () => {
    const host = fakeHost({
      blockId: 'block-1', status: 'resolved', actions: ['confirm', 'ignore'], actionId: 'ignore',
      result: '{"status":"dismissed","messageId":"message-1"}',
    })
    renderBlock(block)
    await screen.findByText('proposalCardDismissed')
    expect(host.calls).toEqual([])
  })

  it('keeps the card pending and reports a failed action', async () => {
    const host = fakeHost(pending)
    host.failNext(new Error('proposal is already decided'))
    renderBlock(block)
    fireEvent.click(option('proposalCardIgnore'))
    await screen.findByText('proposalCardFailed')
    expect(option('proposalCardConfirm').disabled).toBe(false)
  })
})

describe('block action bridge', () => {
  it('fails loud when the client plugin installed no Host bridge', async () => {
    await expect(dispatchBlockAction({
      blockId: 'block-1', actionId: 'A', sessionId: SESSION, idempotencyKey: 'key-1',
    })).rejects.toThrow('bridge is unavailable')
    setBlockActionDispatcher(async () => ({ blockId: 'block-1', actionId: 'A', status: 'resolved', replayed: false }))
    await expect(readBlockState({ blockId: 'block-1', sessionId: SESSION })).rejects.toThrow('bridge is unavailable')
  })
})
