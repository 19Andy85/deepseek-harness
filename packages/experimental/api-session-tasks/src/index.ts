/**
 * Host Remote owner of the read-only live session task overview consumed by
 * browser pages; it projects `ctx.agents` and the `workspace/session-activity`
 * waterfall and never reads or writes Session content.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-workspace-changes'
import type {} from '@deepseek-ai/dsh-tool-todo'
import type {} from '@deepseek-ai/dsh-user-approval'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'
import { followSessionTask, observeActivity, readSessionTasks, type ObservedActivity } from './aggregation.ts'
import { sessionTaskOutcomeProjection } from './outcome.ts'
import { buildChildRelations, type SessionRelationChild } from './relations.ts'
import {
  changedSessionIds, seenRowsOf, sessionTasksSeenDomain, type SeenState,
} from './seen-state.ts'
import type {
  SessionTaskFollowFrame, SessionTaskFollowRequest, SessionTaskHost, SessionTaskMetadata,
  SessionTasksAcknowledgeRequest, SessionTasksAcknowledgeValue,
  SessionTasksRequest, SessionTasksSnapshot,
} from './types.ts'

export type * from './types.ts'
export { collectSessionTasks, followSessionTask, readSessionTasks } from './aggregation.ts'

/** Default polling cadence of one focused session follow stream. */
const DEFAULT_FOLLOW_INTERVAL_MS = 750

/** Default running-without-observable-change threshold for the stalled judgement. */
const DEFAULT_STALL_AFTER_MS = 900_000

/** Default refresh cadence of the durable derivation relation cache. */
const DEFAULT_RELATIONS_REFRESH_MS = 5_000

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
  /** Refresh cadence of the durable derivation relation cache, in milliseconds (default 5000). */
  readonly relationsRefreshMs?: number
}

/** Host service backing the generated `ctx.remote.sessionTasks` namespace. */
export class SessionTasksController extends TypertRemoteService {
  static inject = ['typert', 'agents']

  static Config: z<Config> = z.object({
    followIntervalMs: z.natural().min(100).default(DEFAULT_FOLLOW_INTERVAL_MS),
    stallAfterMs: z.natural().min(60_000).default(DEFAULT_STALL_AFTER_MS),
    relationsRefreshMs: z.natural().min(1_000).default(DEFAULT_RELATIONS_REFRESH_MS),
  })

