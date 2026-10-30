/**
 * Session outcome projection: the last finished turn's result, folded from
 * `turn/start` and `turn/end` without reading any message content.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/outcome
 */
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace-changes'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { SessionProjectionSummaryExcluded } from '@deepseek-ai/dsh-session-projection/types'

/** How the last finished turn ended. */
export type SessionTaskOutcomeKind = 'completed' | 'failed' | 'cancelled' | 'blocked' | 'truncated'

/** Folded result of the Session's last finished turn. */
export interface SessionTaskOutcome {
  /** Result of the last finished turn; absent while a new turn runs or before any turn ends. */
  readonly kind?: SessionTaskOutcomeKind | undefined
  /** Turn number the result belongs to. */
  readonly turn?: number | undefined
  /** When that turn ended, epoch milliseconds. */
  readonly at?: number | undefined
  /** Human-readable failure message for `failed`. */
  readonly reason?: string | undefined
  /** Stable failure code for `failed`. */
  readonly code?: string | undefined
  /** Sequence of the latest `workspace/changes` event, when one exists. */
  readonly changesSeq?: number | undefined
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Last finished turn's outcome; host-only, excluded from Session summaries. */
    sessionTaskOutcome: SessionProjectionSummaryExcluded<SessionTaskOutcome>
  }
}

const outcomeSchema: z.ZodType<SessionTaskOutcome> = z.object({
  kind: z.enum(['completed', 'failed', 'cancelled', 'blocked', 'truncated']).optional(),
  turn: z.number().int().nonnegative().optional(),
  at: z.number().optional(),
  reason: z.string().optional(),
  code: z.string().optional(),
  changesSeq: z.number().int().nonnegative().optional(),
}).strict()

function fold(state: SessionTaskOutcome, event: SessionEvent): SessionTaskOutcome {
  if (event.type === 'workspace/changes') return { ...state, changesSeq: event.seq as number }
  if (event.type === 'turn/start') return { turn: event.data.turn, at: event.time }
  if (event.type !== 'turn/end') return state
  const { turn, reason } = event.data
  switch (reason.kind) {
    case 'completed':
      return { kind: 'completed', turn, at: event.time }
    case 'error':
      return { kind: 'failed', turn, at: event.time, reason: reason.error.message, code: reason.error.code }
    case 'blocked':
      return { kind: 'blocked', turn, at: event.time }
    case 'max-tokens':
      return { kind: 'truncated', turn, at: event.time }
    case 'aborted':
    case 'interrupted':
    case 'forked':
      return { kind: 'cancelled', turn, at: event.time }
    default:
      return { kind: 'cancelled', turn, at: event.time }
  }
}

/** The `sessionTaskOutcome` unit: last finished turn result for the console. */
export const sessionTaskOutcomeProjection = {
  key: 'sessionTaskOutcome',
  stateVersion: 1,
  stateSchema: outcomeSchema,
  init: (): SessionTaskOutcome => ({}),
  apply: fold,
  wire: { viewSchema: outcomeSchema, view: (state: SessionTaskOutcome) => state, summary: false },
} satisfies ProjectionDefinition<'sessionTaskOutcome', SessionTaskOutcome>
