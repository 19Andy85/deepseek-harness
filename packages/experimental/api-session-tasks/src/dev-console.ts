/** Dev Console Remote wire values: config, domain inspections, and cwd sessions. */
import type { DevConsoleConfig, DevConsoleConfigProblem, DevConsoleDomainConfig } from './dev-console-config.ts'
import type { DomainInspection } from './dev-console-domain.ts'

/** One Session whose cwd belongs to a configured domain. */
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
  /** Domain id. */
  readonly domainId: string
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
  /** Domain id. */
  readonly domainId: string
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
  /** Domain id. */
  readonly domainId: string
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

/** Load historical sessions that belong to one domain. */
export interface DevConsoleHistoryRequest {
  /** Domain to query. */
  readonly domainId: string
  /** Maximum rows (default 20, max 100). */
  readonly limit?: number
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
}

/** Inspect one or more domains. */
export interface DevConsoleInspectRequest {
  /** Domain ids to inspect; omitted inspects every configured domain. */
  readonly domainIds?: readonly string[]
  /** Bypass the short-lived Host cache. */
  readonly refresh?: boolean
}

/** Inspection results. */
export interface DevConsoleInspectValue {
  /** Inspected domains. */
  readonly domains: readonly DevConsoleDomainStatus[]
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

/** Recent activity summary for one domain. */
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

/** Request for a domain summary. */
export interface DevConsoleSummaryRequest {
  /** Domain id. */
  readonly domainId: string
}

/** One configured domain plus its live inspection. */
export interface DevConsoleDomainStatus {
  /** Owning project. */
  readonly projectId: string
  /** Display name of the owning project. */
  readonly projectName?: string
  /** Root path of the owning project. */
  readonly projectRoot?: string
  /** Domain configuration. */
  readonly domain: DevConsoleDomainConfig
  /** Live git/cwd inspection; absent until inspected. */
  readonly inspection?: DomainInspection
  /** Sessions whose cwd belongs to this domain. */
  readonly sessions: readonly DevConsoleSessionSummary[]
}

/** Snapshot of the configured registry and its domains. */
export interface DevConsoleSnapshot {
  /** Loaded registry, when valid. */
  readonly config?: DevConsoleConfig
  /** Blocking config problems. */
  readonly problems: readonly DevConsoleConfigProblem[]
  /** Non-blocking config warnings (for example ephemeral paths). */
  readonly warnings: readonly DevConsoleConfigProblem[]
  /** One entry per configured domain when config is valid. */
  readonly domains: readonly DevConsoleDomainStatus[]
}

/** Request to open one domain. */
export interface DevConsoleOpenDomainRequest {
  /** Stable domain id. */
  readonly domainId: string
}

/** Result of opening a domain. */
export interface DevConsoleOpenDomainValue {
  /** Session created with the domain worktree cwd. */
  readonly sessionId: string
  /** Canonical cwd passed to Session creation. */
  readonly cwd: string
}
