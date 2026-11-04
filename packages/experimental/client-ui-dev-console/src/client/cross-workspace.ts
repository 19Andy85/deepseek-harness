/** Attention items that live in workspaces other than the selected one. */
/** Session UI facts the attention summary reads. */
export interface AttentionStatusFacts {
  /** Highest-precedence pending interaction, when one exists. */
  readonly pendingInteraction?: { readonly kind: string } | undefined
  /** Whether an observed stop still needs acknowledgement. */
  readonly completionUnread?: boolean | undefined
}

/** One Workspace with its member Session ids. */
export interface WorkspaceSessions {
  /** Workspace identity. */
  readonly id: string
  /** Display title. */
  readonly title: string
  /** Member Session ids of the Workspace, in Host order. */
  readonly sessionIds: readonly string[]
}

/** Attention summary of one other Workspace. */
export interface OtherWorkspaceAttention {
  /** Workspace identity. */
  readonly workspaceId: string
  /** Display title. */
  readonly title: string
  /** Waiting or unread Sessions in that Workspace. */
  readonly count: number
}

/**
 * Summarize attention outside the selected Workspace from Session UI status.
 * @param statuses - Session UI status keyed by Session id.
 * @param workspaces - Workspaces with their member Session ids.
 * @param currentWorkspaceId - selected Workspace to exclude.
 * @returns one entry per Workspace that still has a Session needing attention.
 */
export function otherWorkspaceAttention(
  statuses: ReadonlyMap<string, AttentionStatusFacts>,
  workspaces: readonly WorkspaceSessions[],
  currentWorkspaceId: string | undefined,
): OtherWorkspaceAttention[] {
  const attentionSessions = new Set<string>()
  for (const [sessionId, status] of statuses) {
    if (status.pendingInteraction !== undefined || status.completionUnread === true) attentionSessions.add(sessionId)
  }
  if (attentionSessions.size === 0) return []
  const result: OtherWorkspaceAttention[] = []
  for (const workspace of workspaces) {
    if (workspace.id === currentWorkspaceId) continue
    const count = workspace.sessionIds.filter(sessionId => attentionSessions.has(sessionId)).length
    if (count > 0) result.push({ workspaceId: workspace.id, title: workspace.title, count })
  }
  return result
}
