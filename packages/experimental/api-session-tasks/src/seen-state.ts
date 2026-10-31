/**
 * Server-side read state: the last acknowledged row baseline of one Workspace,
 * persisted through the optional storage domain so "since last visit" is
 * consistent across devices.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/seen-state
 */
import { z } from 'zod'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import type { SessionTaskView } from './types.ts'

/** Compared facts of one Session at the last acknowledgement. */
export interface SeenRow {
  /** Lifecycle status at acknowledgement. */
  readonly status: 'idle' | 'running'
  /** Stable activity-family key at acknowledgement. */
  readonly activityKey: string
  /** Latest prompt time at acknowledgement. */
  readonly lastPromptAt?: number | undefined
  /** Last outcome time at acknowledgement. */
  readonly outcomeAt?: number | undefined
}

/** One Workspace's last acknowledged baseline. */
export interface WorkspaceSeen {
  /** Epoch milliseconds of the acknowledgement. */
  readonly lastSeenAt: number
  /** Acknowledged sessions keyed by Session id. */
  readonly rows: Readonly<Record<string, SeenRow>>
}

/** Persisted global of the read-state domain. */
export interface SeenState {
  /** Baselines keyed by Workspace id. */
  readonly workspaces: Readonly<Record<string, WorkspaceSeen>>
}

const seenRowSchema: z.ZodType<SeenRow> = z.object({
  status: z.enum(['idle', 'running']),
  activityKey: z.string(),
  lastPromptAt: z.number().optional(),
  outcomeAt: z.number().optional(),
}).strict()

const workspaceSeenSchema: z.ZodType<WorkspaceSeen> = z.object({
  lastSeenAt: z.number().nonnegative(),
  rows: z.record(z.string(), seenRowSchema),
}).strict()

const seenStateSchema: z.ZodType<SeenState> = z.object({
  workspaces: z.record(z.string(), workspaceSeenSchema),
}).strict()

/** Storage domain holding the acknowledged baselines. */
export const sessionTasksSeenDomain = defineDomain({
  name: 'experimental_session_tasks_seen',
  version: 1,
  tables: {},
  global: { schema: seenStateSchema, initial: { workspaces: {} } },
})

/** Empty read state served before the first acknowledgement. */
export const EMPTY_SEEN: SeenState = { workspaces: {} }

/**
 * Project the current rows into the durable baseline shape.
 * @param rows - visible rows.
 * @returns the rows keyed by Session id.
 */
export function seenRowsOf(rows: readonly SessionTaskView[]): Record<string, SeenRow> {
  const seen: Record<string, SeenRow> = {}
  for (const row of rows) {
    seen[row.sessionId] = {
      status: row.status,
      activityKey: row.activity.map(entry => entry.kind).join(','),
      ...row.lastPromptAt === undefined ? {} : { lastPromptAt: row.lastPromptAt },
      ...row.outcomeAt === undefined ? {} : { outcomeAt: row.outcomeAt },
    }
  }
  return seen
}

/**
 * Compare the current rows with the acknowledged baseline.
 * @param previous - baseline, absent before the first acknowledgement.
 * @param rows - current visible rows.
 * @returns changed Session ids, including sessions absent from the baseline or baseline rows now gone.
 */
export function changedSessionIds(
  previous: WorkspaceSeen | undefined,
  rows: readonly SessionTaskView[],
): string[] {
  if (previous === undefined) return []
  const current = seenRowsOf(rows)
  const changed = new Set<string>()
  for (const [sessionId, row] of Object.entries(current)) {
    const before = previous.rows[sessionId]
    if (before === undefined || before.status !== row.status
      || before.activityKey !== row.activityKey
      || before.lastPromptAt !== row.lastPromptAt
      || before.outcomeAt !== row.outcomeAt) {
      changed.add(sessionId)
    }
  }
  for (const sessionId of Object.keys(previous.rows)) {
    if (current[sessionId] === undefined) changed.add(sessionId)
  }
  return [...changed]
}
