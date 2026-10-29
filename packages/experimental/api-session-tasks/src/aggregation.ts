/**
 * Pure aggregation of live sessions and their provider-reported activity
 * families, plus the workspace-scoped projection the Remote serves.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/aggregation
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type {
  CollectSessionTasksOptions, SessionTaskActivityView, SessionTaskActivityViewEntry,
  SessionTaskFollowFrame, SessionTaskFollowRequest, SessionTaskHost, SessionTaskView,
  SessionTasksRequest, SessionTasksSnapshot,
} from './types.ts'

/** One workspace record the overview scope needs. */
export interface WorkspaceScope {
  /** Stable record id. */
  readonly id: string
  /** Canonical directory path of the workspace. */
  readonly path: string
}

/** The workspace lookup the Remote needs; the registry itself stays a Host service. */
export interface WorkspaceLookup {
  /**
   * Resolve one registered workspace.
   * @param id - branded workspace identity.
   * @returns the workspace scope, or undefined when the id is not registered.
   */
  get(id: WorkspaceId): WorkspaceScope | undefined
}

function projectActivity(activity: SessionActivity): SessionTaskActivityViewEntry {
  const items: SessionTaskActivityView[] | undefined = activity.items?.map(item => ({
    id: item.id,
    ...item.label === undefined ? {} : { label: item.label },
  }))
  return { kind: activity.kind, ...items === undefined ? {} : { items } }
}

function keepActivity(activity: SessionActivity, include: readonly string[] | undefined): boolean {
  return include === undefined || include.includes(activity.kind)
}

async function readRow(
  host: SessionTaskHost,
  agent: ReturnType<SessionTaskHost['agents']['list']>[number],
  options: CollectSessionTasksOptions,
  signal: AbortSignal,
): Promise<SessionTaskView> {
  const cwd = agent.session.header.cwd
  const activity = await host.activityOf(agent.session.id)
  signal.throwIfAborted()
  const metadata = host.metadataOf?.(agent.session.id)
  return {
    sessionId: agent.session.id,
    ...cwd === undefined ? {} : { cwd },
    status: agent.status,
    ...metadata?.title === undefined ? {} : { title: metadata.title },
    ...metadata?.lastPromptAt === undefined ? {} : { lastPromptAt: metadata.lastPromptAt },
    ...metadata?.blank === undefined ? {} : { blank: metadata.blank },
    activity: activity.filter(entry => keepActivity(entry, options.include)).map(projectActivity),
  }
}

/**
 * Collect live sessions of this Host with the activity families they still run.
 * @param host - Agent registry and activity providers of this Host.
 * @param options - Working-directory scope and activity-family filter.
 * @param signal - Cancellation observed between session reads.
 * @returns Visible rows, running sessions first, then ordered by session id.
 */
export async function collectSessionTasks(
  host: SessionTaskHost,
  options: CollectSessionTasksOptions,
  signal: AbortSignal,
): Promise<SessionTaskView[]> {
  const rows: SessionTaskView[] = []
  for (const agent of host.agents.list()) {
    signal.throwIfAborted()
    const cwd = agent.session.header.cwd
    if (options.cwd !== undefined && cwd !== options.cwd) continue
    rows.push(await readRow(host, agent, options, signal))
  }
  return rows.sort((left, right) => {
    if (left.status !== right.status) return left.status === 'running' ? -1 : 1
    return left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0
  })
}

function sleep(intervalMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, intervalMs)
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })
}

/**
 * Follow one live Session, yielding a frame whenever its row changes and a
 * final frame without a row once the Session stops being live.
 * @param host - Agent registry and activity providers of this Host.
 * @param request - the Session to follow.
 * @param intervalMs - polling cadence between row comparisons.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns the row frames.
 * @throws RemoteError when the requested Session is not live.
 */
export async function* followSessionTask(
  host: SessionTaskHost,
  request: SessionTaskFollowRequest,
  intervalMs: number,
  signal: AbortSignal,
): AsyncIterable<SessionTaskFollowFrame> {
  let seen: string | undefined
  let started = false
  while (!signal.aborted) {
    signal.throwIfAborted()
    const agent = host.agents.list().find(item => item.session.id === request.sessionId)
    if (!started && agent === undefined) {
      throw new RemoteError('session-tasks/session-not-found',
        `session task follow: session "${request.sessionId}" is not live in this Host`, {})
    }
    started = true
    const row = agent === undefined ? undefined : await readRow(host, agent, {}, signal)
    const key = row === undefined ? '' : JSON.stringify(row)
    if (key !== seen) {
      seen = key
      yield { sessionId: request.sessionId, ...row === undefined ? {} : { row } }
      if (row === undefined) return
    }
    await sleep(intervalMs, signal)
  }
}

/**
 * Read one workspace-scoped overview for a browser.
 * @param host - Agent registry and activity providers of this Host.
 * @param request - Optional workspace scope.
 * @param lookup - Workspace registry lookup, or undefined when no registry is mounted.
 * @param signal - Cancellation observed between session reads.
 * @returns The consistent snapshot served over the Remote.
 * @throws RemoteError when a requested workspace is unknown or no registry is mounted.
 */
export async function readSessionTasks(
  host: SessionTaskHost,
  request: SessionTasksRequest,
  lookup: WorkspaceLookup | undefined,
  signal: AbortSignal,
): Promise<SessionTasksSnapshot> {
  let workspace: WorkspaceScope | undefined
  if (request.workspaceId !== undefined) {
    if (lookup === undefined) {
      throw new RemoteError('session-tasks/workspace-unavailable',
        'session task overview requires a mounted workspace registry to read one workspace', {})
    }
    workspace = lookup.get(brandString<WorkspaceId>(request.workspaceId))
    if (workspace === undefined) {
      throw new RemoteError('session-tasks/workspace-not-found',
        `session task overview: workspace "${request.workspaceId}" is not registered`, {})
    }
  }
  const sessions = await collectSessionTasks(host, { ...workspace === undefined ? {} : { cwd: workspace.path } }, signal)
  return {
    ...workspace === undefined ? {} : { workspaceId: workspace.id, workspacePath: workspace.path },
    sessions,
  }
}
