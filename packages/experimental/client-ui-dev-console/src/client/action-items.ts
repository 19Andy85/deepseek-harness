/** Unified action items across Session attention and durable work queues. */
import type { AttentionItem } from './attention.ts'
import type { GlobalInboxGroup } from './global-inbox.ts'

/** Source that produced one action item. */
export type ActionSource = 'session' | 'message' | 'plan'

/** One item waiting for the maintainer. */
export interface ActionItem {
  /** Stable identity within the source. */
  readonly id: string
  /** Source family. */
  readonly source: ActionSource
  /** Workspace that accounts the item, when known. */
  readonly workspaceId?: string | undefined
  /** Session that carries the item, when known. */
  readonly sessionId?: string | undefined
  /** Human-readable title. */
  readonly title: string
  /** Short reason or scope. */
  readonly detail: string
}

/**
 * Build Session action items from current attention plus cross-Workspace groups.
 * @param attention - current Workspace attention items with titles.
 * @param groups - cross-Workspace waiting Session groups.
 * @returns deduplicated items, pending before unread.
 */
export function buildSessionActionItems(
  attention: readonly AttentionItem[],
  groups: readonly GlobalInboxGroup[],
): ActionItem[] {
  const items: ActionItem[] = []
  const seen = new Set<string>()
  for (const item of attention) {
    seen.add(item.sessionId)
    items.push({
      id: `session:${item.sessionId}`,
      source: 'session',
      sessionId: item.sessionId,
      title: item.row.title ?? item.sessionId,
      detail: item.pending === undefined ? 'failed' : item.pending.kind,
    })
  }
  for (const group of groups) {
    for (const item of group.items) {
      if (seen.has(item.sessionId)) continue
      seen.add(item.sessionId)
      items.push({
        id: `session:${item.sessionId}`,
        source: 'session',
        workspaceId: group.workspaceId,
        sessionId: item.sessionId,
        title: group.title,
        detail: item.kind,
      })
    }
  }
  return items
}
