/** Dev Console Remote wire values: config, workspace inspections, and cwd sessions. */
import type { DevConsoleConfig, DevConsoleConfigProblem, DevConsoleWorkspaceConfig } from './dev-console-config.ts'
import type {
  DevConsoleBrief, DevConsoleBriefStatus, DevConsoleMessage, DevConsoleMessageKind, DevConsoleMessagePayload,
  DevConsolePlan, DevConsolePlanStep, DevConsoleRole, DevConsoleDirective,
} from './dev-console-bus.ts'
import type { WorkspaceInspection } from './dev-console-workspace.ts'

/** One Session whose cwd belongs to a configured workspace. */
export interface DevConsoleSessionSummary {
  /** Session identity. */
  readonly sessionId: string
  /** Session cwd. */
  readonly cwd: string
  /** Whether the Session is currently live. */
  readonly live: boolean
}

/** Git read request. */
export interface DevConsoleGitRequest {
  /** Workspace id. */
  readonly workspaceId: string
  /** Read-only git action. */
  readonly action: 'status' | 'log' | 'diff'
}

/** Git read result. */
export interface DevConsoleGitValue {
  /** Text output. */
  readonly text: string
}

/** AGENTS read request. */
export interface DevConsoleAgentsRequest {
  /** Workspace id. */
  readonly workspaceId: string
}

/** AGENTS read result. */
export interface DevConsoleAgentsValue {
  /** Path read. */
  readonly path: string
  /** File text. */
  readonly text: string
  /** Content hash. */
  readonly hash: string
}

/** Save one AGENTS.md with optimistic hash protection. */
export interface DevConsoleSaveAgentsRequest {
  /** Workspace id. */
  readonly workspaceId: string
  /** Complete replacement text. */
  readonly text: string
  /** Hash read before editing. */
  readonly baseHash: string
}

/** Result of saving AGENTS.md. */
export interface DevConsoleSaveAgentsValue {
  /** New content hash. */
  readonly hash: string
}

/** Current config file text. */
export interface DevConsoleConfigValue {
  /** File path. */
  readonly path: string
  /** YAML text. */
  readonly yaml: string
}

/** Replace the config file with validated YAML. */
export interface DevConsoleSaveConfigRequest {
  /** Complete YAML text. */
  readonly yaml: string
}

/** Result of saving config. */
export interface DevConsoleSaveConfigValue {
  /** Written path. */
  readonly path: string
  /** Non-blocking warnings. */
  readonly warnings: readonly DevConsoleConfigProblem[]
}

/** Load historical sessions that belong to one workspace. */
export interface DevConsoleHistoryRequest {
  /** Workspace to query. */
  readonly workspaceId: string
  /** Maximum rows (default 20, max 100). */
  readonly limit?: number
  /** Rows to skip. */
  readonly offset?: number
  /** Case-insensitive match over session id and cwd. */
  readonly query?: string
}

/** Historical session row. */
export interface DevConsoleHistorySession {
  /** Session identity. */
  readonly sessionId: string
  /** Whether the session is live. */
  readonly live: boolean
}

/** Historical session result. */
export interface DevConsoleHistoryValue {
  /** Matching sessions, newest first. */
  readonly sessions: readonly DevConsoleHistorySession[]
  /** Total matching sessions before pagination. */
  readonly total: number
  /** Whether another page is available. */
  readonly hasMore: boolean
}

/** Inspect one or more workspaces. */
export interface DevConsoleInspectRequest {
  /** Workspace ids to inspect; omitted inspects every configured workspace. */
  readonly workspaceIds?: readonly string[]
  /** Bypass the short-lived Host cache. */
  readonly refresh?: boolean
}

/** Inspection results. */
export interface DevConsoleInspectValue {
  /** Inspected workspaces. */
  readonly workspaces: readonly DevConsoleWorkspaceStatus[]
}

/** Auto-generate a registry from the connected workspaces. */
export interface DevConsoleAutoConfigRequest {
  /** Replace an existing registry file. */
  readonly overwrite?: boolean
}

/** Result of auto-generating a registry. */
export interface DevConsoleAutoConfigValue {
  /** Written config file path. */
  readonly path: string
  /** Number of projects written. */
  readonly projects: number
}

