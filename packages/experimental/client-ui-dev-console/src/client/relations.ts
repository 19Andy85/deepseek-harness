/** Derivation relationships between visible Sessions, from subagent activity items. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'

/** Derivation facts among visible rows. */
export interface RelationHints {
  /** Child Session id to the Session that derived it. */
  readonly parentOf: ReadonlyMap<string, string>
  /** Parent Session id to the Sessions it derived. */
  readonly derivedBy: ReadonlyMap<string, readonly string[]>
}

/**
 * Read derivation hints from subagent activity items.
 * @param rows - visible rows.
 * @returns child-to-parent and parent-to-children maps.
 */
export function relationHints(rows: readonly SessionTaskView[]): RelationHints {
  const visible = new Set(rows.map(row => row.sessionId))
  const parentOf = new Map<string, string>()
  const derivedBy = new Map<string, string[]>()
  for (const row of rows) {
    for (const activity of row.activity) {
      if (activity.kind !== 'subagent') continue
      for (const item of activity.items ?? []) {
        if (!visible.has(item.id) || item.id === row.sessionId) continue
        parentOf.set(item.id, row.sessionId)
        const children = derivedBy.get(row.sessionId) ?? []
        if (!children.includes(item.id)) children.push(item.id)
        derivedBy.set(row.sessionId, children)
      }
    }
  }
  return { parentOf, derivedBy }
}
