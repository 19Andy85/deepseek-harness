#!/usr/bin/env node
/**
 * Build the project-console bundle against a shipped release tag, so the four
 * packages resolve the dependencies of the target app instead of this
 * workspace, then optionally link the build into a dsh profile.
 *
 * Usage:
 *   node packages/experimental/session-tasks-bundle/scripts/prepare-compat.mjs \
 *     --tag dsh-v0.2.1-rc.3 [--dir ~/dsh-builds/<tag>] [--skip-build] [--link-profile desktop]
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const bundleDir = resolve(scriptDir, '..')
const repoRoot = resolve(bundleDir, '../../..')
const PACKAGES = ['tool-session-tasks', 'api-session-tasks', 'client-ui-project-console', 'session-tasks-bundle']
const COPY_ENTRIES = ['src', 'tests', 'locale', 'examples', 'package.json', 'tsconfig.json', 'tsdown.config.ts', 'cordis.patch.yml', 'README.md', 'README.zh.md', 'README.i18n.yaml']

function fail(message) {
  process.stderr.write(`prepare-compat: ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { tag: 'dsh-v0.2.1-rc.3', build: true, linkProfile: undefined, dir: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--tag') args.tag = argv[++i]
    else if (value === '--dir') args.dir = argv[++i]
    else if (value === '--skip-build') args.build = false
    else if (value === '--link-profile') args.linkProfile = argv[++i]
    else fail(`unknown argument ${JSON.stringify(value)}`)
  }
  if (args.dir === undefined) args.dir = join(homedir(), 'dsh-builds', args.tag)
  return args
}

function run(command, args, cwd) {
  process.stdout.write(`prepare-compat: ${command} ${args.join(' ')}\n`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) fail(`${command} failed with exit ${String(result.status)}`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(join(repoRoot, 'package.json'))) fail('run from a deepseek-harness checkout')
  const target = resolve(args.dir)
  if (existsSync(join(target, 'package.json'))) {
    process.stdout.write(`prepare-compat: reusing ${target}\n`)
  } else {
    mkdirSync(dirname(target), { recursive: true })
    run('git', ['worktree', 'add', '--detach', target, args.tag], repoRoot)
  }
  for (const name of PACKAGES) {
    const relative = join('packages/experimental', name)
    const destination = join(target, relative)
    rmSync(destination, { recursive: true, force: true })
    mkdirSync(destination, { recursive: true })
    for (const entry of COPY_ENTRIES) {
      const source = join(repoRoot, relative, entry)
      if (existsSync(source)) cpSync(source, join(destination, entry), { recursive: true })
    }
    process.stdout.write(`prepare-compat: copied ${relative}\n`)
  }
  for (const patch of ['target.patch', 'plugins.patch']) {
    run('patch', ['-p1', '-d', target, '-i', join(bundleDir, 'compat', patch)], repoRoot)
  }
  if (args.build) {
    run('pnpm', ['install'], target)
    run('pnpm', ['run', 'build:artifacts'], target)
  }
  if (args.linkProfile !== undefined) {
    run('pnpm', ['exec', 'tsx', join(bundleDir, 'src/enable-local.ts'), '--profile', args.linkProfile], target)
  }
  process.stdout.write([
    '',
    `prepare-compat: build ready at ${target}`,
    args.linkProfile === undefined
      ? `Link it with: cd ${target} && pnpm exec tsx packages/experimental/session-tasks-bundle/src/enable-local.ts --profile <name>`
      : `Profile "${args.linkProfile}" now links this build; restart that profile/app to load it.`,
    '',
  ].join('\n'))
}

main()
