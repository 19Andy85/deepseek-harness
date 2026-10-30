/** Client-side project visit memory: the previous row snapshot and its last-seen time. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'

/** One Session's compared facts from the previous visit. */
export interface RememberedRow {
  /** Row status at the previous visit. */
  readonly status: SessionTaskView['status']
  /** Stable key of the activity families. */
  readonly activityKey: string
  /** Session title at the previous visit. */
  readonly title?: string
  /** Latest prompt time at the previous visit. */
  readonly lastPromptAt?: number
}

/** Persistent comparison baseline of one project. */
export interface VisitMemory {
  /** When the baseline was recorded. */
  readonly lastSeenAt: number
  /** Rows of that visit, keyed by Session id. */
  readonly rows: Readonly<Record<string, RememberedRow>>
}

/** How one Session changed since the baseline. */
export type VisitChange = 'appeared' | 'finished' | 'status-changed' | 'updated'

/**
 * Compare the current rows with the previous visit.
 * @param previous - baseline, absent on the first visit.
 * @param rows - current visible rows.
 * @returns changed Session ids mapped to their first observed change.
 */
export function compareVisit(
  previous: VisitMemory | undefined,
  rows: readonly SessionTaskView[],
): ReadonlyMap<string, VisitChange> {
  const changes = new Map<string, VisitChange>()
  if (previous === undefined) return changes
  const seen = new Set<string>()
  for (const row of rows) {
    seen.add(row.sessionId)
    const before = previous.rows[row.sessionId]
    const activityKey = row.activity.map(entry => entry.kind).join(',')
    if (before === undefined) {
      changes.set(row.sessionId, 'appeared')
      continue
    }
    if (before.status === 'running' && row.status === 'idle') changes.set(row.sessionId, 'finished')
    else if (before.status !== row.status) changes.set(row.sessionId, 'status-changed')
    else if (before.activityKey !== activityKey) changes.set(row.sessionId, 'updated')
  }
  for (const sessionId of Object.keys(previous.rows)) {
    if (!seen.has(sessionId)) changes.set(sessionId, 'finished')
  }
  return changes
}

/**
 * Record the current rows as the next baseline.
 * @param rows - current visible rows.
 * @param at - baseline time.
 * @returns the next baseline.
 */
export function rememberVisit(rows: readonly SessionTaskView[], at: number): VisitMemory {
  const remembered: Record<string, RememberedRow> = {}
  for (const row of rows) {
    remembered[row.sessionId] = {
      status: row.status,
      activityKey: row.activity.map(entry => entry.kind).join(','),
      ...row.title === undefined ? {} : { title: row.title },
      ...row.lastPromptAt === undefined ? {} : { lastPromptAt: row.lastPromptAt },
    }
  }
  return { lastSeenAt: at, rows: remembered }
}
