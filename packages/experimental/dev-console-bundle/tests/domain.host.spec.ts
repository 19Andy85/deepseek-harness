import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DevConsoleDomainConfig } from '../src/config.ts'
import { inspectDomain, openDomain } from '../src/domain.ts'

function repoDomain(): { root: string; domain: DevConsoleDomainConfig } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-console-domain-')))
  const repo = join(root, 'repo')
  mkdirSync(repo)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo })
  writeFileSync(join(repo, 'README.md'), 'root\n')
  execFileSync('git', ['add', 'README.md'], { cwd: repo })
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo })
  const worktree = join(repo, '.worktrees', 'domain-x')
  mkdirSync(join(repo, '.worktrees'))
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature/domain-x', worktree], { cwd: repo })
  return {
    root,
    domain: {
      id: 'domain-x',
      name: 'Domain X',
      worktree,
      canonicalWorktree: realpathSync(worktree),
      branch: 'feature/domain-x',
      base: 'main',
      agent: { adapter: 'dsh-session' },
      hooks: {
        expectedBranch: 'feature/domain-x',
        expectedToplevel: worktree,
        expectedCanonicalToplevel: realpathSync(worktree),
      },
    },
  }
}

describe('domain inspection', () => {
  it('accepts a clean matching worktree', async () => {
    const { domain } = repoDomain()
    const inspection = await inspectDomain(domain)
    expect(inspection.problems).toEqual([])
    expect(inspection.clean).toBe(true)
    expect(inspection.branch).toBe('feature/domain-x')
  })

  it('rejects a dirty worktree before creating a session', async () => {
    const { domain } = repoDomain()
    writeFileSync(join(domain.worktree, 'dirty.txt'), 'dirty\n')
    const inspection = await inspectDomain(domain)
    expect(inspection.clean).toBe(false)
    expect(inspection.problems).toContain('worktree is dirty')
    await expect(openDomain({ create: async () => ({ sessionId: 'should-not-run' }) }, domain)).rejects.toThrow('not usable')
  })

  it('creates the Session with the canonical worktree cwd', async () => {
    const { domain } = repoDomain()
    let seen = ''
    const result = await openDomain({ create: async (request) => { seen = request.cwd; return { sessionId: 's1' } } }, domain)
    expect(result).toEqual({ sessionId: 's1', cwd: domain.canonicalWorktree })
    expect(seen).toBe(domain.canonicalWorktree)
  })
})
