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
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { copyFile, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import { promisify } from 'node:util'
import { dump, load } from 'js-yaml'
import { loadDevConsoleConfig, validateConfig } from './dev-console-config.ts'
import { devConsoleStateDomain, EMPTY_DEV_CONSOLE_STATE, type DevConsoleAuditEntry, type DevConsoleState } from './dev-console-state.ts'
import {
  BRIEF_TRANSITIONS, createMessage, devConsoleBusDomain, EMPTY_DEV_CONSOLE_BUS,
  type DevConsoleBrief, type DevConsoleBusState, type DevConsoleMessage, type DevConsolePlan,
} from './dev-console-bus.ts'
import { inspectWorkspace, openWorkspace } from './dev-console-workspace.ts'
import type { DevConsoleWorkspaceConfig } from './dev-console-config.ts'
import type {
  DevConsoleAgentsRequest, DevConsoleAgentsValue, DevConsoleAutoConfigRequest, DevConsoleAutoConfigValue,
  DevConsoleSummary, DevConsoleSummaryRequest,
  DevConsoleApprovePlanRequest, DevConsoleBindRequest, DevConsoleBriefsRequest, DevConsoleBriefsValue, DevConsoleConfigValue,
  DevConsoleDirectiveRequest, DevConsoleDirectiveValue, DevConsoleSessionContextRequest, DevConsoleSessionContextValue,
  DevConsoleCreateBriefRequest, DevConsoleCreatePlanRequest,
  DevConsoleHandoffRequest, DevConsoleHistoryRequest, DevConsoleHistoryValue, DevConsoleInboxRequest, DevConsoleInboxValue,
  DevConsoleMessageActionRequest,
  DevConsoleMessagesRequest, DevConsoleMessagesValue, DevConsolePlanStepUpdateRequest, DevConsolePlansRequest, DevConsolePlansValue,
  DevConsoleRevisePlanRequest, DevConsoleSendMessageRequest, DevConsoleStateValue,
  DevConsoleTransitionBriefRequest,
  DevConsoleInspectRequest, DevConsoleInspectValue, DevConsoleSaveConfigRequest, DevConsoleSaveConfigValue,
  DevConsoleWorkspaceStatus, DevConsoleGitRequest, DevConsoleGitValue, DevConsoleSaveAgentsRequest, DevConsoleSaveAgentsValue,
  DevConsoleOpenWorkspaceRequest, DevConsoleOpenWorkspaceValue, DevConsoleSnapshot,
} from './dev-console.ts'
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
  /** Registry file for Dev Console, relative to the Host working directory. */
  readonly devConsoleConfigFile?: string
}

/** Host service backing the generated `ctx.remote.sessionTasks` namespace. */
export class SessionTasksController extends TypertRemoteService {
  static inject = ['typert', 'agents', 'sessionController', 'workspaceRegistry']

  static Config: z<Config> = z.object({
    followIntervalMs: z.natural().min(100).default(DEFAULT_FOLLOW_INTERVAL_MS),
    stallAfterMs: z.natural().min(60_000).default(DEFAULT_STALL_AFTER_MS),
    relationsRefreshMs: z.natural().min(1_000).default(DEFAULT_RELATIONS_REFRESH_MS),
    devConsoleConfigFile: z.string().default('.dsh/dev-console.yaml'),
  })

