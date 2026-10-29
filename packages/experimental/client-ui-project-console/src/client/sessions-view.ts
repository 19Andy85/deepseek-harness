/** Row projection for the console list: hide placeholders and order by relevance. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'

/**
 * Visible console rows.
 * @param sessions - rows reported by the Remote.
 * @returns non-blank rows, running first, then latest prompt first.
 */
export function visibleSessions(sessions: readonly SessionTaskView[]): SessionTaskView[] {
  return sessions
    .filter(session => session.blank !== true)
    .sort((left, right) => (left.status === right.status
      ? (right.lastPromptAt ?? 0) - (left.lastPromptAt ?? 0)
      : left.status === 'running' ? -1 : 1))
}

/**
 * Count running rows among the visible console rows.
 * @param sessions - visible rows.
 * @returns number of running sessions.
 */
export function runningCount(sessions: readonly SessionTaskView[]): number {
  return sessions.filter(session => session.status === 'running').length
}
