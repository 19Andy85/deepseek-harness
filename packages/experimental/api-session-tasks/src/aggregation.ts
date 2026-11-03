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

/** Read options that control time-dependent judgements. */
export interface SessionTasksReadOptions {
  /** Reference time for the stalled judgement; defaults to now. */
  readonly now?: number
  /** Running-without-change threshold; omission disables the stalled judgement. */
  readonly stallAfterMs?: number
}

/** One activity family's observed timing. */
export interface ObservedActivity {
  /** First time this family was observed. */
  readonly startedAt: number
  /** Most recent observed change of this family. */
  readonly lastActivityAt: number
  /** Item-identity signature compared between observations. */
  readonly signature: string
}

/**
 * Stamp provider activities with observed timing, retaining the first sighting
 * as the start and only refreshing `lastActivityAt` when the family's items change.
 * @param observed - per family timing retained by the caller.
 * @param sessionId - Session the activities belong to.
 * @param entries - provider-reported activities.
 * @param now - observation time.
 * @returns activities carrying observed timestamps.
 */
export function observeActivity(
  observed: Map<string, ObservedActivity>,
  sessionId: string,
  entries: readonly SessionActivity[],
  now: number,
): SessionActivity[] {
  return entries.map((entry) => {
    const key = `${sessionId}:${entry.kind}`
    const signature = (entry.items ?? []).map(item => item.id).join(',')
    const previous = observed.get(key)
    const next: ObservedActivity = previous === undefined
      ? { startedAt: now, lastActivityAt: now, signature }
      : { startedAt: previous.startedAt, lastActivityAt: previous.signature === signature ? previous.lastActivityAt : now, signature }
    observed.set(key, next)
    return { ...entry, startedAt: next.startedAt, lastActivityAt: next.lastActivityAt }
  })
}

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
    ...item.startedAt === undefined ? {} : { startedAt: item.startedAt },
  }))
  return {
    kind: activity.kind,
    ...activity.startedAt === undefined ? {} : { startedAt: activity.startedAt },
    ...activity.lastActivityAt === undefined ? {} : { lastActivityAt: activity.lastActivityAt },
    ...items === undefined ? {} : { items },
  }
}

/**
 * Decide whether a running Session showed no observable change within the threshold.
 * @param status - Session lifecycle state.
 * @param activity - projected activity families.
 * @param options - reference time and threshold; an omitted threshold disables the judgement.
 * @returns true when every timed family is older than the threshold.
 */
function isStalled(
  status: 'idle' | 'running',
  activity: readonly SessionTaskActivityViewEntry[],
  options: SessionTasksReadOptions,
): boolean | undefined {
  if (status !== 'running' || options.stallAfterMs === undefined) return undefined
  const times = activity.map(entry => entry.lastActivityAt).filter((at): at is number => at !== undefined)
  if (times.length === 0) return undefined
  const latest = Math.max(...times)
  return (options.now ?? Date.now()) - latest > options.stallAfterMs
}

function keepActivity(activity: SessionActivity, include: readonly string[] | undefined): boolean {
  return include === undefined || include.includes(activity.kind)
}

async function readRow(
  host: SessionTaskHost,
  agent: ReturnType<SessionTaskHost['agents']['list']>[number],
  options: CollectSessionTasksOptions,
  signal: AbortSignal,
  readOptions: SessionTasksReadOptions,
): Promise<SessionTaskView> {
  const cwd = agent.session.header.cwd
  signal.throwIfAborted()
  const metadata = host.metadataOf?.(agent.session.id)
  const activity = (await host.activityOf(agent.session.id)).filter(entry => keepActivity(entry, options.include)).map(projectActivity)
  const stalled = isStalled(agent.status, activity, readOptions)
  return {
    sessionId: agent.session.id,
    ...cwd === undefined ? {} : { cwd },
    status: agent.status,
    ...metadata?.title === undefined ? {} : { title: metadata.title },
    ...metadata?.lastPromptAt === undefined ? {} : { lastPromptAt: metadata.lastPromptAt },
    ...metadata?.blank === undefined ? {} : { blank: metadata.blank },
    ...metadata?.outcome === undefined ? {} : { outcome: metadata.outcome },
    ...metadata?.outcomeAt === undefined ? {} : { outcomeAt: metadata.outcomeAt },
    ...metadata?.outcomeReason === undefined ? {} : { outcomeReason: metadata.outcomeReason },
    ...metadata?.usage === undefined ? {} : { usage: metadata.usage },
    ...metadata?.lastUsage === undefined ? {} : { lastUsage: metadata.lastUsage },
    ...metadata?.progress === undefined ? {} : { progress: metadata.progress },
    ...metadata?.toolCall === undefined ? {} : { toolCall: metadata.toolCall },
    ...metadata?.approval === undefined ? {} : { approval: metadata.approval },
    ...metadata?.changes === undefined ? {} : { changes: metadata.changes },
    ...metadata?.relations === undefined ? {} : { relations: metadata.relations },
    activity,
    ...stalled === undefined ? {} : { stalled },
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
  readOptions: SessionTasksReadOptions = {},
): Promise<SessionTaskView[]> {
  const rows: SessionTaskView[] = []
  for (const agent of host.agents.list()) {
    signal.throwIfAborted()
    const cwd = agent.session.header.cwd
    if (options.cwd !== undefined && cwd !== options.cwd) continue
    rows.push(await readRow(host, agent, options, signal, readOptions))
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
  readOptions: SessionTasksReadOptions = {},
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
    const row = agent === undefined ? undefined : await readRow(host, agent, {}, signal, readOptions)
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
  readOptions: SessionTasksReadOptions = {},
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
  const sessions = await collectSessionTasks(host, { ...workspace === undefined ? {} : { cwd: workspace.path } }, signal, readOptions)
  return {
    ...workspace === undefined ? {} : { workspaceId: workspace.id, workspacePath: workspace.path },
    sessions,
  }
}
