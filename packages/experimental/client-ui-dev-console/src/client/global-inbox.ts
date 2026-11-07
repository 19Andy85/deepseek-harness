/** Global attention inbox: pending and unread work across every Workspace. */
import type { AttentionStatusFacts, WorkspaceSessions } from './cross-workspace.ts'

/** Kind of work waiting in one Workspace. */
export type GlobalInboxKind = 'approval' | 'question' | 'plan-review' | 'completed'

/** One waiting Session. */
export interface GlobalInboxItem {
  /** Workspace that accounts the Session. */
  readonly workspaceId: string
  /** Session identity. */
  readonly sessionId: string
  /** What waits. */
  readonly kind: GlobalInboxKind
}

/** Items grouped under their Workspace. */
export interface GlobalInboxGroup {
  /** Workspace identity. */
  readonly workspaceId: string
  /** Workspace display title. */
  readonly title: string
  /** Waiting Sessions in Workspace order. */
  readonly items: readonly GlobalInboxItem[]
}

/**
 * Collect waiting Sessions from every Workspace.
 * @param statuses - Session UI status keyed by Session id.
 * @param workspaces - Workspaces with their member Session ids.
 * @returns non-empty groups in Workspace order, pending before completed.
 */
export function globalInboxGroups(
  statuses: ReadonlyMap<string, AttentionStatusFacts>,
  workspaces: readonly WorkspaceSessions[],
): GlobalInboxGroup[] {
  const groups: GlobalInboxGroup[] = []
  for (const workspace of workspaces) {
    const items: GlobalInboxItem[] = []
    for (const sessionId of workspace.sessionIds) {
      const status = statuses.get(sessionId)
      if (status === undefined) continue
      const pending = status.pendingInteraction
      if (pending !== undefined) {
        items.push({
          workspaceId: workspace.id,
          sessionId,
          kind: pending.kind === 'plan-review' ? 'plan-review' : pending.kind === 'approval' ? 'approval' : 'question',
        })
      } else if (status.completionUnread === true) {
        items.push({ workspaceId: workspace.id, sessionId, kind: 'completed' })
      }
    }
    if (items.length > 0) {
      items.sort((left, right) => Number(left.kind === 'completed') - Number(right.kind === 'completed'))
      groups.push({ workspaceId: workspace.id, title: workspace.title, items })
    }
  }
  return groups
}

/**
 * Count every waiting Session.
 * @param groups - grouped items.
 * @returns the total item count.
 */
export function globalInboxCount(groups: readonly GlobalInboxGroup[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0)
}

/** Cross-Workspace health counts that Session UI status can answer. */
export interface GlobalHealthCounts {
  /** Sessions with a pending interaction. */
  readonly needsYou: number
  /** Sessions whose latest known running state is true. */
  readonly running: number
  /** Sessions with an unacknowledged completion. */
  readonly completedUnread: number
  /** Sessions that are neither waiting nor running nor unread. */
  readonly idle: number
}

/** Minimum Session UI facts needed for cross-Workspace counts. */
export interface GlobalSessionStatus {
  readonly running?: boolean | undefined
  readonly pendingInteraction?: unknown
  readonly completionUnread?: boolean | undefined
}

/**
 * Count Session UI states across every Workspace.
 * @param statuses - Session UI status keyed by Session id.
 * @param workspaces - Workspaces with their member Session ids.
 * @returns counts over every known member Session.
 */
export function globalHealthCounts(
  statuses: ReadonlyMap<string, GlobalSessionStatus>,
  workspaces: readonly WorkspaceSessions[],
): GlobalHealthCounts {
  let needsYou = 0
  let running = 0
  let completedUnread = 0
  let idle = 0
  const seen = new Set<string>()
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) {
      if (seen.has(sessionId)) continue
      seen.add(sessionId)
      const status = statuses.get(sessionId)
      if (status === undefined) continue
      if (status.pendingInteraction !== undefined) needsYou += 1
      else if (status.completionUnread === true) completedUnread += 1
      else if (status.running === true) running += 1
      else idle += 1
    }
  }
  return { needsYou, running, completedUnread, idle }
}
