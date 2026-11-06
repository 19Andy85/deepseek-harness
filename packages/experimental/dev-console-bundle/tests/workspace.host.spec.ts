import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DevConsoleWorkspaceConfig } from '../src/config.ts'
import { inspectWorkspace, openWorkspace } from '../src/workspace.ts'

function repoWorkspace(): { root: string; workspace: DevConsoleWorkspaceConfig } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-console-workspace-')))
  const repo = join(root, 'repo')
  mkdirSync(repo)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo })
  writeFileSync(join(repo, 'README.md'), 'root\n')
  execFileSync('git', ['add', 'README.md'], { cwd: repo })
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo })
  const worktree = join(repo, '.worktrees', 'workspace-x')
  mkdirSync(join(repo, '.worktrees'))
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature/workspace-x', worktree], { cwd: repo })
  return {
    root,
    workspace: {
      id: 'workspace-x',
      name: 'Workspace X',
      worktree,
      canonicalWorktree: realpathSync(worktree),
      branch: 'feature/workspace-x',
      base: 'main',
      agent: { adapter: 'dsh-session' },
      hooks: {
        expectedBranch: 'feature/workspace-x',
        expectedToplevel: worktree,
        expectedCanonicalToplevel: realpathSync(worktree),
      },
    },
  }
}

describe('workspace inspection', () => {
  it('accepts a clean matching worktree', async () => {
    const { workspace } = repoWorkspace()
    const inspection = await inspectWorkspace(workspace)
    expect(inspection.problems).toEqual([])
    expect(inspection.clean).toBe(true)
    expect(inspection.branch).toBe('feature/workspace-x')
  })

  it('rejects a dirty worktree before creating a session', async () => {
    const { workspace } = repoWorkspace()
    writeFileSync(join(workspace.worktree, 'dirty.txt'), 'dirty\n')
    const inspection = await inspectWorkspace(workspace)
    expect(inspection.clean).toBe(false)
    expect(inspection.problems).toContain('worktree is dirty')
    await expect(openWorkspace({ create: async () => ({ sessionId: 'should-not-run' }) }, workspace)).rejects.toThrow('not usable')
  })

  it('creates the Session with the canonical worktree cwd', async () => {
    const { workspace } = repoWorkspace()
    let seen = ''
    const result = await openWorkspace({ create: async (request) => { seen = request.cwd; return { sessionId: 's1' } } }, workspace)
    expect(result).toEqual({ sessionId: 's1', cwd: workspace.canonicalWorktree })
    expect(seen).toBe(workspace.canonicalWorktree)
  })
})
