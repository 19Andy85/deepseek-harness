/**
 * Host-owned interactive block records and the header of their action protocol.
 *
 * A block is registered by the Host and addressed by a browser; its status has
 * exactly one writer, the Host. One action per idempotency key executes once and
 * every later request with that key replays the stored result, so a repeated
 * click cannot create a second task or move the status twice.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/dev-console-block
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

/**
 * Block lifecycle states; only Host code writes a new status.
 *
 * `pending` accepts one action; the Host settles it to `resolved` in the same
 * write, or marks it `submitted` first when an action completes later.
 * `resolved` and `expired` are terminal.
 */
export type DevConsoleBlockStatus = 'pending' | 'submitted' | 'resolved' | 'expired'

/** One interactive block registered by the Host for one Session. */
export interface DevConsoleBlock {
  readonly id: string
  readonly sessionId: string
  readonly type: string
  readonly props: Readonly<Record<string, unknown>>
  readonly actions: readonly string[]
  readonly status: DevConsoleBlockStatus
  readonly createdAt: number
  readonly updatedAt: number
}

/** One executed block action, replayable by its idempotency key. */
export interface DevConsoleBlockActionRecord {
  readonly blockId: string
  readonly actionId: string
  readonly sessionId: string
  readonly idempotencyKey: string
  /** Action value as JSON text, exactly as the first caller received it. */
  readonly result: string
  readonly at: number
}

/** Act on one block from the browser. */
export interface DevConsoleBlockActionRequest {
  readonly blockId: string
  readonly actionId: string
  readonly sessionId: string
  /** Caller-minted key; the same key replays the stored result instead of acting again. */
  readonly idempotencyKey: string
  /** Action payload as JSON text, for actions that edit before they commit. */
  readonly payload?: string | undefined
}

/** Result of one block action, as stored and as replayed. */
export interface DevConsoleBlockActionValue {
  readonly blockId: string
  readonly actionId: string
  /** Block status after the action; a replay reports the stored status. */
  readonly status: DevConsoleBlockStatus
  /** Whether this response replays an earlier execution of the same key. */
  readonly replayed: boolean
  /** Action result as JSON text. */
  readonly result?: string | undefined
}

/** Register one interactive block; Host callers only, never a browser. */
export interface DevConsoleCreateBlockRequest {
  readonly sessionId: string
  readonly type: string
  readonly props: Readonly<Record<string, unknown>>
  /** Action ids the block accepts; omitted registers a display-only block. */
  readonly actions?: readonly string[] | undefined
}

/** Read the current status of one block. */
export interface DevConsoleBlockStateRequest {
  readonly blockId: string
  readonly sessionId: string
}

/** Current status and last action result of one block. */
export interface DevConsoleBlockStateValue {
  readonly blockId: string
  readonly status: DevConsoleBlockStatus
  readonly actions: readonly string[]
  /** Last executed action id, when one has run. */
  readonly actionId?: string | undefined
  /** Last executed action result as JSON text, when one has run. */
  readonly result?: string | undefined
}

/** Block states in which a new action may start; the same key replays before this check. */
export const DEV_CONSOLE_BLOCK_ACTIONABLE: readonly DevConsoleBlockStatus[] = ['pending']

/** Most recent block records kept in the bus. */
export const MAX_DEV_CONSOLE_BLOCKS = 100

/** Most recent action records kept in the bus. */
export const MAX_DEV_CONSOLE_BLOCK_ACTIONS = 200

/** Why the Host rejected a block action. */
export type DevConsoleBlockActionErrorCode =
  | 'block-not-found'
  | 'block-session-mismatch'
  | 'block-action-unknown'
  | 'block-not-actionable'
  | 'block-idempotency-conflict'

/** Typed rejection of a block action; the controller maps it to a Remote error. */
export class DevConsoleBlockActionError extends Error {
  /**
   * @param code - stable reason the action was rejected.
   * @param message - actionable description naming the block and action.
   */
  constructor(readonly code: DevConsoleBlockActionErrorCode, message: string) {
    super(message)
    this.name = 'DevConsoleBlockActionError'
  }
}

const statusSchema: z.ZodType<DevConsoleBlockStatus> = z.enum(['pending', 'submitted', 'resolved', 'expired'])

/** Stored block schema, owned by the bus state. */
export const devConsoleBlockSchema: z.ZodType<DevConsoleBlock> = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
  actions: z.array(z.string().min(1)),
  status: statusSchema,
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
}).strict()

