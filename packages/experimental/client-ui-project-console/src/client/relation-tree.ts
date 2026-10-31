/** Relation groups for the console graph: visible parents with their durable children. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'

/** One node of the relation graph. */
export interface RelationGraphNode {
  /** Session identity. */
  readonly sessionId: string
  /** Display title, when the Session is visible or was reported. */
  readonly title?: string
  /** Whether the Session is live. */
  readonly live?: boolean
  /** Session state, when visible. */
  readonly status?: SessionTaskView['status']
  /** Last turn outcome, when visible. */
  readonly outcome?: string
  /** Whether the Session appears stalled. */
  readonly stalled?: boolean
}

/** One parent and its derived children. */
export interface RelationGraphGroup {
  /** The deriving Session. */
  readonly parent: RelationGraphNode
  /** Its durable derived children. */
  readonly children: readonly RelationGraphNode[]
}

/** Rows beyond this count are summarized instead of listed. */
const MAX_CHILDREN = 8

/**
 * Build relation groups rooted at visible rows.
 * @param rows - visible rows.
 * @returns groups for parents with at least one durable child.
 */
export function relationGroups(rows: readonly SessionTaskView[]): RelationGraphGroup[] {
  const byId = new Map(rows.map(row => [row.sessionId, row]))
  const groups: RelationGraphGroup[] = []
  for (const row of rows) {
    const children = row.relations?.children
    if (children === undefined || children.length === 0) continue
    groups.push({
      parent: nodeOf(row),
      children: children.slice(0, MAX_CHILDREN).map((child) => {
        const visible = byId.get(child.sessionId)
        return visible === undefined
          ? { sessionId: child.sessionId, ...child.live === true ? { live: true } : {} }
          : nodeOf(visible)
      }),
    })
  }
  return groups
}

function nodeOf(row: SessionTaskView): RelationGraphNode {
  return {
    sessionId: row.sessionId,
    ...row.title === undefined ? {} : { title: row.title },
    status: row.status,
    ...row.outcome === undefined ? {} : { outcome: row.outcome },
    ...row.stalled === true ? { stalled: true } : {},
  }
}
