#!/usr/bin/env node
/**
 * Restore the client bundles saved before the latest rebuild.
 *
 * Usage:
 *   node packages/experimental/dev-console-bundle/scripts/rollback-client.mjs [--repo <checkout>] [--dry-run]
 */
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const defaultRepo = resolve(scriptDir, '../../../..')
const PACKAGES = ['tool-session-tasks', 'api-session-tasks', 'client-ui-dev-console', 'dev-console-bundle']

const args = process.argv.slice(2)
let repo = defaultRepo
let dryRun = false
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--repo') repo = resolve(args[++i] ?? process.exit(1))
  else if (args[i] === '--dry-run') dryRun = true
}

let restored = 0
for (const pkg of PACKAGES) {
  const base = join(repo, 'packages/experimental', pkg, 'lib')
  const bundle = join(base, 'client.js')
  const previous = `${bundle}.prev.js`
  if (!existsSync(previous)) continue
  restored += 1
  if (dryRun) continue
  copyFileSync(previous, bundle)
  if (existsSync(`${bundle}.map.prev`)) copyFileSync(`${bundle}.map.prev`, `${bundle}.map`)
}
process.stdout.write(dryRun
  ? `rollback-client: ${String(restored)} bundle(s) would be restored in ${repo}\n`
  : `rollback-client: restored ${String(restored)} bundle(s) in ${repo}\nRestart the app (or refresh) to load them.\n`)
