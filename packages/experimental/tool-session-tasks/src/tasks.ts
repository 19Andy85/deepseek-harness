/**
 * Live-session enumeration, visibility authorization, and activity aggregation
 * behind the read-only `session_tasks` tool.
 *
 * @module @deepseek-ai/dsh-experimental-tool-session-tasks/tasks
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SessionId, SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'

/** Visibility scopes the deployment may select for the overview. */
export const VISIBLE_SCOPES = ['self', 'same-cwd', 'host'] as const

/** Which live sessions the tool may reveal. */
export type VisibleScope = typeof VISIBLE_SCOPES[number]

/** The parts of one live agent the overview reads. */
export interface SessionTaskAgent {
  /** Live session driven by this agent. */
  readonly session: {
    readonly id: SessionId
    readonly header: Pick<SessionHeader, 'cwd'>
  }
  /** Current lifecycle state of the agent. */
  readonly status: Agent['status']
}

/** Host capabilities the overview reads, separated so tests need no service graph. */
export interface SessionTaskHost {
  /** Live agents registered in this Host. */
  readonly agents: { list(): readonly SessionTaskAgent[] }
  /** Ask composed providers what still runs for one session. */
  activityOf(sessionId: SessionId): Promise<readonly SessionActivity[]>
}

/** One activity item of a family that carries per-item identity. */
export interface SessionTaskItem {
  /** Family-specific identity: a session id, a job id, or a schedule id. */
  readonly id: string
  /** Display label when the family carries one. */
  readonly label?: string
}

/** One reason a visible session counts as active. */
export interface SessionTaskActivity {
  /** Activity family: `turn`, `job`, `subagent`, or `schedule` in the shipped composition. */
  readonly kind: string
  /** Active items of the family, absent for a family without per-item identity. */
  readonly items?: readonly SessionTaskItem[]
}

/** One visible live session and the activity families that still run for it. */
export interface SessionTaskRow {
  /** Session identity. */
  readonly sessionId: string
  /** Absolute working directory the session was created in, when recorded. */
  readonly cwd?: string
  /** Current lifecycle state of the live agent driving the session. */
  readonly status: Agent['status']
  /** Activity families still running for this session, in provider order. */
  readonly activity: readonly SessionTaskActivity[]
}

/** Options resolved from the tool call and plugin configuration. */
export interface SessionTaskRequest {
  /** Which sessions this caller may reveal. */
  readonly scope: VisibleScope
  /** Restrict the overview to one requested session id. */
  readonly sessionId?: string
  /** Activity families to keep; omission keeps every family. */
  readonly include?: readonly string[]
}

/**
 * Read the agent-bound caller from one tool execution.
 * @param exec - Execution carrying the calling agent, when bound.
 * @returns The calling agent.
 * @throws When the tool runs without an agent binding.
 */
export function callerAgent(exec: { readonly agent?: SessionTaskAgent }): SessionTaskAgent {
  const agent = exec.agent
  if (agent === undefined) {
    throw new HarnessError('session task overview requires an agent-bound caller', 'SESSION_TASKS_MISSING_AGENT')
  }
  return agent
}

function revealsSession(scope: VisibleScope, caller: SessionTaskAgent, target: SessionTaskAgent): boolean {
  if (target.session.id === caller.session.id) return true
  if (scope === 'self') return false
  if (scope === 'host') return true
  const cwd = caller.session.header.cwd
  return cwd !== undefined && target.session.header.cwd === cwd
}

function keepActivity(activity: SessionActivity, include: readonly string[] | undefined): boolean {
  return include === undefined || include.includes(activity.kind)
}

function projectActivity(activity: SessionActivity): SessionTaskActivity {
  return {
    kind: activity.kind,
    ...activity.items === undefined ? {} : { items: activity.items.map(item => ({
      id: item.id,
      ...item.label === undefined ? {} : { label: item.label },
    })) },
  }
}

/**
 * Collect the visible live sessions and their running activity families.
 * @param host - Agent registry and activity providers of this Host.
 * @param caller - Agent whose session scopes visibility.
 * @param request - Resolved visibility scope, target session, and family filter.
 * @param signal - Tool call cancellation signal.
 * @returns Visible rows, running sessions first, then ordered by session id.
 */
export async function gatherSessionTasks(
  host: SessionTaskHost,
  caller: SessionTaskAgent,
  request: SessionTaskRequest,
  signal: AbortSignal,
): Promise<SessionTaskRow[]> {
  const requested = request.sessionId === undefined ? undefined : brandString<SessionId>(request.sessionId)
  const rows: SessionTaskRow[] = []
  for (const agent of host.agents.list()) {
    signal.throwIfAborted()
    if (requested !== undefined && agent.session.id !== requested) continue
    if (!revealsSession(request.scope, caller, agent)) continue
    const activity = await host.activityOf(agent.session.id)
    signal.throwIfAborted()
    const cwd = agent.session.header.cwd
    rows.push({
      sessionId: agent.session.id,
      ...cwd === undefined ? {} : { cwd },
      status: agent.status,
      activity: activity.filter(entry => keepActivity(entry, request.include)).map(projectActivity),
    })
  }
  return rows.sort((left, right) => {
    if (left.status !== right.status) return left.status === 'running' ? -1 : 1
    return left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0
  })
}

/**
 * Render the overview as the model-facing tool result.
 * @param rows - Visible session rows.
 * @returns JSON text, or a sentence when no session is visible.
 */
export function renderSessionTasks(rows: readonly SessionTaskRow[]): string {
  if (rows.length === 0) return 'No visible sessions are currently active.'
  return JSON.stringify(rows)
}
