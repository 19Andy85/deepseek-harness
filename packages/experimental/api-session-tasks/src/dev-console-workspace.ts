/** Workspace worktree inspection and cwd-session creation for Dev Console Stage 1. */
import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { promisify } from 'node:util'
import type { DevConsoleWorkspaceConfig } from './dev-console-config.ts'

const exec = promisify(execFile)

/** Result of comparing one worktree with its registry expectations. */
export interface WorkspaceInspection {
  /** Workspace identity. */
  readonly workspaceId: string
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

/** Minimal session creation face consumed by `openWorkspace`. */
export interface CwdSessionCreator {
  /**
   * @param request - `cwd` is the workspace worktree.
   * @returns the created Session id.
   */
  create(request: { readonly cwd: string }): Promise<{ readonly sessionId: string }>
}

/**
 * Read the worktree's canonical path, branch, toplevel, and cleanliness.
 * @param workspace - configured workspace.
 * @returns inspection facts and mismatches.
 */
export async function inspectWorkspace(workspace: DevConsoleWorkspaceConfig): Promise<WorkspaceInspection> {
  const problems: string[] = []
  const worktree = workspace.worktree
  if (!existsSync(worktree)) {
    return { workspaceId: workspace.id, worktree, clean: false, problems: ['worktree does not exist'] }
  }
  const canonicalWorktree = realpathSync(worktree)
  const expectedToplevel = workspace.hooks.expectedCanonicalToplevel
    ?? (existsSync(workspace.hooks.expectedToplevel) ? realpathSync(workspace.hooks.expectedToplevel) : workspace.hooks.expectedToplevel)
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
  if (branch !== undefined && branch !== workspace.hooks.expectedBranch) {
    problems.push(`branch mismatch: expected ${workspace.hooks.expectedBranch}, got ${branch}`)
  }
  if (porcelain !== undefined && porcelain !== '') problems.push('worktree is dirty')
  return {
    workspaceId: workspace.id,
    worktree,
    canonicalWorktree,
    ...toplevel === undefined ? {} : { toplevel },
    ...branch === undefined ? {} : { branch },
    clean: porcelain === '',
    problems,
  }
}

/**
 * Create a Session bound to the workspace worktree via `cwd`.
 * @param creator - host Session controller face.
 * @param workspace - configured workspace.
 * @returns the new Session id and its cwd.
 */
export async function openWorkspace(
  creator: CwdSessionCreator,
  workspace: DevConsoleWorkspaceConfig,
): Promise<{ readonly sessionId: string; readonly cwd: string }> {
  const inspection = await inspectWorkspace(workspace)
  if (inspection.problems.length > 0) {
    throw new Error(`workspace ${workspace.id} is not usable: ${inspection.problems.join('; ')}`)
  }
  const cwd = inspection.canonicalWorktree ?? workspace.worktree
  const created = await creator.create({ cwd })
  return { sessionId: created.sessionId, cwd }
}