  private readonly followIntervalMs: number
  private readonly stallAfterMs: number
  private readonly relationsRefreshMs: number
  private readonly devConsoleConfigFile: string
  private readonly inspectionCache = new Map<string, { at: number; inspection: import('./dev-console-workspace.ts').WorkspaceInspection }>()
  private readonly observed = new Map<string, ObservedActivity>()
  private seenDomain: Domain<typeof sessionTasksSeenDomain> | undefined
  private stateDomain: Domain<typeof devConsoleStateDomain> | undefined
  private busDomain: Domain<typeof devConsoleBusDomain> | undefined
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
    this.devConsoleConfigFile = resolved.devConsoleConfigFile
  }

  protected async [Service.init](): Promise<void> {
    const seenBinding = this.ctx.inject(['storageDomain'], async (storageCtx) => {
      const domain = await storageCtx.storageDomain.open(sessionTasksSeenDomain)
      const state = await storageCtx.storageDomain.open(devConsoleStateDomain)
      const bus = await storageCtx.storageDomain.open(devConsoleBusDomain)
      this.seenDomain = domain
      this.stateDomain = state
      this.busDomain = bus
      return () => {
        this.seenDomain = undefined
        this.stateDomain = undefined
        this.busDomain = undefined
        void domain.close()
        void state.close()
        void bus.close()
      }
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
  /**
   * Read the configured Dev Console registry and inspect each workspace.
   * @returns configured workspaces with canonical git/cwd facts.
   */
  @Remote('devConsoleSnapshot')
  async devConsoleSnapshot(): Promise<DevConsoleSnapshot> {
    const result = loadDevConsoleConfig(this.resolveDevConsoleConfigFile())
    if (result.config === undefined) {
      return { problems: result.problems, warnings: result.warnings, workspaces: [] }
    }
    const workspaces: DevConsoleWorkspaceStatus[] = []
    for (const project of result.config.projects) {
      for (const workspace of project.workspaces) {
        workspaces.push({ projectId: project.id, projectName: project.name, projectRoot: project.root, workspace, sessions: [] })
      }
    }
    return { config: result.config, problems: result.problems, warnings: result.warnings, workspaces }
  }

  private resolveDevConsoleConfigFile(): string {
    const env = process.env['DSH_DEV_CONSOLE_CONFIG']
    if (env !== undefined && existsSync(env)) return env
    if (isAbsolute(this.devConsoleConfigFile) && existsSync(this.devConsoleConfigFile)) return this.devConsoleConfigFile
    const candidates = [
      resolve(process.cwd(), this.devConsoleConfigFile),
      join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'dev-console.yaml'),
    ]
    const registry = this.ctx.get('workspaceRegistry')
    for (const workspace of registry?.list() ?? []) {
      candidates.push(join(workspace.path, '.dsh', 'dev-console.yaml'))
    }
    return candidates.find(candidate => existsSync(candidate)) ?? resolve(process.cwd(), this.devConsoleConfigFile)
  }

  private busState(): DevConsoleBusState {
    return this.busDomain?.global.get() ?? EMPTY_DEV_CONSOLE_BUS
  }

  private async writeBus(next: DevConsoleBusState): Promise<void> {
    if (this.busDomain === undefined) throw new RemoteError('session-tasks/seen-unavailable', 'Dev Console bus requires a mounted storage domain', {})
    await this.busDomain.global.set(next)
  }

  @Remote('devConsoleSessionContext')
  async devConsoleSessionContext(request: DevConsoleSessionContextRequest): Promise<DevConsoleSessionContextValue> {
    const query = this.ctx.get('sessionQuery')
    if (query === undefined) throw new RemoteError('gateway/bad-request', 'session query is unavailable', {})
    const record = (await query.listSessions()).find(item => item.header.id === request.sessionId)
    if (record === undefined) throw new RemoteError('gateway/bad-request', `session ${request.sessionId} not found`, {})
    const cwd = record.header.cwd
    if (cwd === undefined) return { sessionId: request.sessionId }
    const canonical = await realpath(cwd).catch(() => cwd)
    const config = loadDevConsoleConfig(this.resolveDevConsoleConfigFile())
    if (config.config === undefined) throw new RemoteError('gateway/bad-request', 'Dev Console config is invalid', {})
    for (const project of config.config.projects) {
      for (const workspace of project.workspaces) {
        const expected = workspace.canonicalWorktree ?? workspace.worktree
        if (expected !== canonical) continue
        const state = this.busState()
        const brief = state.briefs
          .filter(item => item.workspaceId === workspace.id && (item.status === 'assigned' || item.status === 'in_review' || item.status === 'ready'))
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
        const plan = brief === undefined ? undefined : state.plans
          .filter(item => item.briefId === brief.id && item.status === 'approved')
          .sort((a, b) => b.version - a.version)[0]
        return {
          sessionId: request.sessionId,
          workspaceId: workspace.id,
          projectId: project.id,
          ...brief === undefined ? {} : { briefId: brief.id, briefTitle: brief.title },
          ...plan === undefined ? {} : { planId: plan.id, planVersion: plan.version },
        }
      }
    }
    return { sessionId: request.sessionId }
  }

  @Remote('devConsoleDeliverDirective')
  async devConsoleDeliverDirective(request: DevConsoleDirectiveRequest): Promise<DevConsoleDirectiveValue> {
    const state = this.busState()
    const directive = {
      id: randomUUID(), sessionId: request.sessionId, type: request.type,
      ...request.briefId === undefined ? {} : { briefId: request.briefId },
      ...request.planId === undefined ? {} : { planId: request.planId },
      summary: request.summary,
      ...request.payload === undefined ? {} : { payload: request.payload },
      source: 'maintainer' as const, createdAt: Date.now(), status: 'pending' as const,
    }
    await this.writeBus({ ...state, directives: [directive, ...state.directives].slice(0, 100) })
    const text = `【研发控制台指令】${request.summary}${request.payload === undefined ? '' : `\n${request.payload}`}`
    const controller = this.ctx.get('sessionController')
    if (controller === undefined) {
      const failed = { ...directive, status: 'failed' as const }
      await this.writeBus({ ...this.busState(), directives: this.busState().directives.map(item => item.id === failed.id ? failed : item) })
      return { directive: failed }
    }
    try {
      await controller.prompt({
        requestId: brandString<SessionRequestId>(randomUUID()),
        sessionId: brandString<SessionId>(request.sessionId),
        mode: 'queue',
        content: [{ type: 'text', text }],
      }, new AbortController().signal)
      const delivered = { ...directive, status: 'delivered' as const }
      await this.writeBus({
        ...this.busState(),
        directives: this.busState().directives.map(item => item.id === delivered.id ? delivered : item),
      })
      return { directive: delivered }
    } catch {
      const failed = { ...directive, status: 'failed' as const }
      await this.writeBus({ ...this.busState(), directives: this.busState().directives.map(item => item.id === failed.id ? failed : item) })
      return { directive: failed }
    }
  }

  @Remote('devConsoleInbox')
  async devConsoleInbox(request: DevConsoleInboxRequest): Promise<DevConsoleInboxValue> {
    const state = this.busState()
    const items = []
    for (const message of state.messages) {
      if (!message.requiresResponse || message.status === 'resolved' || message.toRole !== request.role) continue
      if (request.workspaceId !== undefined && message.workspaceId !== request.workspaceId) continue
      items.push({
        id: `message:${message.id}`, kind: 'message' as const, title: message.subject, detail: message.body,
        ...message.briefId === undefined ? {} : { briefId: message.briefId },
        ...message.planId === undefined ? {} : { planId: message.planId },
        messageId: message.id, action: 'handle-message' as const,
      })
    }
    for (const brief of state.briefs) {
      if (request.workspaceId !== undefined && brief.workspaceId !== request.workspaceId) continue
      const assigned = brief.assignment?.assigneeRole === request.role && brief.status === 'assigned'
      const review = (request.role === 'maintainer' || request.role === 'workspace-reviewer') && brief.status === 'in_review'
      if (!assigned && !review) continue
      items.push({
        id: `brief:${brief.id}`, kind: 'brief' as const, title: brief.title,
        detail: assigned ? 'Brief 已分配，等待实现' : '交接待评审',
        briefId: brief.id, action: assigned ? 'assign-brief' as const : 'review-handoff' as const,
      })
    }
    if (request.role === 'maintainer') {
      for (const plan of state.plans) {
        if (plan.status !== 'draft') continue
        if (request.workspaceId !== undefined && plan.workspaceId !== request.workspaceId) continue
        items.push({
          id: `plan:${plan.id}`, kind: 'plan' as const, title: `计划待批准：${plan.title}`,
          detail: `Brief ${plan.briefId} · v${String(plan.version)}`,
          briefId: plan.briefId, planId: plan.id, action: 'approve-plan' as const,
        })
      }
    }
    return { items }
  }

  @Remote('devConsolePlans')
  async devConsolePlans(request: DevConsolePlansRequest): Promise<DevConsolePlansValue> {
    const plans = this.busState().plans.filter(plan =>
      (request.briefId === undefined || plan.briefId === request.briefId)
      && (request.workspaceId === undefined || plan.workspaceId === request.workspaceId)
      && (request.parentPlanId === undefined || plan.parentPlanId === request.parentPlanId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return { plans }
  }

  @Remote('devConsoleCreatePlan')
  async devConsoleCreatePlan(request: DevConsoleCreatePlanRequest): Promise<DevConsolePlan> {
    const state = this.busState()
    const brief = state.briefs.find(item => item.id === request.briefId)
    if (brief === undefined) throw new RemoteError('gateway/bad-request', `brief ${request.briefId} not found`, {})
    if (request.steps.length === 0 || request.steps.some(step => step.title.trim() === '' || step.outcome.trim() === '')) {
      throw new RemoteError('gateway/bad-request', 'plan needs at least one step with a title and outcome', {})
    }
    if (request.parentPlanId !== undefined) {
      const parent = state.plans.find(plan => plan.id === request.parentPlanId)
      if (parent === undefined || parent.briefId !== request.briefId) {
        throw new RemoteError('gateway/bad-request', 'parent plan must belong to the same brief', {})
      }
    }
    const siblingVersions = state.plans
      .filter(plan => plan.briefId === brief.id && plan.parentPlanId === request.parentPlanId)
      .map(plan => plan.version)
    const version = Math.max(0, ...siblingVersions) + 1
    const now = Date.now()
    const plan: DevConsolePlan = {
      id: randomUUID(), briefId: brief.id, workspaceId: brief.workspaceId,
      title: request.title.trim() === '' ? brief.title : request.title,
      version, status: 'draft',
      steps: request.steps.map((step, index) => ({
        id: `step-${String(index + 1)}`, title: step.title, outcome: step.outcome, status: 'todo',
        dependsOn: [], evidence: [], sessionRefs: [],
      })),
      ...request.parentPlanId === undefined ? {} : { parentPlanId: request.parentPlanId },
      createdBy: request.role, createdAt: now, updatedAt: now,
    }
    await this.writeBus({ ...state, plans: [plan, ...state.plans].slice(0, 100) })
    return plan
  }

  @Remote('devConsoleApprovePlan')
  async devConsoleApprovePlan(request: DevConsoleApprovePlanRequest): Promise<DevConsolePlan> {
    if (request.role !== 'maintainer') throw new RemoteError('gateway/bad-request', 'only a maintainer may approve a plan', {})
    const state = this.busState()
    const plan = state.plans.find(item => item.id === request.planId)
    if (plan === undefined) throw new RemoteError('gateway/bad-request', `plan ${request.planId} not found`, {})
    if (plan.status !== 'draft') throw new RemoteError('gateway/bad-request', 'only a draft plan may be approved', {})
    const now = Date.now()
    const approved: DevConsolePlan = { ...plan, status: 'approved', approvedBy: request.role, approvedAt: now, updatedAt: now }
    const plans = state.plans.map((item) => {
      if (item.id === approved.id) return approved
      if (item.briefId === approved.briefId && item.parentPlanId === approved.parentPlanId && item.status === 'approved') {
        return { ...item, status: 'superseded' as const, updatedAt: now }
      }
      return item
    })
    await this.writeBus({ ...state, plans })
    return approved
  }

  @Remote('devConsoleRevisePlan')
  async devConsoleRevisePlan(request: DevConsoleRevisePlanRequest): Promise<DevConsolePlan> {
    const state = this.busState()
    const base = state.plans.find(item => item.id === request.planId)
    if (base === undefined) throw new RemoteError('gateway/bad-request', `plan ${request.planId} not found`, {})
    if (request.reason.trim() === '') throw new RemoteError('gateway/bad-request', 'plan revision requires a reason', {})
    const now = Date.now()
    const plan: DevConsolePlan = {
      ...base, id: randomUUID(), version: base.version + 1, status: 'draft', steps: request.steps.map((step, index) => ({
        id: `step-${String(index + 1)}`, title: step.title, outcome: step.outcome, status: 'todo',
        dependsOn: [], evidence: [], sessionRefs: [],
      })), changeReason: request.reason, createdBy: request.role, createdAt: now, updatedAt: now,
    }
    await this.writeBus({ ...state, plans: [plan, ...state.plans].slice(0, 100) })
    return plan
  }

  @Remote('devConsoleUpdatePlanStep')
  async devConsoleUpdatePlanStep(request: DevConsolePlanStepUpdateRequest): Promise<DevConsolePlan> {
    const state = this.busState()
    const plan = state.plans.find(item => item.id === request.planId)
    if (plan === undefined) throw new RemoteError('gateway/bad-request', `plan ${request.planId} not found`, {})
    const step = plan.steps.find(item => item.id === request.stepId)
    if (step === undefined) throw new RemoteError('gateway/bad-request', `plan step ${request.stepId} not found`, {})
    const updated: DevConsolePlan = {
      ...plan,
      updatedAt: Date.now(),
      steps: plan.steps.map(item => item.id === step.id ? {
        ...item, status: request.status,
        ...request.evidence === undefined ? {} : { evidence: [...item.evidence, request.evidence] },
      } : item),
    }
    await this.writeBus({ ...state, plans: state.plans.map(item => item.id === updated.id ? updated : item) })
    return updated
  }

  @Remote('devConsoleMessages')
  async devConsoleMessages(request: DevConsoleMessagesRequest): Promise<DevConsoleMessagesValue> {
    const state = this.busState()
    const messages = state.messages.filter((message) => {
      if (request.workspaceId !== undefined && message.workspaceId !== request.workspaceId) return false
      return request.box === 'inbox' ? message.toRole === request.role : message.fromRole === request.role
    }).sort((a, b) => b.createdAt - a.createdAt)
    return { messages }
  }

  @Remote('devConsoleSendMessage')
  async devConsoleSendMessage(request: DevConsoleSendMessageRequest): Promise<DevConsoleMessage> {
    const subject = request.subject.trim()
    if (subject === '') throw new RemoteError('gateway/bad-request', 'message subject is required', {})
    if (request.kind === 'decision' && (request.payload?.selectedOption === undefined || request.payload.reason === undefined)) {
      throw new RemoteError('gateway/bad-request', 'decision messages require selectedOption and reason', {})
    }
    const message = createMessage({
      fromRole: request.fromRole,
      toRole: request.toRole,
      ...request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId },
      kind: request.kind,
      subject,
      body: request.body,
      ...request.requiresResponse === undefined ? {} : { requiresResponse: request.requiresResponse },
      ...request.payload === undefined ? {} : { payload: request.payload },
    })
    await this.writeBus({ ...this.busState(), messages: [message, ...this.busState().messages].slice(0, 200) })
    return message
  }

  @Remote('devConsoleMessageAction')
  async devConsoleMessageAction(request: DevConsoleMessageActionRequest): Promise<DevConsoleMessage> {
    const state = this.busState()
    const message = state.messages.find(item => item.id === request.messageId)
    if (message === undefined) throw new RemoteError('gateway/bad-request', `message ${request.messageId} not found`, {})
    if (message.toRole !== request.role) throw new RemoteError('gateway/bad-request', 'only the recipient may update this message', {})
    if (request.action === 'resolve' && message.requiresResponse && (request.response === undefined || request.response.trim() === '')) {
      throw new RemoteError('gateway/bad-request', 'a response is required before resolving', {})
    }
    const updated: DevConsoleMessage = {
      ...message,
      status: request.action === 'ack' ? 'acknowledged' : 'resolved',
      updatedAt: Date.now(),
      ...request.response === undefined ? {} : { payload: { ...message.payload, reason: request.response } },
    }
    await this.writeBus({ ...state, messages: state.messages.map(item => item.id === updated.id ? updated : item) })
    return updated
  }

  @Remote('devConsoleBriefs')
  async devConsoleBriefs(request: DevConsoleBriefsRequest): Promise<DevConsoleBriefsValue> {
    const briefs = this.busState().briefs
      .filter(brief => request.workspaceId === undefined || brief.workspaceId === request.workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return { briefs }
  }

  @Remote('devConsoleCreateBrief')
  async devConsoleCreateBrief(request: DevConsoleCreateBriefRequest): Promise<DevConsoleBrief> {
    const title = request.title.trim()
    if (title === '' || request.goal.trim() === '' || request.acceptance.trim() === '') {
      throw new RemoteError('gateway/bad-request', 'brief title, goal, and acceptance are required', {})
    }
    const now = Date.now()
    const brief: DevConsoleBrief = {
      id: randomUUID(),
      workspaceId: request.workspaceId,
      title,
      goal: request.goal,
      acceptance: request.acceptance,
      status: 'draft',
      authorRole: request.authorRole,
      createdAt: now,
      updatedAt: now,
      history: [],
    }
    await this.writeBus({ ...this.busState(), briefs: [brief, ...this.busState().briefs].slice(0, 100) })
    return brief
  }

  @Remote('devConsoleTransitionBrief')
  async devConsoleTransitionBrief(request: DevConsoleTransitionBriefRequest): Promise<DevConsoleBrief> {
    const state = this.busState()
    const brief = state.briefs.find(item => item.id === request.briefId)
    if (brief === undefined) throw new RemoteError('gateway/bad-request', `brief ${request.briefId} not found`, {})
    if (!BRIEF_TRANSITIONS[brief.status].includes(request.to)) {
      throw new RemoteError('gateway/bad-request', `brief transition ${brief.status} -> ${request.to} is not allowed`, {})
    }
    if (request.to === 'changes_requested' && request.reason === undefined) {
      throw new RemoteError('gateway/bad-request', 'changes_requested requires a reason', {})
    }
    const assigneeRole = request.assigneeRole ?? (request.to === 'assigned' ? 'implementer' : undefined)
    const updated: DevConsoleBrief = {
      ...brief,
      status: request.to,
      updatedAt: Date.now(),
      ...assigneeRole === undefined ? {} : { assigneeRole },
      ...request.to !== 'assigned' || assigneeRole === undefined ? {} : {
        assignment: { assigneeRole, assignedBy: request.role, assignedAt: Date.now() },
      },
      history: [...brief.history, {
        at: Date.now(), from: brief.status, to: request.to, role: request.role,
        ...request.reason === undefined ? {} : { reason: request.reason },
      }],
    }
    await this.writeBus({ ...state, briefs: state.briefs.map(item => item.id === updated.id ? updated : item) })
    return updated
  }

  @Remote('devConsoleHandoff')
  async devConsoleHandoff(request: DevConsoleHandoffRequest): Promise<DevConsoleMessage> {
    const state = this.busState()
    const brief = state.briefs.find(item => item.id === request.briefId)
    if (brief === undefined) throw new RemoteError('gateway/bad-request', `brief ${request.briefId} not found`, {})
    if (brief.status !== 'assigned' && brief.status !== 'in_review') {
      throw new RemoteError('gateway/bad-request', 'handoff requires an assigned or in-review brief', {})
    }
    if (request.branch.trim() === '' || request.commit.trim() === '' || request.summary.trim() === '' || request.tests.length === 0) {
      throw new RemoteError('gateway/bad-request', 'handoff requires branch, commit, summary, and at least one test', {})
    }
    const message = createMessage({
      fromRole: request.fromRole,
      toRole: request.toRole,
      workspaceId: brief.workspaceId,
      kind: 'handoff',
      subject: `Handoff: ${brief.title}`,
      body: request.summary,
      requiresResponse: true,
      payload: { handoff: {
        branch: request.branch,
        commit: request.commit,
        summary: request.summary,
        tests: [...request.tests],
        ...request.risks === undefined ? {} : { risks: request.risks },
        ...request.nextSteps === undefined ? {} : { nextSteps: request.nextSteps },
      } },
    })
    const updatedBrief: DevConsoleBrief = brief.status === 'in_review' ? brief : {
      ...brief,
      status: 'in_review',
      updatedAt: Date.now(),
      history: [...brief.history, { at: Date.now(), from: brief.status, to: 'in_review', role: request.fromRole }],
    }
    await this.writeBus({
      messages: [message, ...state.messages].slice(0, 200),
      briefs: state.briefs.map(item => item.id === updatedBrief.id ? updatedBrief : item),
      plans: state.plans,
      directives: state.directives,
    })
    return message
  }

  @Remote('devConsoleState')
  async devConsoleState(): Promise<DevConsoleStateValue> {
    const state = this.stateDomain?.global.get() ?? EMPTY_DEV_CONSOLE_STATE
    return { bindings: state.bindings, audit: state.audit }
  }

  @Remote('devConsoleBind')
  async devConsoleBind(request: DevConsoleBindRequest): Promise<DevConsoleStateValue> {
    if (this.stateDomain === undefined) throw new RemoteError('session-tasks/seen-unavailable', 'Dev Console state requires a mounted storage domain', {})
    const state: DevConsoleState = this.stateDomain.global.get()
    const sessions = [request.sessionId, ...(state.bindings[request.workspaceId] ?? [])]
    await this.stateDomain.global.set({
      ...state,
      bindings: { ...state.bindings, [request.workspaceId]: [...new Set(sessions)].slice(0, 20) },
    })
    return this.devConsoleState()
  }

  @Remote('devConsoleSummary')
  async devConsoleSummary(request: DevConsoleSummaryRequest): Promise<DevConsoleSummary> {
    const workspace = this.devConsoleWorkspace(request.workspaceId)
    const cwd = workspace.canonicalWorktree ?? workspace.worktree
    const git = async (args: readonly string[]) => promisify(execFile)('git', [...args], { cwd, encoding: 'utf8' })
      .then(result => result.stdout.trim()).catch(() => undefined)
    const commitText = await git(['log', '-1', '--format=%h%x00%s%x00%cI'])
    const commit = commitText?.split('\x00') as [string, string, string] | undefined
    const status = await git(['status', '--porcelain'])
    const dirtyCount = status === undefined || status === '' ? 0 : status.split('\n').length
    const counts = await git(['rev-list', '--left-right', '--count', `${workspace.base}...HEAD`])
    const [behind, ahead] = counts?.split(/\s+/).map(Number) ?? []
    const agentsText = await readFile(`${cwd}/AGENTS.md`, 'utf8').catch(() => undefined)
    return {
      ...commit === undefined ? {} : { commit: { hash: commit[0], subject: commit[1], at: commit[2] } },
      dirtyCount,
      ...ahead === undefined ? {} : { ahead },
      ...behind === undefined ? {} : { behind },
      ...agentsText === undefined ? {} : {
        agents: { bytes: Buffer.byteLength(agentsText), hash: createHash('sha256').update(agentsText).digest('hex') },
      },
    }
  }

  @Remote('devConsoleHistory')
  async devConsoleHistory(request: DevConsoleHistoryRequest): Promise<DevConsoleHistoryValue> {
    const workspace = this.devConsoleWorkspace(request.workspaceId)
    const inspection = await inspectWorkspace(workspace)
    const query = this.ctx.get('sessionQuery')
    if (query === undefined || inspection.canonicalWorktree === undefined) return { sessions: [], total: 0, hasMore: false }
    const limit = Math.min(Math.max(request.limit ?? 20, 1), 100)
    const offset = Math.max(request.offset ?? 0, 0)
    const needle = request.query?.trim().toLowerCase() ?? ''
    const records = await query.listSessions()
    const matched: { sessionId: string; live: boolean }[] = []
    for (const record of records) {
      if (record.header.cwd === undefined) continue
      let canonical: string
      try { canonical = await realpath(record.header.cwd) } catch { continue }
      if (canonical !== inspection.canonicalWorktree) continue
      if (needle !== '' && !`${record.header.id} ${canonical}`.toLowerCase().includes(needle)) continue
      matched.push({ sessionId: record.header.id, live: record.live })
    }
    return {
      sessions: matched.slice(offset, offset + limit),
      total: matched.length,
      hasMore: offset + limit < matched.length,
    }
  }

  @Remote('devConsoleInspect')
  async devConsoleInspect(request: DevConsoleInspectRequest): Promise<DevConsoleInspectValue> {
    const result = loadDevConsoleConfig(this.resolveDevConsoleConfigFile())
    if (result.config === undefined) throw new RemoteError('gateway/bad-request', 'Dev Console config is invalid', {})
    const all = result.config.projects.flatMap(project => project.workspaces.map(workspace => ({
      projectId: project.id, projectName: project.name, projectRoot: project.root, workspace,
    })))
    const wanted = request.workspaceIds === undefined ? all : all.filter(item => request.workspaceIds?.includes(item.workspace.id) === true)
    const now = Date.now()
    const workspaces: DevConsoleWorkspaceStatus[] = []
    for (let index = 0; index < wanted.length; index += 4) {
      const chunk = wanted.slice(index, index + 4)
      const inspected = await Promise.all(chunk.map(async ({ projectId, projectName, projectRoot, workspace }) => {
        const cached = this.inspectionCache.get(workspace.id)
        if (request.refresh !== true && cached !== undefined && now - cached.at < 5_000) {
          return { projectId, projectName, projectRoot, workspace, inspection: cached.inspection, sessions: [] }
        }
        const inspection = await inspectWorkspace(workspace)
        this.inspectionCache.set(workspace.id, { at: Date.now(), inspection })
        return { projectId, projectName, projectRoot, workspace, inspection, sessions: [] }
      }))
      workspaces.push(...inspected)
    }
    return { workspaces }
  }

  @Remote('devConsoleConfig')
  async devConsoleConfig(): Promise<DevConsoleConfigValue> {
    const path = this.resolveDevConsoleConfigFile()
    const yaml = await readFile(path, 'utf8').catch(() => 'version: 1\nprojects: []\n')
    return { path, yaml }
  }

  @Remote('devConsoleSaveConfig')
  async devConsoleSaveConfig(request: DevConsoleSaveConfigRequest): Promise<DevConsoleSaveConfigValue> {
    const parsed = validateConfig(load(request.yaml))
    if (parsed.config === undefined) {
      throw new RemoteError('gateway/bad-request', parsed.problems.map(problem => `${problem.path}: ${problem.message}`).join('; '), {})
    }
    const path = this.resolveDevConsoleConfigFile()
    await copyFile(path, `${path}.bak`).catch(() => { /* first save has no previous file */ })
    const temporary = `${path}.tmp`
    await writeFile(temporary, dump(parsed.config))
    await rename(temporary, path)
    return { path, warnings: parsed.warnings }
  }

  @Remote('devConsoleAutoConfig')
  async devConsoleAutoConfig(request: DevConsoleAutoConfigRequest): Promise<DevConsoleAutoConfigValue> {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry === undefined) throw new RemoteError('gateway/bad-request', 'workspace registry is unavailable', {})
    const target = join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'dev-console.yaml')
    if (!request.overwrite && existsSync(target)) throw new RemoteError('dev-console/conflict', `config already exists: ${target}`, {})
    const grouped = new Map<string, {
      id: string
      name: string
      root: string
      workspaces: Array<{
        id: string
        name: string
        worktree: string
        branch: string
        base: string
        agent: { adapter: 'dsh-session' }
        hooks: { expectedBranch: string; expectedToplevel: string }
      }>
    }>()
    for (const workspace of registry.list()) {
      const git = async (args: readonly string[]) => promisify(execFile)('git', [...args], { cwd: workspace.path, encoding: 'utf8' })
        .then(result => result.stdout.trim()).catch(() => undefined)
      const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
      const toplevel = await git(['rev-parse', '--show-toplevel'])
      const common = await git(['rev-parse', '--git-common-dir'])
      if (branch === undefined || toplevel === undefined || common === undefined) continue
      const commonPath = resolve(workspace.path, common)
      const projectRoot = basename(commonPath) === '.git' ? dirname(commonPath) : commonPath
      const projectId = basename(projectRoot).replace(/[^a-zA-Z0-9_-]/g, '-')
      const workspaceSlug = basename(toplevel).replace(/[^a-zA-Z0-9_-]/g, '-')
      let group = grouped.get(projectId)
      if (group === undefined) {
        group = { id: projectId, name: basename(projectRoot), root: projectRoot, workspaces: [] }
        grouped.set(projectId, group)
      }
      const baseId = toplevel === projectRoot ? `${projectId}-root` : `${projectId}-${workspaceSlug}`
      const id = group.workspaces.some(workspace => workspace.id === baseId) ? `${baseId}-${String(group.workspaces.length + 1)}` : baseId
      group.workspaces.push({
        id,
        name: toplevel === projectRoot ? `${basename(projectRoot)} · 根工作树` : workspaceSlug,
        worktree: toplevel,
        branch,
        base: 'main',
        agent: { adapter: 'dsh-session' },
        hooks: { expectedBranch: branch, expectedToplevel: toplevel },
      })
    }
    const projects = [...grouped.values()]
    if (projects.length === 0) throw new RemoteError('gateway/bad-request', 'no connected workspace is a git repository', {})
    await writeFile(target, dump({ version: 1, projects }))
    return { path: target, projects: projects.length }
  }

  @Remote('devConsoleGit')
  async devConsoleGit(request: DevConsoleGitRequest): Promise<DevConsoleGitValue> {
    const workspace = this.devConsoleWorkspace(request.workspaceId)
    const args = request.action === 'status'
      ? ['status', '--porcelain']
      : request.action === 'log'
        ? ['log', '--oneline', '-20']
        : ['diff']
    const result = await promisify(execFile)('git', args, { cwd: workspace.canonicalWorktree ?? workspace.worktree, encoding: 'utf8' })
    const text = result.stdout.trim()
    return { text: text.length > 24_000 ? `${text.slice(0, 24_000)}\n…` : text }
  }

  @Remote('devConsoleAgents')
  async devConsoleAgents(request: DevConsoleAgentsRequest): Promise<DevConsoleAgentsValue> {
    const workspace = this.devConsoleWorkspace(request.workspaceId)
    const path = `${workspace.canonicalWorktree ?? workspace.worktree}/AGENTS.md`
    const text = await readFile(path, 'utf8')
    return { path, text, hash: createHash('sha256').update(text).digest('hex') }
  }

  @Remote('devConsoleSaveAgents')
  async devConsoleSaveAgents(request: DevConsoleSaveAgentsRequest): Promise<DevConsoleSaveAgentsValue> {
    const workspace = this.devConsoleWorkspace(request.workspaceId)
    const path = `${workspace.canonicalWorktree ?? workspace.worktree}/AGENTS.md`
    const current = await readFile(path, 'utf8')
    const currentHash = createHash('sha256').update(current).digest('hex')
    if (currentHash !== request.baseHash) throw new RemoteError('dev-console/conflict', 'AGENTS.md changed externally', {})
    await writeFile(path, request.text)
    const newHash = createHash('sha256').update(request.text).digest('hex')
    if (this.stateDomain !== undefined) {
      const state = this.stateDomain.global.get()
      const entry: DevConsoleAuditEntry = { at: Date.now(), workspaceId: request.workspaceId, path, baseHash: request.baseHash, newHash }
      await this.stateDomain.global.set({ ...state, audit: [entry, ...state.audit].slice(0, 50) })
    }
    return { hash: newHash }
  }

  private devConsoleWorkspace(workspaceId: string): DevConsoleWorkspaceConfig {
    const result = loadDevConsoleConfig(this.resolveDevConsoleConfigFile())
    if (result.config === undefined) throw new RemoteError('gateway/bad-request', 'Dev Console config is invalid', {})
    const workspace = result.config.projects.flatMap(project => project.workspaces).find(item => item.id === workspaceId)
    if (workspace === undefined) throw new RemoteError('gateway/bad-request', `workspace ${workspaceId} is not configured`, {})
    return workspace
  }


  /**
   * Open a configured workspace in a Session whose cwd is its worktree.
   * @param request - workspace id.
   * @returns created Session and cwd.
   */
  @Remote('devConsoleOpenWorkspace')
  async devConsoleOpenWorkspace(request: DevConsoleOpenWorkspaceRequest): Promise<DevConsoleOpenWorkspaceValue> {
    const result = loadDevConsoleConfig(this.resolveDevConsoleConfigFile())
    if (result.config === undefined) throw new RemoteError('gateway/bad-request', 'Dev Console config is invalid', {})
    const workspace = result.config.projects.flatMap(project => project.workspaces).find(item => item.id === request.workspaceId)
    if (workspace === undefined) throw new RemoteError('gateway/bad-request', `workspace ${request.workspaceId} is not configured`, {})
    const created = await openWorkspace({
      create: async (input) => {
        const value = await this.ctx.sessionController.create({ cwd: input.cwd })
        return { sessionId: value.sessionId }
      },
    }, workspace)
    return created
  }

}

export default SessionTasksController
