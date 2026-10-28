/**
 * Live-session visibility authorization and model-facing rendering built on the
 * shared session-task aggregation.
 *
 * @module @deepseek-ai/dsh-experimental-tool-session-tasks/tasks
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import {
  collectSessionTasks,
  type SessionTaskAgent,
  type SessionTaskHost,
  type SessionTaskView,
} from '@deepseek-ai/dsh-experimental-api-session-tasks'

export type {
  SessionTaskActivityView as SessionTaskActivity,
  SessionTaskActivityViewEntry,
  SessionTaskAgent,
  SessionTaskHost,
  SessionTaskItem,
  SessionTaskView as SessionTaskRow,
} from '@deepseek-ai/dsh-experimental-api-session-tasks'

/** Visibility scopes the deployment may select for the overview. */
export const VISIBLE_SCOPES = ['self', 'same-cwd', 'host'] as const

/** Which live sessions the tool may reveal. */
export type VisibleScope = typeof VISIBLE_SCOPES[number]

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

function revealsSession(scope: VisibleScope, caller: SessionTaskAgent, row: SessionTaskView): boolean {
  if (row.sessionId === caller.session.id) return true
  if (scope === 'self') return false
  if (scope === 'host') return true
  const cwd = caller.session.header.cwd
  return cwd !== undefined && row.cwd === cwd
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
): Promise<SessionTaskView[]> {
  const rows = await collectSessionTasks(host, {
    ...request.include === undefined ? {} : { include: request.include },
  }, signal)
  return rows.filter(row => (request.sessionId === undefined || row.sessionId === request.sessionId)
    && revealsSession(request.scope, caller, row))
}

/**
 * Render the overview as the model-facing tool result.
 * @param rows - Visible session rows.
 * @returns JSON text, or a sentence when no session is visible.
 */
export function renderSessionTasks(rows: readonly SessionTaskView[]): string {
  if (rows.length === 0) return 'No visible sessions are currently active.'
  return JSON.stringify(rows)
}