  private readonly followIntervalMs: number
  private readonly stallAfterMs: number
  private readonly relationsRefreshMs: number
  private readonly observed = new Map<string, ObservedActivity>()
  private seenDomain: Domain<typeof sessionTasksSeenDomain> | undefined
  private relationsByParent = new Map<string, SessionRelationChild[]>()
  private readonly relationsByChild = new Map<string, string>()
  private lastRelationsRefresh = 0

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
    this.relationsRefreshMs = resolved.relationsRefreshMs
  }

  protected async [Service.init](): Promise<void> {
    const seenBinding = this.ctx.inject(['storageDomain'], async (storageCtx) => {
      const domain = await storageCtx.storageDomain.open(sessionTasksSeenDomain)
      this.seenDomain = domain
      return () => { this.seenDomain = undefined; void domain.close() }
    })
    if (this.ctx.get('storageDomain') !== undefined) await seenBinding
    const binding = this.ctx.inject(['sessionProjections'], async (projectionCtx) => {
      const handle = await projectionCtx.sessionProjections.register(sessionTaskOutcomeProjection)
      return () => { void handle.dispose() }
    })
    if (this.ctx.get('sessionProjections') !== undefined) await binding
  }

  /**
   * Read the live sessions of one workspace, or of the whole Host when no
   * workspace is requested, together with their activity families.
   * @param request - optional workspace scope.
   * @returns the consistent overview snapshot.
   */
  @Remote('snapshot')
  async snapshot(request: SessionTasksRequest): Promise<SessionTasksSnapshot> {
    await this.refreshRelations()
    const workspaceRegistry = this.ctx.get('workspaceRegistry')
    const snapshot = await readSessionTasks(this.host(), request, workspaceRegistry, new AbortController().signal, {
      stallAfterMs: this.stallAfterMs,
    })
    const workspaceId = request.workspaceId
    const seen = this.seenDomain?.global.get() as SeenState | undefined
    const previous = workspaceId === undefined ? undefined : seen?.workspaces[workspaceId]
    return previous === undefined
      ? snapshot
      : { ...snapshot, lastSeenAt: previous.lastSeenAt, changes: changedSessionIds(previous, snapshot.sessions) }
  }

  /**
   * Acknowledge the current rows of one workspace as read, replacing its
   * server-side baseline.
   * @param request - workspace whose baseline to replace.
   * @returns the acknowledgement time.
   * @throws RemoteError when no storage domain is mounted.
   */
  @Remote('acknowledge')
  async acknowledge(request: SessionTasksAcknowledgeRequest): Promise<SessionTasksAcknowledgeValue> {
    if (this.seenDomain === undefined) {
      throw new RemoteError('session-tasks/seen-unavailable',
        'session task read state requires a mounted storage domain', {})
    }
    const snapshot = await readSessionTasks(
      this.host(), { workspaceId: request.workspaceId }, this.ctx.get('workspaceRegistry'),
      new AbortController().signal, { stallAfterMs: this.stallAfterMs },
    )
    const state = this.seenDomain.global.get() as SeenState
    const lastSeenAt = Date.now()
    await this.seenDomain.global.set({
      workspaces: {
        ...state.workspaces,
        [request.workspaceId]: { lastSeenAt, rows: seenRowsOf(snapshot.sessions) },
      },
    })
    return { lastSeenAt }
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
    void this.refreshRelations()
    return followSessionTask(this.host(), request, this.followIntervalMs, signal, {
      stallAfterMs: this.stallAfterMs,
    })
  }

  private async refreshRelations(): Promise<void> {
    const query = this.ctx.get('sessionQuery')
    if (query === undefined || Date.now() - this.lastRelationsRefresh < this.relationsRefreshMs) return
    this.lastRelationsRefresh = Date.now()
    try {
      const records = await query.listSessions()
      const childIds = records
        .filter(record => record.header.parentSession !== undefined && record.header.origin === 'subagent')
        .map(record => record.header.id)
      const titles = new Map<string, string>()
      if (childIds.length > 0) {
        try {
          const observations = await query.readTitleSnapshots(childIds, new AbortController().signal)
          for (const observation of observations) {
            if (observation.status !== 'fulfilled') continue
            const title = observation.value.title?.title
            if (title !== undefined) titles.set(String(observation.sessionId), title)
          }
        } catch (error) {
          // Titles decorate the relation graph; relations remain readable without them.
          this.ctx.logger?.warn?.(error)
        }
      }
      this.relationsByParent = buildChildRelations(records, titles)
      this.relationsByChild.clear()
      for (const [parentId, children] of this.relationsByParent) {
        for (const child of children) this.relationsByChild.set(child.sessionId, parentId)
      }
    } catch (error) {
      this.ctx.logger?.warn?.(error)
    }
  }

  private relationsOf(sessionId: SessionId): { parent?: { sessionId: string }; children?: readonly SessionRelationChild[] } | undefined {
    const parentId = this.relationsByChild.get(sessionId)
    const children = this.relationsByParent.get(sessionId)
    if (parentId === undefined && children === undefined) return undefined
    return {
      ...parentId === undefined ? {} : { parent: { sessionId: parentId } },
      ...children === undefined ? {} : { children: children.slice(0, 10) },
    }
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
    const snapshot = projections.snapshot(agent.session, ['title', 'sessionListMetadata', 'sessionTaskOutcome', 'todos'])
    const title = snapshot.values.title
    const metadata = snapshot.values.sessionListMetadata
    const todos = snapshot.values.todos
    const firstInProgress = todos?.find(todo => todo.status === 'in_progress')
    const progress = todos === null || todos === undefined || todos.length === 0
      ? undefined
      : {
        total: todos.length,
        completed: todos.filter(todo => todo.status === 'completed').length,
        inProgress: todos.filter(todo => todo.status === 'in_progress').length,
        ...firstInProgress === undefined ? {} : { current: firstInProgress.content },
      }
    const events = agent.session.snapshotEvents()
    let usage: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      cacheReadTokens: number
      cacheWriteTokens: number
    } | undefined
    for (const event of events) {
      if (event.type !== 'assistant/message' || event.data.usage === undefined) continue
      usage ??= { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
      usage.inputTokens += event.data.usage.inputTokens
      usage.outputTokens += event.data.usage.outputTokens
      usage.totalTokens += event.data.usage.totalTokens ?? event.data.usage.inputTokens + event.data.usage.outputTokens
      usage.cacheReadTokens += event.data.usage.cacheReadTokens ?? 0
      usage.cacheWriteTokens += event.data.usage.cacheWriteTokens ?? 0
    }
    let lastUsage: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
    } | undefined
    for (const event of events) {
      if (event.type !== 'assistant/message' || event.data.usage === undefined) continue
      const usage = event.data.usage
      lastUsage = {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens ?? usage.inputTokens + usage.outputTokens,
        ...usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens },
        ...usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens },
      }
    }
    const decided = new Set<string>()
    let pendingAsk: { toolName: string; callId?: string; reason?: string } | undefined
    for (const event of events) {
      if (event.type === 'approval/decided') decided.add(String(event.data.id))
      if (event.type === 'approval/asked' && !decided.has(String(event.data.id))) {
        pendingAsk = {
          toolName: event.data.toolName,
          ...event.data.callId === undefined ? {} : { callId: String(event.data.callId) },
          ...event.data.reason === undefined ? {} : { reason: event.data.reason },
        }
      }
    }
    let exactCall: { arguments: string } | undefined
    if (pendingAsk?.callId !== undefined) {
      for (const event of events) {
        if (event.type === 'tool/call' && String(event.data.callId) === pendingAsk.callId) {
          exactCall = { arguments: event.data.arguments }
          break
        }
      }
    }
    const approval = pendingAsk === undefined
      ? undefined
      : {
        ...pendingAsk,
        ...exactCall === undefined
          ? {}
          : {
            arguments: exactCall.arguments.length > 1200
              ? `${exactCall.arguments.slice(0, 1200)}…`
              : exactCall.arguments,
          },
      }
    const lastCall = events.findLast(event => event.type === 'tool/call')
    const toolCall = lastCall === undefined
      ? undefined
      : {
        name: lastCall.data.name,
        arguments: lastCall.data.arguments.length > 240
          ? `${lastCall.data.arguments.slice(0, 240)}…`
          : lastCall.data.arguments,
      }
    const outcome = snapshot.values.sessionTaskOutcome
    const lastPromptAt = metadata?.lastPromptAt
    const relations = this.relationsOf(agent.session.id)
    const summary = outcome?.changesSeq === undefined
      ? undefined
      : this.ctx.get('workspaceChanges')?.summary(agent.session.id, outcome.changesSeq)
    const changes = summary === undefined
      ? undefined
      : {
        total: summary.total,
        added: summary.added,
        deleted: summary.deleted,
        files: summary.files.slice(0, 3).map(file => file.display),
      }
    const empty = (title === undefined || title === null)
      && metadata === undefined && outcome === undefined && relations === undefined && changes === undefined
    if (empty) return undefined
    return {
      ...title === undefined || title === null ? {} : { title },
      ...lastPromptAt === null || lastPromptAt === undefined ? {} : { lastPromptAt },
      ...metadata === undefined ? {} : { blank: metadata.blank },
      ...outcome?.kind === undefined ? {} : { outcome: outcome.kind },
      ...outcome?.at === undefined ? {} : { outcomeAt: outcome.at },
      ...outcome?.reason === undefined ? {} : { outcomeReason: outcome.reason },
      ...lastUsage === undefined ? {} : { lastUsage },
      ...usage === undefined ? {} : {
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          ...usage.cacheReadTokens === 0 ? {} : { cacheReadTokens: usage.cacheReadTokens },
          ...usage.cacheWriteTokens === 0 ? {} : { cacheWriteTokens: usage.cacheWriteTokens },
        },
      },
      ...progress === undefined ? {} : { progress },
      ...toolCall === undefined ? {} : { toolCall },
      ...approval === undefined ? {} : { approval },
      ...changes === undefined ? {} : { changes },
      ...relations === undefined ? {} : { relations },
    }
  }
}

export default SessionTasksController
