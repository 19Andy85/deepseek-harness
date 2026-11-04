import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadDevConsoleConfig, validateConfig } from '../src/config.ts'

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'dev-console-config-'))
  mkdirSync(join(root, 'repo', '.worktrees', 'domain-x'), { recursive: true })
  return realpathSync(root)
}

describe('Dev Console config', () => {
  it('loads and canonicalizes a valid registry', () => {
    const root = workspace()
    const path = join(root, '.dsh', 'dev-console.yaml')
    mkdirSync(join(root, '.dsh'), { recursive: true })
    writeFileSync(path, `version: 1
projects:
  - id: p
    name: P
    root: ${root}/repo
    domains:
      - id: d
        name: D
        worktree: ${root}/repo/.worktrees/domain-x
        branch: feature/domain-x
        base: main
        agent: { adapter: dsh-session }
        hooks:
          expectedBranch: feature/domain-x
          expectedToplevel: ${root}/repo/.worktrees/domain-x
`)
    const result = loadDevConsoleConfig(path)
    expect(result.problems).toEqual([])
    expect(result.config?.projects[0]?.domains[0]?.canonicalWorktree).toBe(join(root, 'repo', '.worktrees', 'domain-x'))
    expect(result.warnings.map(warning => warning.code)).toContain('ephemeral-path')
  })

  it('warns when a worktree lives under a temporary directory', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-console-ephemeral-')))
    const result = validateConfig({ version: 1, projects: [{ id: 'p', name: 'P', root, domains: [
      { id: 'd', name: 'D', worktree: root, branch: 'b', base: 'main', agent: { adapter: 'dsh-session' }, hooks: { expectedBranch: 'b', expectedToplevel: root } },
    ] }] })
    expect(result.config).toBeDefined()
    expect(result.warnings.map(warning => warning.code)).toContain('ephemeral-path')
  })

  it('reports duplicate ids, relative paths, and missing worktrees', () => {
    const result = validateConfig({ version: 1, projects: [{ id: 'p', name: 'P', root: 'relative', domains: [
      { id: 'd', name: 'D', worktree: '/missing', branch: 'b', base: 'main', agent: { adapter: 'dsh-session' }, hooks: { expectedBranch: 'b', expectedToplevel: '/missing' } },
      { id: 'd', name: 'D2', worktree: '/missing2', branch: 'b', base: 'main', agent: { adapter: 'dsh-session' }, hooks: { expectedBranch: 'b', expectedToplevel: '/missing2' } },
    ] }] })
    expect(result.problems.map(problem => problem.code)).toEqual(expect.arrayContaining([
      'not-absolute', 'duplicate-domain', 'missing-path',
    ]))
    expect(result.config).toBeUndefined()
  })
})
