/**
 * Local enablement for the experimental project-console bundle: link the
 * bundle and the packages its patch composes into a dsh profile without
 * publishing anything to npm.
 *
 * @module @deepseek-ai/dsh-experimental-dev-console-bundle/enable-local
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The bundle this script enables. */
export const BUNDLE_NAME = '@deepseek-ai/dsh-experimental-dev-console-bundle'

/** Packages the bundle's patch inserts; each row resolves through the same profile. */
export const COMPOSED_PACKAGES = [
  '@deepseek-ai/dsh-experimental-api-session-tasks',
  '@deepseek-ai/dsh-experimental-client-ui-dev-console',
  '@deepseek-ai/dsh-experimental-tool-session-tasks',
] as const

/** Profile manifest shape this script reads and writes. */
export interface ProfileManifest {
  readonly name?: string
  readonly private?: boolean
  readonly dependencies?: Readonly<Record<string, string>>
  readonly dsh?: {
    readonly profile?: {
      readonly bundles?: readonly string[]
      readonly [key: string]: unknown
    }
    readonly [key: string]: unknown
  }
  readonly [key: string]: unknown
}

/** One package directory relative to the repository root. */
const PACKAGE_DIRS: Readonly<Record<string, string>> = {
  [BUNDLE_NAME]: 'packages/experimental/dev-console-bundle',
  '@deepseek-ai/dsh-experimental-api-session-tasks': 'packages/experimental/api-session-tasks',
  '@deepseek-ai/dsh-experimental-client-ui-dev-console': 'packages/experimental/client-ui-dev-console',
  '@deepseek-ai/dsh-experimental-tool-session-tasks': 'packages/experimental/tool-session-tasks',
}

/**
 * Build the `link:` dependency entries a profile needs.
 * @param repoRoot - absolute repository root.
 * @returns dependency name to `link:` spec.
 */
export function linkDependencies(repoRoot: string): Record<string, string> {
  return Object.fromEntries(Object.entries(PACKAGE_DIRS).map(([name, dir]) => [name, `link:${join(repoRoot, dir)}`]))
}

/**
 * Enable the bundle in one profile manifest without mutating the input.
 * Idempotent: an already-linked dependency keeps its spec, and the bundle
 * appears once in the bundles list.
 * @param manifest - parsed profile package.json.
 * @param repoRoot - absolute repository root.
 * @returns the next manifest.
 */
export function enableManifest(manifest: ProfileManifest, repoRoot: string): ProfileManifest {
  const dependencies = { ...manifest.dependencies, ...linkDependencies(repoRoot) }
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const nextBundles = bundles.includes(BUNDLE_NAME) ? bundles : [...bundles, BUNDLE_NAME]
  return {
    ...manifest,
    dependencies,
    dsh: {
      ...manifest.dsh,
      profile: { ...manifest.dsh?.profile, bundles: nextBundles },
    },
  }
}

/**
 * Revert {@link enableManifest} by removing the links and the bundle entry.
 * @param manifest - parsed profile package.json.
 * @returns the next manifest.
 */
export function disableManifest(manifest: ProfileManifest): ProfileManifest {
  const dependencies = Object.fromEntries(Object.entries(manifest.dependencies ?? {})
    .filter(([name]) => !(name in PACKAGE_DIRS)))
  const bundles = (manifest.dsh?.profile?.bundles ?? []).filter(name => name !== BUNDLE_NAME)
  return {
    ...manifest,
    dependencies,
    dsh: {
      ...manifest.dsh,
      profile: { ...manifest.dsh?.profile, bundles },
    },
  }
}

/**
 * Resolve one profile's directory.
 * @param options - profile name and optional dsh home.
 * @returns absolute profile directory.
 */
export function profileDirectory(options: { profile: string; home?: string }): string {
  const home = options.home ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'profiles', options.profile)
}

/**
 * Apply one enable or removal pass to a profile: rewrite package.json, then
 * install the linked packages through pnpm in the profile directory.
 * @param args - parsed command line.
 * @returns process exit code.
 */
export function run(args: { profile: string; home?: string; remove: boolean; dryRun: boolean }): number {
  const profileDir = profileDirectory(args)
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ProfileManifest
  const next = args.remove ? disableManifest(manifest) : enableManifest(manifest, resolve(dirname(fileURLToPath(import.meta.url)), '../../../../'))
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify(next, null, 2)}\n`)
    return 0
  }
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
  const install = spawnSync('pnpm', ['install'], { cwd: profileDir, stdio: 'inherit' })
  if (install.status !== 0) {
    process.stderr.write(`enable-local: pnpm install failed in ${profileDir}\n`)
    return install.status ?? 1
  }
  process.stdout.write(args.remove
    ? `enable-local: removed the project-console bundle from profile "${args.profile}"\n`
    : `enable-local: enabled the project-console bundle in profile "${args.profile}"; restart \`dsh --profile ${args.profile}\`\n`)
  return 0
}

/** Parse `--profile`, `--home`, `--remove`, and `--dry-run`. */
function main(argv: readonly string[]): number {
  let profile = 'web'
  let home: string | undefined
  let remove = false
  let dryRun = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile') profile = argv[++index] ?? profile
    else if (arg === '--home') home = argv[++index]
    else if (arg === '--remove') remove = true
    else if (arg === '--dry-run') dryRun = true
    else if (arg !== undefined) throw new Error(`enable-local: unknown argument ${JSON.stringify(arg)}`)
  }
  return run({ profile, ...home === undefined ? {} : { home }, remove, dryRun })
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