/** Recent activity summary for one workspace. */
export interface DevConsoleSummary {
  /** Last commit, when the worktree has one. */
  readonly commit?: { readonly hash: string; readonly subject: string; readonly at: string }
  /** Number of changed paths. */
  readonly dirtyCount: number
  /** Commits ahead of the base branch, when resolvable. */
  readonly ahead?: number
  /** Commits behind the base branch, when resolvable. */
  readonly behind?: number
  /** AGENTS.md size and hash, when present. */
  readonly agents?: { readonly bytes: number; readonly hash: string }
}

/** List messages from one perspective. */
export interface DevConsoleMessagesRequest {
  /** Acting role. */
  readonly role: DevConsoleRole
  /** Inbox or outbox perspective. */
  readonly box: 'inbox' | 'outbox'
  /** Optional workspace filter. */
  readonly workspaceId?: string | undefined
}

/** Send one message. */
export interface DevConsoleSendMessageRequest {
  readonly fromRole: DevConsoleRole
  readonly toRole: DevConsoleRole
  readonly workspaceId?: string | undefined
  readonly kind: DevConsoleMessageKind
  readonly subject: string
  readonly body: string
  readonly requiresResponse?: boolean | undefined
  readonly payload?: DevConsoleMessagePayload
}

/** Acknowledge or resolve a message. */
export interface DevConsoleMessageActionRequest {
  readonly role: DevConsoleRole
  readonly messageId: string
  readonly action: 'ack' | 'resolve'
  readonly response?: string | undefined
}

/** Message list result. */
export interface DevConsoleMessagesValue {
  readonly messages: readonly DevConsoleMessage[]
}

/** Resolve the console context of one Session. */
export interface DevConsoleSessionContextRequest {
  readonly sessionId: string
}

/** Session context result. */
export interface DevConsoleSessionContextValue {
  readonly sessionId: string
  readonly workspaceId?: string | undefined
  readonly projectId?: string | undefined
  readonly briefId?: string | undefined
  readonly briefTitle?: string | undefined
  readonly planId?: string | undefined
  readonly planVersion?: number | undefined
  /** Recent console directives delivered to this Session. */
  readonly directives?: readonly {
    readonly id: string
    readonly type: string
    readonly summary: string
    readonly status: 'pending' | 'delivered' | 'failed'
    readonly createdAt: number
  }[] | undefined
}

/** Deliver one structured console directive into a Session. */
export interface DevConsoleDirectiveRequest {
  readonly sessionId: string
  readonly type: string
  readonly briefId?: string | undefined
  readonly planId?: string | undefined
  readonly summary: string
  readonly payload?: string | undefined
}

/** Directive delivery result. */
export interface DevConsoleDirectiveValue {
  readonly directive: DevConsoleDirective
}

/** Inbox row derived from Briefs, plans, and messages that need action. */
export interface DevConsoleInboxItem {
  readonly id: string
  readonly kind: 'message' | 'brief' | 'plan'
  readonly title: string
  readonly detail: string
  readonly briefId?: string | undefined
  readonly planId?: string | undefined
  readonly messageId?: string | undefined
  readonly action: 'approve-plan' | 'review-handoff' | 'handle-message' | 'assign-brief'
}

/** Inbox request. */
export interface DevConsoleInboxRequest {
  readonly role: DevConsoleRole
  readonly workspaceId?: string | undefined
}

/** Inbox result. */
export interface DevConsoleInboxValue {
  readonly items: readonly DevConsoleInboxItem[]
}

/** Plan list request. */
export interface DevConsolePlansRequest {
  readonly briefId?: string | undefined
  readonly workspaceId?: string | undefined
  readonly parentPlanId?: string | undefined
}

/** Plan list result. */
export interface DevConsolePlansValue {
  readonly plans: readonly DevConsolePlan[]
}

/** Plan step input. */
export interface DevConsolePlanStepInput {
  readonly title: string
  readonly outcome: string
}

/** Create a draft plan. */
export interface DevConsoleCreatePlanRequest {
  readonly briefId: string
  readonly title: string
  readonly steps: readonly DevConsolePlanStepInput[]
  readonly parentPlanId?: string | undefined
  readonly role: DevConsoleRole
}

