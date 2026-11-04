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

/** One configured domain plus its live inspection. */
export interface DevConsoleDomainStatus {
  /** Owning project. */
  readonly projectId: string
  /** Domain configuration. */
  readonly domain: DevConsoleDomainConfig
  /** Live git/cwd inspection. */
  readonly inspection: DomainInspection
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