/** Stored action record schema, owned by the bus state. */
export const devConsoleBlockActionRecordSchema: z.ZodType<DevConsoleBlockActionRecord> = z.object({
  blockId: z.string().min(1),
  actionId: z.string().min(1),
  sessionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  result: z.string(),
  at: z.number().nonnegative(),
}).strict()

/**
 * Create one pending block for a Session.
 * @param input - Session, block type, props, and the action ids the block accepts.
 * @param now - creation time in epoch milliseconds.
 * @returns the pending block; duplicate action ids keep their first occurrence.
 */
export function createDevConsoleBlock(input: {
  readonly sessionId: string
  readonly type: string
  readonly props: Readonly<Record<string, unknown>>
  readonly actions: readonly string[]
}, now: number): DevConsoleBlock {
  return {
    id: randomUUID(),
    sessionId: input.sessionId,
    type: input.type,
    props: input.props,
    actions: [...new Set(input.actions)],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Find the record a repeated idempotency key must replay.
 * @param records - stored action records, newest first.
 * @param request - requested block action.
 * @returns the matching record, or undefined when the key has not been used.
 * @throws DevConsoleBlockActionError when the key was used for a different action.
 */
export function findDevConsoleBlockActionReplay(
  records: readonly DevConsoleBlockActionRecord[],
  request: DevConsoleBlockActionRequest,
): DevConsoleBlockActionRecord | undefined {
  const record = records.find(item => item.idempotencyKey === request.idempotencyKey)
  if (record === undefined) return undefined
  if (record.blockId !== request.blockId || record.actionId !== request.actionId || record.sessionId !== request.sessionId) {
    throw new DevConsoleBlockActionError('block-idempotency-conflict',
      `idempotency key ${request.idempotencyKey} already belongs to another block action`)
  }
  return record
}

/**
 * Select the block a request may act on.
 * @param blocks - stored blocks.
 * @param request - requested block action.
 * @returns the block that may run the action.
 * @throws DevConsoleBlockActionError when the block is missing, belongs to another
 * Session, does not declare the action, or is no longer pending.
 */
export function assertDevConsoleBlockActionable(
  blocks: readonly DevConsoleBlock[],
  request: DevConsoleBlockActionRequest,
): DevConsoleBlock {
  const block = blocks.find(item => item.id === request.blockId)
  if (block === undefined) throw new DevConsoleBlockActionError('block-not-found', `block ${request.blockId} not found`)
  if (block.sessionId !== request.sessionId) {
    throw new DevConsoleBlockActionError('block-session-mismatch', `block ${block.id} does not belong to session ${request.sessionId}`)
  }
  if (!block.actions.includes(request.actionId)) {
    throw new DevConsoleBlockActionError('block-action-unknown', `block ${block.id} does not declare action ${request.actionId}`)
  }
  if (!DEV_CONSOLE_BLOCK_ACTIONABLE.includes(block.status)) {
    throw new DevConsoleBlockActionError('block-not-actionable', `block ${block.id} is ${block.status}`)
  }
  return block
}

/**
 * Record one executed action and move its block out of `pending`.
 * @param input - stored lists, the executed block and request, the action value, and completion time.
 * @returns the updated block and action record lists.
 */
export function recordDevConsoleBlockAction(input: {
  readonly blocks: readonly DevConsoleBlock[]
  readonly records: readonly DevConsoleBlockActionRecord[]
  readonly block: DevConsoleBlock
  readonly request: DevConsoleBlockActionRequest
  readonly result: string
  readonly now: number
}): { readonly blocks: readonly DevConsoleBlock[]; readonly blockActions: readonly DevConsoleBlockActionRecord[] } {
  const settled: DevConsoleBlock = { ...input.block, status: 'resolved', updatedAt: input.now }
  const record: DevConsoleBlockActionRecord = {
    blockId: input.request.blockId,
    actionId: input.request.actionId,
    sessionId: input.request.sessionId,
    idempotencyKey: input.request.idempotencyKey,
    result: input.result,
    at: input.now,
  }
  return {
    blocks: [settled, ...input.blocks.filter(item => item.id !== settled.id)].slice(0, MAX_DEV_CONSOLE_BLOCKS),
    blockActions: [record, ...input.records].slice(0, MAX_DEV_CONSOLE_BLOCK_ACTIONS),
  }
}

/** Host ports one block action needs: stored state and one commit point. */
export interface DevConsoleBlockActionPort {
  /** Stored blocks; read again after every await. */
  blocks(): readonly DevConsoleBlock[]
  /** Stored action records, newest first. */
  records(): readonly DevConsoleBlockActionRecord[]
  /** Persist the executed action and the settled block together. */
  commit(next: {
    readonly blocks: readonly DevConsoleBlock[]
    readonly blockActions: readonly DevConsoleBlockActionRecord[]
  }): Promise<void>
}

/** Return the stored result of an already executed idempotency key. */
function replayValue(
  blocks: readonly DevConsoleBlock[],
  records: readonly DevConsoleBlockActionRecord[],
  request: DevConsoleBlockActionRequest,
): DevConsoleBlockActionValue | undefined {
  const record = findDevConsoleBlockActionReplay(records, request)
  if (record === undefined) return undefined
  const block = blocks.find(item => item.id === record.blockId)
  return {
    blockId: record.blockId,
    actionId: record.actionId,
    status: block?.status ?? 'resolved',
    replayed: true,
    result: record.result,
  }
}

/**
 * Execute one block action at most once per idempotency key.
 *
 * A replay is answered before the per-block lock is taken; inside the lock the
 * Host re-reads the bus, validates the block, runs the type-specific action,
 * and commits the settled block and its record together. Two concurrent
 * requests for one block therefore run the action once, and a retry whose first
 * response was lost returns the stored result instead of acting twice.
 *
 * @param port - stored blocks, records, and their single commit point.
 * @param locks - in-flight actions of this Host, owned by the caller.
 * @param request - block, action, owning Session, and idempotency key.
 * @param run - the type-specific action, returning its value as JSON text.
 * @returns the action value, or the replayed stored value.
 * @throws DevConsoleBlockActionError when the request may not run.
 */
export async function executeDevConsoleBlockAction(
  port: DevConsoleBlockActionPort,
  locks: Map<string, Promise<void>>,
  request: DevConsoleBlockActionRequest,
  run: (block: DevConsoleBlock, request: DevConsoleBlockActionRequest) => Promise<string>,
): Promise<DevConsoleBlockActionValue> {
  const replayed = replayValue(port.blocks(), port.records(), request)
  if (replayed !== undefined) return replayed
  const execute = async (): Promise<DevConsoleBlockActionValue> => {
    const again = replayValue(port.blocks(), port.records(), request)
    if (again !== undefined) return again
    const block = assertDevConsoleBlockActionable(port.blocks(), request)
    const result = await run(block, request)
    const recorded = recordDevConsoleBlockAction({
      blocks: port.blocks(), records: port.records(), block, request, result, now: Date.now(),
    })
    await port.commit(recorded)
    return { blockId: block.id, actionId: request.actionId, status: 'resolved', replayed: false, result }
  }
  const previous = locks.get(request.blockId) ?? Promise.resolve()
  const queued = previous.then(execute)
  const settled = queued.then(() => undefined, () => undefined)
  locks.set(request.blockId, settled)
  try {
    return await queued
  } finally {
    if (locks.get(request.blockId) === settled) locks.delete(request.blockId)
  }
}

/**
 * Read one block's stored status and last action result.
 * @param blocks - stored blocks.
 * @param records - stored action records, newest first.
 * @param request - block to read and the Session that owns it.
 * @returns current status, declared actions, and the last action result.
 * @throws DevConsoleBlockActionError when the block is missing or belongs to another Session.
 */
export function readDevConsoleBlockState(
  blocks: readonly DevConsoleBlock[],
  records: readonly DevConsoleBlockActionRecord[],
  request: DevConsoleBlockStateRequest,
): DevConsoleBlockStateValue {
  const block = blocks.find(item => item.id === request.blockId)
  if (block === undefined) throw new DevConsoleBlockActionError('block-not-found', `block ${request.blockId} not found`)
  if (block.sessionId !== request.sessionId) {
    throw new DevConsoleBlockActionError('block-session-mismatch', `block ${block.id} does not belong to session ${request.sessionId}`)
  }
  const last = records.find(item => item.blockId === block.id)
  return {
    blockId: block.id,
    status: block.status,
    actions: block.actions,
    ...last === undefined ? {} : { actionId: last.actionId, result: last.result },
  }
}
