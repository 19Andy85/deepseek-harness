/** Attention items and health counts derived from visible rows and Session UI status. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'

/** Presentation facts of a pending interaction, normalized for the attention lane. */
export type AttentionDescriptor =
  | { readonly kind: 'approval'; readonly toolName: string; readonly answerable: boolean; readonly reason?: string }
  | {
    readonly kind: 'question' | 'plan-review'
    readonly firstQuestion: {
      readonly id: string
      readonly question: string
      readonly multiSelect?: boolean
      readonly options?: readonly { readonly label: string }[]
    }
  }

/** One Session that may need the user, with its highest-precedence reason. */
export interface AttentionItem {
  /** Session identity. */
  readonly sessionId: string
  /** The row the item belongs to. */
  readonly row: SessionTaskView
  /** Pending interaction facts; absent with `failed` means an unread completion. */
  readonly pending?: AttentionDescriptor
  /** Failure facts when the last finished turn failed. */
  readonly failed?: { readonly reason?: string }
}

/** Session UI status facts the attention derivation reads. */
export interface AttentionStatus {
  /** Whether an observed stop still needs acknowledgement. */
  readonly completionUnread?: boolean
}

/** Counts that summarize the health of the visible project. */
export interface HealthCounts {
  /** Sessions with a running turn. */
  readonly running: number
  /** Sessions waiting for an answer or approval. */
  readonly needsYou: number
  /** Sessions whose last finished turn failed. */
  readonly failed: number
  /** Sessions that finished without acknowledgement and have no pending interaction. */
  readonly completedUnread: number
  /** Remaining idle Sessions without attention. */
  readonly idle: number
}

/**
 * Derive the attention lane: pending interactions first, then unread completions.
 * @param rows - visible rows.
 * @param statuses - Session UI status indexed by Session id.
 * @param descriptorOf - pending interaction facts of one Session, when it has one.
 * @returns attention items ordered by reason, then latest prompt.
 */
export function attentionItems(
  rows: readonly SessionTaskView[],
  statuses: ReadonlyMap<string, AttentionStatus>,
  descriptorOf: (sessionId: string) => AttentionDescriptor | undefined,
  failureOf: (sessionId: string) => string | undefined = () => undefined,
): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const row of rows) {
    const pending = descriptorOf(row.sessionId)
    if (pending !== undefined) {
      items.push({ sessionId: row.sessionId, row, pending })
      continue
    }
    const reason = failureOf(row.sessionId)
    if (reason !== undefined) {
      items.push({ sessionId: row.sessionId, row, failed: { reason } })
      continue
    }
    if (statuses.get(row.sessionId)?.completionUnread === true) {
      items.push({ sessionId: row.sessionId, row })
    }
  }
  const rank = (item: AttentionItem) => item.pending !== undefined ? 0 : item.failed !== undefined ? 1 : 2
  return items.sort((left, right) => {
    if (rank(left) !== rank(right)) return rank(left) - rank(right)
    return (right.row.lastPromptAt ?? 0) - (left.row.lastPromptAt ?? 0)
  })
}

/**
 * Count the health categories of the visible project.
 * @param rows - visible rows.
 * @param statuses - Session UI status indexed by Session id.
 * @param descriptorOf - pending interaction facts of one Session, when it has one.
 * @returns health counts.
 */
export function healthCounts(
  rows: readonly SessionTaskView[],
  statuses: ReadonlyMap<string, AttentionStatus>,
  descriptorOf: (sessionId: string) => AttentionDescriptor | undefined,
  failureOf: (sessionId: string) => string | undefined = () => undefined,
): HealthCounts {
  let running = 0
  let needsYou = 0
  let failed = 0
  let completedUnread = 0
  let idle = 0
  for (const row of rows) {
    const status = statuses.get(row.sessionId)
    if (descriptorOf(row.sessionId) !== undefined) needsYou += 1
    else if (failureOf(row.sessionId) !== undefined) failed += 1
    else if (status?.completionUnread === true) completedUnread += 1
    else if (row.status === 'running') running += 1
    else idle += 1
  }
  return { running, needsYou, failed, completedUnread, idle }
}
