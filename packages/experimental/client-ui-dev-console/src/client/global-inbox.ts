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
