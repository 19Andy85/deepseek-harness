/**
 * Browser bridge to the Host block action protocol.
 *
 * Every interactive block dispatches through this module: the component mints
 * one idempotency key per gesture and the Host decides whether that key executes
 * or replays. A block's status is rendered from Host values only; the browser
 * never moves it on its own.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'

/** Host-owned block status; only the Host writes it. */
export type BlockStatus = 'pending' | 'submitted' | 'resolved' | 'expired'

/** One action request sent to the Host. */
export interface BlockActionInput {
  readonly blockId: string
  readonly actionId: string
  readonly sessionId: string
  readonly idempotencyKey: string
  /** Action payload as JSON text, for actions that edit before they commit. */
  readonly payload?: string | undefined
}

/** One action result as the Host returned it. */
export interface BlockActionOutcome {
  readonly blockId: string
  readonly actionId: string
  readonly status: BlockStatus
  /** Whether the Host replayed an earlier execution of the same key. */
  readonly replayed: boolean
  readonly result?: string | undefined
}

/** Current Host status of one block. */
export interface BlockStateSnapshot {
  readonly blockId: string
  readonly status: BlockStatus
  readonly actions: readonly string[]
  readonly actionId?: string | undefined
  readonly result?: string | undefined
}

/** The Host-facing identity and recorded status of one rendered block. */
export interface BlockActionTarget {
  readonly blockId?: string | undefined
  readonly actions?: readonly string[] | undefined
  readonly status?: BlockStatus | undefined
}

type BlockActionDispatcher = (input: BlockActionInput) => Promise<BlockActionOutcome>
type BlockStateReader = (input: { readonly blockId: string; readonly sessionId: string }) => Promise<BlockStateSnapshot>

let dispatcher: BlockActionDispatcher | undefined
let stateReader: BlockStateReader | undefined

/**
 * Install the Host block action Remote.
 * @param next - dispatcher installed by the client plugin.
 */
export function setBlockActionDispatcher(next: BlockActionDispatcher | undefined): void {
  dispatcher = next
}

/**
 * Install the Host block state Remote.
 * @param next - reader installed by the client plugin.
 */
export function setBlockStateReader(next: BlockStateReader | undefined): void {
  stateReader = next
}

/**
 * Dispatch one block action through the Host.
 * @param input - block, action, owning Session, and the gesture's idempotency key.
 * @returns the Host result; a repeated key returns the stored one.
 */
export async function dispatchBlockAction(input: BlockActionInput): Promise<BlockActionOutcome> {
  if (dispatcher === undefined) throw new Error('console block action bridge is unavailable')
  return dispatcher(input)
}

/**
 * Read one block's current Host status.
 * @param input - block to read and the Session that owns it.
 * @returns the stored status and last action value.
 */
export async function readBlockState(input: { readonly blockId: string; readonly sessionId: string }): Promise<BlockStateSnapshot> {
  if (stateReader === undefined) throw new Error('console block state bridge is unavailable')
  return stateReader(input)
}

/** One block's render-time view of its Host status. */
export interface BlockActionHandle {
  /** Status the Host last reported; the recorded creation status until the first read. */
  readonly status: BlockStatus
  /** Last action value as JSON text, when one has run. */
  readonly result: string | undefined
  /** Whether one action of this block is in flight. */
  readonly busy: boolean
  /** Whether the last action failed; the block keeps its previous status. */
  readonly failed: boolean
  /** Run one action; repeated calls for the same action reuse its idempotency key. */
  readonly act: (actionId: string, payload?: string) => Promise<BlockActionOutcome>
}

/**
 * Track one block's Host status and run its actions.
 * @param block - block identity and recorded status.
 * @param sessionId - Session that owns the block.
 * @returns the status, result, busy state, and action dispatcher.
 */
export function useBlockAction(block: BlockActionTarget, sessionId: string | undefined): BlockActionHandle {
  const [status, setStatus] = useState<BlockStatus>(block.status ?? 'pending')
  const [result, setResult] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const keys = useRef(new Map<string, string>())
  const blockId = block.blockId
  useEffect(() => {
    if (blockId === undefined || sessionId === undefined) return
    let live = true
    void readBlockState({ blockId, sessionId }).then((snapshot) => {
      if (!live) return
      setStatus(snapshot.status)
      if (snapshot.result !== undefined) setResult(snapshot.result)
    }).catch(() => {
      // A Host read failure keeps the recorded status; the next action reports its own error.
    })
    return () => { live = false }
  }, [blockId, sessionId])
  const act = useCallback(async (actionId: string, payload?: string): Promise<BlockActionOutcome> => {
    if (blockId === undefined || sessionId === undefined) throw new Error('this block has no Host action surface')
    const existing = keys.current.get(actionId)
    const idempotencyKey = existing ?? randomUUID()
    if (existing === undefined) keys.current.set(actionId, idempotencyKey)
    setBusy(true)
    setFailed(false)
    try {
      const outcome = await dispatchBlockAction({
        blockId, actionId, sessionId, idempotencyKey,
        ...payload === undefined ? {} : { payload },
      })
      setStatus(outcome.status)
      if (outcome.result !== undefined) setResult(outcome.result)
      return outcome
    } catch (error) {
      setFailed(true)
      throw error
    } finally {
      setBusy(false)
    }
  }, [blockId, sessionId])
  return { status, result, busy, failed, act }
}

/**
 * Read the action id out of one stored action value.
 * @param result - action value as JSON text.
 * @returns the action id, or undefined when the value carries none.
 */
export function selectedActionId(result: string | undefined): string | undefined {
  if (result === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(result)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const actionId = (parsed as Record<string, unknown>)['actionId']
    return typeof actionId === 'string' ? actionId : undefined
  } catch {
    return undefined
  }
}

/**
 * Read the `status` field of one stored action value.
 * @param result - action value as JSON text.
 * @returns that status string, or undefined when the value carries none.
 */
export function resultStatus(result: string | undefined): string | undefined {
  if (result === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(result)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const status = (parsed as Record<string, unknown>)['status']
    return typeof status === 'string' ? status : undefined
  } catch {
    return undefined
  }
}
