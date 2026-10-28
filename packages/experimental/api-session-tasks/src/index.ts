/**
 * Host Remote owner of the read-only live session task overview consumed by
 * browser pages; it projects `ctx.agents` and the `workspace/session-activity`
 * waterfall and never reads or writes Session content.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'
import { readSessionTasks } from './aggregation.ts'
import type { SessionTaskHost, SessionTasksRequest, SessionTasksSnapshot } from './types.ts'

export type * from './types.ts'
export { collectSessionTasks, readSessionTasks } from './aggregation.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host session task overview Remote namespace owner. */
    sessionTasks: SessionTasksController
  }
}

/** Host service backing the generated `ctx.remote.sessionTasks` namespace. */
export class SessionTasksController extends TypertRemoteService {
  static inject = ['typert', 'agents']

  /**
   * @param ctx - Host context carrying the live Agent registry and workspace registry.
   */
  constructor(ctx: Context) {
    super(ctx, 'sessionTasks', { namespace: 'sessionTasks' })
  }

  /**
   * Read the live sessions of one workspace, or of the whole Host when no
   * workspace is requested, together with their activity families.
   * @param request - optional workspace scope.
   * @returns the consistent overview snapshot.
   */
  @Remote('snapshot')
  async snapshot(request: SessionTasksRequest): Promise<SessionTasksSnapshot> {
    const workspaceRegistry = this.ctx.get('workspaceRegistry')
    return readSessionTasks(this.host(), request, workspaceRegistry, new AbortController().signal)
  }

  private host(): SessionTaskHost {
    return {
      agents: this.ctx.agents,
      activityOf: (sessionId: SessionId): Promise<readonly SessionActivity[]> => this.ctx.waterfall(
        'workspace/session-activity', { sessionId }, () => Promise.resolve([]),
      ),
    }
  }
}

export default SessionTasksController
