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
  /** Derivation depth inside the group (parent is 0). */
  readonly depth?: number
  /** Short activity label of a visible Session. */
  readonly activity?: string
  /** Background jobs owned by this Session. */
  readonly jobs?: readonly string[]
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
/** Deepest derivation level the graph walks when child rows are visible. */
const MAX_DEPTH = 3

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
    const nodes: RelationGraphNode[] = []
    const visited = new Set<string>([row.sessionId])
    const walk = (parent: SessionTaskView, depth: number): void => {
      for (const child of parent.relations?.children ?? []) {
        if (visited.has(child.sessionId) || nodes.length >= MAX_CHILDREN) continue
        visited.add(child.sessionId)
        const visible = byId.get(child.sessionId)
        nodes.push(visible === undefined
          ? {
            sessionId: child.sessionId,
            depth,
            ...child.live === true ? { live: true } : {},
            ...child.title === undefined ? {} : { title: child.title },
          }
          : { ...nodeOf(visible), depth })
        if (visible !== undefined && depth < MAX_DEPTH) walk(visible, depth + 1)
      }
    }
    walk(row, 1)
    groups.push({ parent: nodeOf(row), children: nodes })
  }
  return groups
}

function nodeOf(row: SessionTaskView): RelationGraphNode {
  const jobs = row.activity.filter(entry => entry.kind === 'job').map(entry => entry.items?.[0]?.label ?? entry.kind)
  const firstActivity = row.activity[0]
  return {
    sessionId: row.sessionId,
    ...row.title === undefined ? {} : { title: row.title },
    status: row.status,
    ...row.outcome === undefined ? {} : { outcome: row.outcome },
    ...row.stalled === true ? { stalled: true } : {},
    ...firstActivity === undefined ? {} : { activity: firstActivity.items?.[0]?.label ?? firstActivity.kind },
    ...jobs.length === 0 ? {} : { jobs },
  }
}
