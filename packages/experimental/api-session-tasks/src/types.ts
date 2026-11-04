/**
 * Wire value types and the Host-side collection ports of the session task
 * overview Remote.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/types
 */

import type { SessionId, SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionTaskOutcomeKind } from './outcome.ts'
import type { SessionTaskRelations } from './relations.ts'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The requested workspace id is not registered in this Host. */
    'session-tasks/workspace-not-found': Record<string, never>
    /** The request names a workspace but no workspace registry is mounted. */
    'session-tasks/workspace-unavailable': Record<string, never>
    /** The followed Session is not live in this Host. */
    'session-tasks/session-not-found': Record<string, never>
    /** Server-side read state is unavailable because no storage domain is mounted. */
    'session-tasks/seen-unavailable': Record<string, never>
    /** A Dev Console file changed after the caller read it. */
    'dev-console/conflict': Record<string, never>
  }
}

/** One activity item of a family that carries per-item identity. */
export interface SessionTaskActivityView {
  /** Family-specific identity: a session id, a job id, or a schedule id. */
  readonly id: string
  /** Display label when the family carries one. */
  readonly label?: string
  /** When this item started, when the Host can report it. */
  readonly startedAt?: number
}

/** One activity item of a family that carries per-item identity. */
export type SessionTaskItem = SessionTaskActivityView

/** One activity family still running for a visible session. */
export interface SessionTaskActivityViewEntry {
  /** Activity family: `turn`, `job`, `subagent`, or `schedule` in the shipped composition. */
  readonly kind: string
  /** When this family became active, when the Host can report it. */
  readonly startedAt?: number
  /** Most recent observed change of this family; used for the stalled judgement. */
  readonly lastActivityAt?: number
  /** Active items of the family, absent for a family without per-item identity. */
  readonly items?: readonly SessionTaskActivityView[]
}

/** Row metadata read from the owning domain services. */
export interface SessionTaskMetadata {
  /** Cumulative token usage, when available. */
  readonly usage?: SessionTaskUsage
  /** Usage reported by the latest completed assistant step, when available. */
  readonly lastUsage?: SessionTaskUsage
  /** Agent-maintained todo progress, when available. */
  readonly progress?: SessionTaskProgress
  /** Latest tool call, when available. */
  readonly toolCall?: SessionTaskToolCall
  /** Pending approval, when available. */
  readonly approval?: SessionTaskApproval
  /** Current Session title, when a title provider has produced one. */
  readonly title?: string
  /** Time of the latest human-authored prompt, when the projection carries one. */
  readonly lastPromptAt?: number
  /** Whether the Session has no turn yet (a placeholder not yet given work). */
  readonly blank?: boolean
  /** Result of the last finished turn, when the outcome projection carries one. */
  readonly outcome?: SessionTaskOutcomeKind
  /** When that turn ended, epoch milliseconds. */
  readonly outcomeAt?: number
  /** Failure message for a failed outcome. */
  readonly outcomeReason?: string
  /** Changed files summarized for the latest finished turn, when the Host kept one. */
  readonly changes?: SessionTaskChanges
  /** Durable derivation relations of this Session. */
  readonly relations?: SessionTaskRelations
}

/** Agent-maintained todo progress of one Session. */
export interface SessionTaskProgress {
  /** Total todo items in the latest list. */
  readonly total: number
  /** Items already completed. */
  readonly completed: number
  /** Items currently in progress. */
  readonly inProgress: number
  /** Content of the first in-progress item, when one exists. */
  readonly current?: string
}

/** Cumulative token usage of one Session. */
export interface SessionTaskUsage {
  /** Prompt tokens consumed. */
  readonly inputTokens: number
  /** Completion tokens produced. */
  readonly outputTokens: number
  /** Provider total when reported, else input + output + cache tokens. */
  readonly totalTokens: number
  /** Cache read tokens, when reported. */
  readonly cacheReadTokens?: number
  /** Cache write tokens, when reported. */
  readonly cacheWriteTokens?: number
}

/** Pending approval in one Session, with the exact call it decides when available. */
export interface SessionTaskApproval {
  /** Tool requesting the decision. */
  readonly toolName: string
  /** Exact tool call being decided, when the asker supplied one. */
  readonly callId?: string
  /** Human-readable reason supplied by the asker. */
  readonly reason?: string
  /** Truncated arguments of that exact call, when its log event is available. */
  readonly arguments?: string
}

/** Latest tool call observed in the Session log. */
export interface SessionTaskToolCall {
  /** Tool name. */
  readonly name: string
  /** Truncated JSON arguments preview. */
  readonly arguments: string
}

/** Changed-file facts of the latest summarized turn. */
export interface SessionTaskChanges {
  /** Complete changed-file count. */
  readonly total: number
  /** Lines added across all changed files. */
  readonly added: number
  /** Lines deleted across all changed files. */
  readonly deleted: number
  /** Display paths of the first few changed files. */
  readonly files?: readonly string[]
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
  /** Whether the running Session has shown no observable change within the Host's stall threshold. */
  readonly stalled?: boolean
  /** Result of the Session's last finished turn, when one is known. */
  readonly outcome?: SessionTaskOutcomeKind
  /** When that turn ended, epoch milliseconds. */
  readonly outcomeAt?: number
  /** Failure message for a failed outcome. */
  readonly outcomeReason?: string
  /** Cumulative token usage, when the Session log reported any. */
  readonly usage?: SessionTaskUsage
  /** Usage reported by the latest completed assistant step, when available. */
  readonly lastUsage?: SessionTaskUsage
  /** Agent-maintained todo progress, when the Session has a todo list. */
  readonly progress?: SessionTaskProgress
  /** Latest tool call, when the Session log has one. */
  readonly toolCall?: SessionTaskToolCall
  /** Pending approval, when the session log has an undecided approval/asked event. */
  readonly approval?: SessionTaskApproval
  /** Changed files summarized for the latest finished turn, when the Host kept one. */
  readonly changes?: SessionTaskChanges
  /** Durable derivation relations of this Session. */
  readonly relations?: SessionTaskRelations
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

/** Request to acknowledge the current rows of one workspace as read. */
export interface SessionTasksAcknowledgeRequest {
  /** Workspace whose baseline to replace. */
  readonly workspaceId: string
}

/** Result of acknowledging one workspace. */
export interface SessionTasksAcknowledgeValue {
  /** Epoch milliseconds of the acknowledgement. */
  readonly lastSeenAt: number
}

/** One consistent overview read for a browser. */
export interface SessionTasksSnapshot {
  /** Requested workspace identity, echoed when the read was scoped to one. */
  readonly workspaceId?: string
  /** Canonical directory path of the requested workspace. */
  readonly workspacePath?: string
  /** Live sessions visible for the requested scope, running sessions first. */
  readonly sessions: readonly SessionTaskView[]
  /** Sessions changed since the last acknowledgement, when stored read state exists. */
  readonly changes?: readonly string[]
  /** Epoch milliseconds of the last acknowledgement, when stored read state exists. */
  readonly lastSeenAt?: number
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

export type * from './dev-console.ts'
