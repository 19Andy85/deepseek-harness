/** Dev Console Remote wire values: config, domain inspections, and cwd sessions. */
import type { DevConsoleConfig, DevConsoleConfigProblem, DevConsoleDomainConfig } from './dev-console-config.ts'
import type { DomainInspection } from './dev-console-domain.ts'

/** One configured domain plus its live inspection. */
export interface DevConsoleDomainStatus {
  /** Owning project. */
  readonly projectId: string
  /** Domain configuration. */
  readonly domain: DevConsoleDomainConfig
  /** Live git/cwd inspection. */
  readonly inspection: DomainInspection
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
