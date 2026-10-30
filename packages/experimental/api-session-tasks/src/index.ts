/**
 * Host Remote owner of the read-only live session task overview consumed by
 * browser pages; it projects `ctx.agents` and the `workspace/session-activity`
 * waterfall and never reads or writes Session content.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'
import { followSessionTask, observeActivity, readSessionTasks, type ObservedActivity } from './aggregation.ts'
import type {
  SessionTaskFollowFrame, SessionTaskFollowRequest, SessionTaskHost, SessionTaskMetadata,
  SessionTasksRequest, SessionTasksSnapshot,
} from './types.ts'

export type * from './types.ts'
export { collectSessionTasks, followSessionTask, readSessionTasks } from './aggregation.ts'

/** Default polling cadence of one focused session follow stream. */
const DEFAULT_FOLLOW_INTERVAL_MS = 750

/** Default running-without-observable-change threshold for the stalled judgement. */
const DEFAULT_STALL_AFTER_MS = 900_000

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host session task overview Remote namespace owner. */
    sessionTasks: SessionTasksController
  }
}

/** Session task controller deployment policy. */
export interface Config {
  /** Comparison cadence of a focused session follow stream, in milliseconds (default 750). */
  readonly followIntervalMs?: number
  /** Running-without-observable-change threshold for the stalled flag, in milliseconds (default 900000). */
  readonly stallAfterMs?: number
}

/** Host service backing the generated `ctx.remote.sessionTasks` namespace. */
export class SessionTasksController extends TypertRemoteService {
  static inject = ['typert', 'agents']

  static Config: z<Config> = z.object({
    followIntervalMs: z.natural().min(100).default(DEFAULT_FOLLOW_INTERVAL_MS),
    stallAfterMs: z.natural().min(60_000).default(DEFAULT_STALL_AFTER_MS),
  })

  private readonly followIntervalMs: number
  private readonly stallAfterMs: number
  private readonly observed = new Map<string, ObservedActivity>()

  /**
   * @param ctx - Host context carrying the live Agent registry and workspace registry.
   * @param config - follow stream cadence; schemastery fills the default.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'sessionTasks', { namespace: 'sessionTasks' })
    // schemastery (the exported Config schema) already filled the defaulted fields.
    const resolved = config as Required<Config>
    this.followIntervalMs = resolved.followIntervalMs
    this.stallAfterMs = resolved.stallAfterMs
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
    return readSessionTasks(this.host(), request, workspaceRegistry, new AbortController().signal, {
      stallAfterMs: this.stallAfterMs,
    })
  }

  /**
   * Follow one live Session with row frames until it stops being live.
   * @param request - the Session to follow.
   * @param signal - cancellation owned by the Remote stream carrier.
   * @returns row frames and a final row-less frame.
   * @throws RemoteError when the Session is not live.
   */
  @Remote({ mode: 'stream' })
  follow(request: SessionTaskFollowRequest, signal: AbortSignal): AsyncIterable<SessionTaskFollowFrame> {
    return followSessionTask(this.host(), request, this.followIntervalMs, signal, {
      stallAfterMs: this.stallAfterMs,
    })
  }

  private host(): SessionTaskHost {
    return {
      agents: this.ctx.agents,
      activityOf: async (sessionId: SessionId): Promise<readonly SessionActivity[]> => {
        const entries = await this.ctx.waterfall(
          'workspace/session-activity', { sessionId }, () => Promise.resolve([]),
        )
        return observeActivity(this.observed, sessionId, entries, Date.now())
      },
      metadataOf: (sessionId: SessionId): SessionTaskMetadata | undefined => this.metadataOf(sessionId),
    }
  }

  private metadataOf(sessionId: SessionId): SessionTaskMetadata | undefined {
    const agent = this.ctx.agents.list().find(item => item.session.id === sessionId)
    const projections = this.ctx.get('sessionProjections')
    if (agent === undefined || projections === undefined) return undefined
    const snapshot = projections.snapshot(agent.session, ['title', 'sessionListMetadata'])
    const title = snapshot.values.title
    const metadata = snapshot.values.sessionListMetadata
    const lastPromptAt = metadata?.lastPromptAt
    if ((title === undefined || title === null) && metadata === undefined) return undefined
    return {
      ...title === undefined || title === null ? {} : { title },
      ...lastPromptAt === null || lastPromptAt === undefined ? {} : { lastPromptAt },
      ...metadata === undefined ? {} : { blank: metadata.blank },
    }
  }
}

export default SessionTasksController
