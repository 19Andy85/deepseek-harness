/** Row projection for the console list: hide placeholders and order by relevance. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'

function hasNothingToShow(session: SessionTaskView): boolean {
  if (session.blank === true) return true
  return session.status === 'idle'
    && session.title === undefined
    && session.lastPromptAt === undefined
    && session.activity.length === 0
}

/**
 * Visible console rows: hide placeholders, then order by relevance.
 * @param sessions - rows reported by the Remote.
 * @returns rows with content, running first, then latest prompt first.
 */
export function visibleSessions(sessions: readonly SessionTaskView[]): SessionTaskView[] {
  return sessions
    .filter(session => !hasNothingToShow(session))
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
