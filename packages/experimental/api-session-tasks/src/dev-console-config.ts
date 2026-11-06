/** Dev Console project/workspace registry loaded from `.dsh/dev-console.yaml`. */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { load } from 'js-yaml'

/** A configured agent adapter for one workspace. */
export interface DevConsoleAgentConfig {
  /** Adapter kind; `dsh-session` is the first supported adapter. */
  readonly adapter: 'dsh-session' | 'cli' | 'mcp'
  /** Executable for external adapters. */
  readonly command?: string
  /** Arguments for external adapters. */
  readonly args?: readonly string[]
}

/** One workspace's worktree and expectations. */
export interface DevConsoleWorkspaceConfig {
  /** Stable workspace identity. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** Absolute worktree path as configured. */
  readonly worktree: string
  /** Canonical worktree path when it exists. */
  readonly canonicalWorktree?: string
  /** Expected branch. */
  readonly branch: string
  /** Base branch. */
  readonly base: string
  /** Optional derived-data directory. */
  readonly derivedData?: string
  /** Agent adapter. */
  readonly agent: DevConsoleAgentConfig
  /** Git guard expectations. */
  readonly hooks: {
    readonly expectedBranch: string
    readonly expectedToplevel: string
    readonly expectedCanonicalToplevel?: string
    readonly install?: boolean
  }
}

/** One project and its workspaces. */
export interface DevConsoleProjectConfig {
  /** Stable project identity. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** Absolute project root. */
  readonly root: string
  /** Workspaces in this project. */
  readonly workspaces: readonly DevConsoleWorkspaceConfig[]
}

/** Whole registry. */
export interface DevConsoleConfig {
  /** Schema version. */
  readonly version: 1
  /** Configured projects. */
  readonly projects: readonly DevConsoleProjectConfig[]
}

/** A config problem that prevents safe use. */
export interface DevConsoleConfigProblem {
  /** Machine-readable problem code. */
  readonly code: string
  /** Human-readable location such as `projects[0].workspaces[1].worktree`. */
  readonly path: string
  /** Explanation. */
  readonly message: string
}

/** Result of loading and validating a registry. */
export interface DevConsoleConfigResult {
  /** Parsed registry when structurally valid, otherwise undefined. */
  readonly config?: DevConsoleConfig
  /** Problems found; empty means usable. */
  readonly problems: readonly DevConsoleConfigProblem[]
  /** Non-blocking warnings that the UI should surface. */
  readonly warnings: readonly DevConsoleConfigProblem[]
}

const fail = (path: string, code: string, message: string): DevConsoleConfigProblem => ({ path, code, message })

/**
 * Read and validate a Dev Console registry.
 * @param file - absolute or cwd-relative config path.
 * @returns parsed config and validation problems.
 */
export function loadDevConsoleConfig(file: string): DevConsoleConfigResult {
  const absolute = isAbsolute(file) ? file : resolve(process.cwd(), file)
  if (!existsSync(absolute)) return { problems: [fail('$', 'missing-config', `config not found: ${absolute}`)], warnings: [] }
  let raw: unknown
  try { raw = load(readFileSync(absolute, 'utf8')) } catch (error) {
    return { problems: [fail('$', 'invalid-yaml', error instanceof Error ? error.message : String(error))], warnings: [] }
  }
  return validateConfig(raw)
}

/**
 * Validate an already-parsed registry and canonicalize existing paths.
 * @param value - parsed YAML value.
 * @returns config and problems.
 */
