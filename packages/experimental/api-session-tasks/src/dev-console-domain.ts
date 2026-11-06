/** Domain worktree inspection and cwd-session creation for Dev Console Stage 1. */
import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { promisify } from 'node:util'
import type { DevConsoleWorkspaceConfig } from './dev-console-config.ts'

const exec = promisify(execFile)

/** Result of comparing one worktree with its registry expectations. */
export interface DomainInspection {
  /** Domain identity. */
  readonly domainId: string
  /** Configured worktree. */
  readonly worktree: string
  /** Canonical worktree when resolvable. */
  readonly canonicalWorktree?: string
  /** Reported git toplevel. */
  readonly toplevel?: string
  /** Reported branch. */
  readonly branch?: string
  /** Whether `git status --porcelain` is empty. */
  readonly clean: boolean
  /** Human-readable mismatches; empty means usable. */
  readonly problems: readonly string[]
}

/** Minimal session creation face consumed by `openDomain`. */
export interface CwdSessionCreator {
  /**
   * @param request - `cwd` is the domain worktree.
   * @returns the created Session id.
   */
  create(request: { readonly cwd: string }): Promise<{ readonly sessionId: string }>
}

/**
 * Read the worktree's canonical path, branch, toplevel, and cleanliness.
 * @param domain - configured domain.
 * @returns inspection facts and mismatches.
 */
export async function inspectDomain(domain: DevConsoleWorkspaceConfig): Promise<DomainInspection> {
  const problems: string[] = []
  const worktree = domain.worktree
  if (!existsSync(worktree)) {
    return { domainId: domain.id, worktree, clean: false, problems: ['worktree does not exist'] }
  }
  const canonicalWorktree = realpathSync(worktree)
  const expectedToplevel = domain.hooks.expectedCanonicalToplevel
    ?? (existsSync(domain.hooks.expectedToplevel) ? realpathSync(domain.hooks.expectedToplevel) : domain.hooks.expectedToplevel)
  const run = async (args: readonly string[]): Promise<string | undefined> => {
    try {
      const result = await exec('git', [...args], { cwd: canonicalWorktree, encoding: 'utf8' })
      return result.stdout.trim()
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error))
      return undefined
    }
  }
  const toplevel = await run(['rev-parse', '--show-toplevel'])
  const branch = await run(['rev-parse', '--abbrev-ref', 'HEAD'])
  const porcelain = await run(['status', '--porcelain'])
  if (toplevel !== undefined && realpathSync(toplevel) !== expectedToplevel) {
    problems.push(`toplevel mismatch: expected ${expectedToplevel}, got ${toplevel}`)
  }
  if (branch !== undefined && branch !== domain.hooks.expectedBranch) {
    problems.push(`branch mismatch: expected ${domain.hooks.expectedBranch}, got ${branch}`)
  }
  if (porcelain !== undefined && porcelain !== '') problems.push('worktree is dirty')
  return {
    domainId: domain.id,
    worktree,
    canonicalWorktree,
    ...toplevel === undefined ? {} : { toplevel },
    ...branch === undefined ? {} : { branch },
    clean: porcelain === '',
    problems,
  }
}

/**
 * Create a Session bound to the domain worktree via `cwd`.
 * @param creator - host Session controller face.
 * @param domain - configured domain.
 * @returns the new Session id and its cwd.
 */
export async function openDomain(
  creator: CwdSessionCreator,
  domain: DevConsoleWorkspaceConfig,
): Promise<{ readonly sessionId: string; readonly cwd: string }> {
  const inspection = await inspectDomain(domain)
  if (inspection.problems.length > 0) {
    throw new Error(`domain ${domain.id} is not usable: ${inspection.problems.join('; ')}`)
  }
  const cwd = inspection.canonicalWorktree ?? domain.worktree
  const created = await creator.create({ cwd })
  return { sessionId: created.sessionId, cwd }
}
