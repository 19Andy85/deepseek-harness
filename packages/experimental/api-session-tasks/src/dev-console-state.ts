/**
 * Durable Dev Console state: workspace-to-session bindings and AGENTS save
 * history, stored in a Host storage domain rather than browser localStorage.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/dev-console-state
 */
import { z } from 'zod'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'

/** One AGENTS save record. */
export interface DevConsoleAuditEntry {
  /** Epoch milliseconds. */
  readonly at: number
  /** Workspace id. */
  readonly workspaceId: string
  /** File path saved. */
  readonly path: string
  /** Hash before the save. */
  readonly baseHash: string
  /** Hash after the save. */
  readonly newHash: string
}

/** Persisted Dev Console state. */
export interface DevConsoleState {
  /** Bound Session ids by workspace id, newest first. */
  readonly bindings: Readonly<Record<string, readonly string[]>>
  /** Recent AGENTS saves, newest first. */
  readonly audit: readonly DevConsoleAuditEntry[]
}

const auditSchema: z.ZodType<DevConsoleAuditEntry> = z.object({
  at: z.number().nonnegative(),
  workspaceId: z.string(),
  path: z.string(),
  baseHash: z.string(),
  newHash: z.string(),
}).strict()

const stateSchema: z.ZodType<DevConsoleState> = z.object({
  bindings: z.record(z.string(), z.array(z.string())),
  audit: z.array(auditSchema),
}).strict()

/** Storage domain holding Dev Console bindings and audit records. */
export const devConsoleStateDomain = defineDomain({
  name: 'experimental_dev_console_state',
  version: 1,
  tables: {},
  global: { schema: stateSchema, initial: { bindings: {}, audit: [] } },
})

/** Empty state served before the first write. */
export const EMPTY_DEV_CONSOLE_STATE: DevConsoleState = { bindings: {}, audit: [] }