export function validateConfig(value: unknown): DevConsoleConfigResult {
  const problems: DevConsoleConfigProblem[] = []
  const warnings: DevConsoleConfigProblem[] = []
  const object = value as Record<string, unknown> | null
  if (object === null || typeof object !== 'object' || Array.isArray(object)) {
    return { problems: [fail('$', 'not-object', 'config must be an object')], warnings: [] }
  }
  if (object['version'] !== 1) problems.push(fail('version', 'unsupported-version', 'version must be 1'))
  const projectsRaw = object['projects']
  if (!Array.isArray(projectsRaw) || projectsRaw.length === 0) {
    return { problems: [...problems, fail('projects', 'missing-projects', 'projects must be a non-empty array')], warnings }
  }
  const projectIds = new Set<string>()
  const workspaceIds = new Set<string>()
  const projects: DevConsoleProjectConfig[] = []
  projectsRaw.forEach((projectValue, projectIndex) => {
    const projectPath = `projects[${String(projectIndex)}]`
    if (projectValue === null || typeof projectValue !== 'object' || Array.isArray(projectValue)) {
      problems.push(fail(projectPath, 'not-object', 'project must be an object'))
      return
    }
    const project = projectValue as Record<string, unknown>
    const id = text(project['id'], `${projectPath}.id`, problems)
    const name = text(project['name'], `${projectPath}.name`, problems)
    const root = absoluteText(project['root'], `${projectPath}.root`, problems)
    if (id !== undefined) {
      if (projectIds.has(id)) problems.push(fail(`${projectPath}.id`, 'duplicate-project', `duplicate project id: ${id}`))
      projectIds.add(id)
    }
    const workspacesRaw = project['workspaces']
    const workspaces: DevConsoleWorkspaceConfig[] = []
    if (!Array.isArray(workspacesRaw) || workspacesRaw.length === 0) {
      problems.push(fail(`${projectPath}.workspaces`, 'missing-workspaces', 'workspaces must be a non-empty array'))
    } else {
      workspacesRaw.forEach((workspaceValue, workspaceIndex) => {
        const workspacePath = `${projectPath}.workspaces[${String(workspaceIndex)}]`
        if (workspaceValue === null || typeof workspaceValue !== 'object' || Array.isArray(workspaceValue)) {
          problems.push(fail(workspacePath, 'not-object', 'workspace must be an object'))
          return
        }
        const workspace = workspaceValue as Record<string, unknown>
        const workspaceId = text(workspace['id'], `${workspacePath}.id`, problems)
        const workspaceName = text(workspace['name'], `${workspacePath}.name`, problems)
        const worktree = absoluteText(workspace['worktree'], `${workspacePath}.worktree`, problems)
        const branch = text(workspace['branch'], `${workspacePath}.branch`, problems)
        const base = text(workspace['base'], `${workspacePath}.base`, problems)
        if (workspaceId !== undefined) {
          if (workspaceIds.has(workspaceId)) problems.push(fail(`${workspacePath}.id`, 'duplicate-workspace', `duplicate workspace id: ${workspaceId}`))
          workspaceIds.add(workspaceId)
        }
        const hooksValue = workspace['hooks']
        if (hooksValue === null || typeof hooksValue !== 'object' || Array.isArray(hooksValue)) {
          problems.push(fail(`${workspacePath}.hooks`, 'missing-hooks', 'hooks must be an object'))
          return
        }
        const hooks = hooksValue as Record<string, unknown>
        const expectedBranch = text(hooks['expectedBranch'], `${workspacePath}.hooks.expectedBranch`, problems)
        const expectedToplevel = absoluteText(hooks['expectedToplevel'], `${workspacePath}.hooks.expectedToplevel`, problems)
        const agentValue = workspace['agent']
        if (agentValue === null || typeof agentValue !== 'object' || Array.isArray(agentValue)) {
          problems.push(fail(`${workspacePath}.agent`, 'missing-agent', 'agent must be an object'))
          return
        }
        const agent = agentValue as Record<string, unknown>
        const adapterValue = agent['adapter']
        let adapter: DevConsoleAgentConfig['adapter'] = 'dsh-session'
        if (adapterValue === 'dsh-session' || adapterValue === 'cli' || adapterValue === 'mcp') adapter = adapterValue
        else problems.push(fail(`${workspacePath}.agent.adapter`, 'invalid-adapter', 'adapter must be dsh-session, cli, or mcp'))
        const derivedData = workspace['derivedData'] === undefined
          ? undefined
          : absoluteText(workspace['derivedData'], `${workspacePath}.derivedData`, problems)
        const canonicalWorktree = worktree === undefined ? undefined : canonical(worktree, `${workspacePath}.worktree`, problems)
        if (worktree !== undefined && isEphemeralPath(worktree)) {
          warnings.push(fail(`${workspacePath}.worktree`, 'ephemeral-path', 'worktree is under a temporary directory; state may be lost on reboot'))
        }
        const expectedCanonicalToplevel = expectedToplevel === undefined
          ? undefined
          : canonical(expectedToplevel, `${workspacePath}.hooks.expectedToplevel`, problems)
        if (workspaceId === undefined || workspaceName === undefined || worktree === undefined || branch === undefined || base === undefined
          || expectedBranch === undefined || expectedToplevel === undefined) return
        workspaces.push({
          id: workspaceId,
          name: workspaceName,
          worktree,
          ...canonicalWorktree === undefined ? {} : { canonicalWorktree },
          branch,
          base,
          ...derivedData === undefined ? {} : { derivedData },
          agent: {
            adapter,
            ...agent['command'] === undefined ? {} : { command: String(agent['command']) },
            ...agent['args'] === undefined ? {} : { args: Array.isArray(agent['args']) ? agent['args'].map(String) : [] },
          },
          hooks: {
            expectedBranch,
            expectedToplevel,
            ...expectedCanonicalToplevel === undefined ? {} : { expectedCanonicalToplevel },
            ...hooks['install'] === undefined ? {} : { install: hooks['install'] === true },
          },
        })
      })
    }
    if (id === undefined || name === undefined || root === undefined) return
    projects.push({ id, name, root, workspaces })
  })
  return problems.length === 0
    ? { config: { version: 1, projects }, problems: [], warnings }
    : { problems, warnings }
}

/**
 * Whether a path lives under an operating-system temporary directory.
 * @param path - absolute path to classify.
 * @returns true for known temporary roots.
 */
export function isEphemeralPath(path: string): boolean {
  const roots = ['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', tmpdir()]
  const normalized = path.startsWith('/private/') ? path.slice('/private'.length) : path
  return roots.some(root => normalized === root || normalized.startsWith(`${root}/`))
}

function text(value: unknown, path: string, problems: DevConsoleConfigProblem[]): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(fail(path, 'missing-text', 'must be a non-empty string'))
    return undefined
  }
  return value.trim()
}

function absoluteText(value: unknown, path: string, problems: DevConsoleConfigProblem[]): string | undefined {
  const parsed = text(value, path, problems)
  if (parsed !== undefined && !isAbsolute(parsed)) {
    problems.push(fail(path, 'not-absolute', 'must be an absolute path'))
    return undefined
  }
  return parsed
}

function canonical(path: string, field: string, problems: DevConsoleConfigProblem[]): string | undefined {
  if (!existsSync(path)) {
    problems.push(fail(field, 'missing-path', `path does not exist: ${path}`))
    return undefined
  }
  try { return realpathSync(path) } catch (error) {
    problems.push(fail(field, 'unresolvable-path', error instanceof Error ? error.message : String(error)))
    return undefined
  }
}
