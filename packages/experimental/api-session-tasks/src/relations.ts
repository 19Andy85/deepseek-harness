/**
 * Durable parent/child relation slices for the console, read from session
 * headers so a finished subagent stays visible without its live activity.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/relations
 */

/** One child Session derived from a parent. */
export interface SessionRelationChild {
  /** Child Session identity. */
  readonly sessionId: string
  /** Whether the child is live in this Host. */
  readonly live?: boolean
  /** Persisted delegation depth of the child. */
  readonly depth?: number
  /** Log-backed title of the child, when the Host folded one. */
  readonly title?: string
}

/** Relation slice attached to one row. */
export interface SessionTaskRelations {
  /** Parent Session identity for a derived Session. */
  readonly parent?: { readonly sessionId: string }
  /** Derived children of this Session, in creation order. */
  readonly children?: readonly SessionRelationChild[]
}

/** Minimal persisted-session facts the relation slice needs. */
export interface RelationSourceRecord {
  /** Persisted header of one Session. */
  readonly header: {
    /** Session identity. */
    readonly id: string
    /** Direct creator of a subagent Session. */
    readonly parentSession?: string
    /** Subagent origin marker. */
    readonly origin?: 'subagent'
    /** Persisted delegation depth. */
    readonly delegationDepth?: number
  }
  /** Whether the Session currently exists in the live store. */
  readonly live: boolean
}

/**
 * Build child lists keyed by parent Session id from persisted records.
 * @param records - live-preferred session records.
 * @param titles - optional child titles keyed by Session id.
 * @returns derived children per parent, in record order.
 */
export function buildChildRelations(
  records: readonly RelationSourceRecord[],
  titles: ReadonlyMap<string, string> = new Map(),
): Map<string, SessionRelationChild[]> {
  const byParent = new Map<string, SessionRelationChild[]>()
  for (const record of records) {
    const parent = record.header.parentSession
    if (parent === undefined || record.header.origin !== 'subagent') continue
    const children = byParent.get(parent) ?? []
    const title = titles.get(record.header.id)
    children.push({
      sessionId: record.header.id,
      ...record.live ? { live: true } : {},
      ...record.header.delegationDepth === undefined ? {} : { depth: record.header.delegationDepth },
      ...title === undefined ? {} : { title },
    })
    byParent.set(parent, children)
  }
  return byParent
}
