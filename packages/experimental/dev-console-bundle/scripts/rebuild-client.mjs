#!/usr/bin/env node
/**
 * Rebuild one checkout's client-plugin bundles so a running Host hot-reloads
 * them (its webserver stat-polls every served bundle and broadcasts a rebuilt
 * frame), without restarting the profile or rebuilding Host artifacts.
 *
 * Usage:
 *   node packages/experimental/dev-console-bundle/scripts/rebuild-client.mjs [--repo <checkout>]
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const defaultRepo = resolve(scriptDir, '../../../..')

function fail(message) {
  process.stderr.write(`rebuild-client: ${message}\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
let repo = defaultRepo
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--repo') repo = resolve(args[++i] ?? fail('--repo needs a path'))
  else fail(`unknown argument ${JSON.stringify(args[i])}`)
}
if (!existsSync(join(repo, 'package.json'))) fail(`${repo} is not a checkout`)

const PACKAGES = [
  'tool-session-tasks',
  'api-session-tasks',
  'client-ui-dev-console',
  'dev-console-bundle',
]
const bundlePaths = PACKAGES.map(pkg => join(repo, 'packages/experimental', pkg, 'lib/client.js'))
// Keep the previous verified bundle next to each rebuilt one so a broken
// refresh can be rolled back without rebuilding the whole host.
for (const bundle of bundlePaths) {
  if (!existsSync(bundle)) continue
  copyFileSync(bundle, `${bundle}.prev.js`)
  if (existsSync(`${bundle}.map`)) copyFileSync(`${bundle}.map`, `${bundle}.map.prev`)
}
// The bundle is produced from `lib/types`, not directly from `src`. Compile
// first so a source edit cannot silently ship an older bundle.
const compile = spawnSync('pnpm', ['exec', 'tsc', '-b', 'packages/experimental/client-ui-dev-console'], { cwd: repo, stdio: 'inherit' })
if (compile.status !== 0) fail(`client source compile failed with exit ${String(compile.status)}`)
const command = 'pnpm'
const result = spawnSync(command, ['exec', 'tsdown', '--config-loader', 'native', '--env.DSH_BUILD_FACE', 'client'], { cwd: repo, stdio: 'inherit' })
if (result.status !== 0) fail(`client bundle build failed with exit ${String(result.status)}`)
for (const bundle of bundlePaths) {
  if (!existsSync(bundle)) continue
  const check = spawnSync(process.execPath, ['--check', bundle], { stdio: 'ignore' })
  if (check.status !== 0) {
    fail(`built client bundle failed syntax validation: ${bundle}\nRun node packages/experimental/dev-console-bundle/scripts/rollback-client.mjs to restore the previous bundle.`)
  }
}
process.stdout.write([
  '',
  `rebuild-client: client bundles rewritten and validated in ${repo}`,
  'A running Host hot-reloads them; refresh its page if the reload did not appear.',
  'The previous bundles were kept as lib/client.js.prev.js for rollback-client.mjs.',
  'Host-side (controller, stream, profile) changes still need a rebuilt artifact tree and a profile restart.',
  '',
].join('\n'))
