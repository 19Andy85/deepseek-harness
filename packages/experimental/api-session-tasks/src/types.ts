/**
 * Wire value types and the Host-side collection ports of the session task
 * overview Remote.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/types
 */

import type { SessionId, SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The requested workspace id is not registered in this Host. */
    'session-tasks/workspace-not-found': Record<string, never>
    /** The request names a workspace but no workspace registry is mounted. */
    'session-tasks/workspace-unavailable': Record<string, never>
    /** The followed Session is not live in this Host. */
    'session-tasks/session-not-found': Record<string, never>
  }
}

/** One activity item of a family that carries per-item identity. */
export interface SessionTaskActivityView {
  /** Family-specific identity: a session id, a job id, or a schedule id. */
  readonly id: string
  /** Display label when the family carries one. */
  readonly label?: string
}

/** One activity item of a family that carries per-item identity. */
export type SessionTaskItem = SessionTaskActivityView

/** One activity family still running for a visible session. */
export interface SessionTaskActivityViewEntry {
  /** Activity family: `turn`, `job`, `subagent`, or `schedule` in the shipped composition. */
  readonly kind: string
  /** Active items of the family, absent for a family without per-item identity. */
  readonly items?: readonly SessionTaskActivityView[]
}

/** Row metadata read from the owning domain services. */
export interface SessionTaskMetadata {
  /** Current Session title, when a title provider has produced one. */
  readonly title?: string
  /** Time of the latest human-authored prompt, when the projection carries one. */
  readonly lastPromptAt?: number
  /** Whether the Session has no turn yet (a placeholder not yet given work). */
  readonly blank?: boolean
}

/** One live session of this Host with the activity families that still run for it. */
export interface SessionTaskView {
  /** Session identity. */
  readonly sessionId: string
  /** Absolute working directory the session was created in, when recorded. */
  readonly cwd?: string
  /** Current lifecycle state of the live agent driving the session. */
  readonly status: 'idle' | 'running'
  /** Current Session title, when a title provider has produced one. */
  readonly title?: string
  /** Time of the latest human-authored prompt, when the projection carries one. */
  readonly lastPromptAt?: number
  /** Whether the Session has no turn yet (a placeholder not yet given work). */
  readonly blank?: boolean
  /** Activity families still running for this session, in provider order. */
  readonly activity: readonly SessionTaskActivityViewEntry[]
}

/** Request projected by one overview read. */
export interface SessionTasksRequest {
  /** Workspace whose sessions to read; omission reads every live session of this Host. */
  readonly workspaceId?: string
}

/** Request one live session's follow stream. */
export interface SessionTaskFollowRequest {
  /** Session to follow; must be live in this Host. */
  readonly sessionId: string
}

/**
 * One frame of a session follow stream: the current row while the Session is
 * live, and a final frame without a row once it stops being live.
 */
export interface SessionTaskFollowFrame {
  /** Followed Session identity. */
  readonly sessionId: string
  /** Current row, absent once the Session is no longer live. */
  readonly row?: SessionTaskView
}

/** One consistent overview read for a browser. */
export interface SessionTasksSnapshot {
  /** Requested workspace identity, echoed when the read was scoped to one. */
  readonly workspaceId?: string
  /** Canonical directory path of the requested workspace. */
  readonly workspacePath?: string
  /** Live sessions visible for the requested scope, running sessions first. */
  readonly sessions: readonly SessionTaskView[]
}

/** The parts of one live agent the overview reads. */
export interface SessionTaskAgent {
  /** Live session driven by this agent. */
  readonly session: {
    readonly id: SessionId
    readonly header: Pick<SessionHeader, 'cwd'>
  }
  /** Current lifecycle state of the agent. */
  readonly status: 'idle' | 'running'
}

/** Host capabilities the overview reads. */
export interface SessionTaskHost {
  /** Live agents registered in this Host. */
  readonly agents: { list(): readonly SessionTaskAgent[] }
  /** Ask composed providers what still runs for one session. */
  activityOf(sessionId: SessionId): Promise<readonly SessionActivity[]>
  /** Read row metadata from the owning domain services, when composed. */
  metadataOf?(sessionId: SessionId): SessionTaskMetadata | undefined
}

/** Resolved scope of one overview read. */
export interface CollectSessionTasksOptions {
  /** Keep only sessions created in this working directory. */
  readonly cwd?: string
  /** Keep only these activity families; omission keeps every family. */
  readonly include?: readonly string[]
}