/** Approve a draft plan. */
export interface DevConsoleApprovePlanRequest {
  readonly planId: string
  readonly role: DevConsoleRole
}

/** Revise an approved plan into a new draft version. */
export interface DevConsoleRevisePlanRequest {
  readonly planId: string
  readonly steps: readonly DevConsolePlanStepInput[]
  readonly reason: string
  readonly role: DevConsoleRole
}

/** Update one step's progress. */
export interface DevConsolePlanStepUpdateRequest {
  readonly planId: string
  readonly stepId: string
  readonly status: DevConsolePlanStep['status']
  readonly evidence?: string | undefined
  readonly role: DevConsoleRole
}

/** Brief list request. */
export interface DevConsoleBriefsRequest {
  readonly workspaceId?: string | undefined
}

/** Brief list result. */
export interface DevConsoleBriefsValue {
  readonly briefs: readonly DevConsoleBrief[]
}

/** Create one Brief. */
export interface DevConsoleCreateBriefRequest {
  readonly workspaceId: string
  readonly title: string
  readonly goal: string
  readonly acceptance: string
  readonly authorRole: DevConsoleRole
}

/** Transition one Brief. */
export interface DevConsoleTransitionBriefRequest {
  readonly briefId: string
  readonly to: DevConsoleBriefStatus
  readonly role: DevConsoleRole
  readonly assigneeRole?: DevConsoleRole | undefined
  readonly reason?: string | undefined
}

/** Submit a handoff for a Brief. */
export interface DevConsoleHandoffRequest {
  readonly briefId: string
  readonly fromRole: DevConsoleRole
  readonly toRole: DevConsoleRole
  readonly branch: string
  readonly commit: string
  readonly summary: string
  readonly tests: readonly string[]
  readonly risks?: string | undefined
  readonly nextSteps?: string | undefined
}

/** Dev Console state read result. */
export interface DevConsoleStateValue {
  /** Bound session ids by workspace id. */
  readonly bindings: Readonly<Record<string, readonly string[]>>
  /** Recent AGENTS saves. */
  readonly audit: readonly {
    readonly at: number
    readonly workspaceId: string
    readonly path: string
    readonly baseHash: string
    readonly newHash: string
  }[]
}

/** Bind a session to a workspace. */
export interface DevConsoleBindRequest {
  /** Workspace id. */
  readonly workspaceId: string
  /** Session id. */
  readonly sessionId: string
}

/** Request for a workspace summary. */
export interface DevConsoleSummaryRequest {
  /** Workspace id. */
  readonly workspaceId: string
}

/** One configured workspace plus its live inspection. */
export interface DevConsoleWorkspaceStatus {
  /** Owning project. */
  readonly projectId: string
  /** Display name of the owning project. */
  readonly projectName?: string
  /** Root path of the owning project. */
  readonly projectRoot?: string
  /** Workspace configuration. */
  readonly workspace: DevConsoleWorkspaceConfig
  /** Live git/cwd inspection; absent until inspected. */
  readonly inspection?: WorkspaceInspection
  /** Sessions whose cwd belongs to this workspace. */
  readonly sessions: readonly DevConsoleSessionSummary[]
}

/** Snapshot of the configured registry and its workspaces. */
export interface DevConsoleSnapshot {
  /** Loaded registry, when valid. */
  readonly config?: DevConsoleConfig
  /** Blocking config problems. */
  readonly problems: readonly DevConsoleConfigProblem[]
  /** Non-blocking config warnings (for example ephemeral paths). */
  readonly warnings: readonly DevConsoleConfigProblem[]
  /** One entry per configured workspace when config is valid. */
  readonly workspaces: readonly DevConsoleWorkspaceStatus[]
}

/** Request to open one workspace. */
export interface DevConsoleOpenWorkspaceRequest {
  /** Stable workspace id. */
  readonly workspaceId: string
}

/** Result of opening a workspace. */
export interface DevConsoleOpenWorkspaceValue {
  /** Session created with the workspace worktree cwd. */
  readonly sessionId: string
  /** Canonical cwd passed to Session creation. */
  readonly cwd: string
}
