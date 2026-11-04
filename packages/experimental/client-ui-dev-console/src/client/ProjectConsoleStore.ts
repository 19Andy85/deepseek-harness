/** Live project console state: workspace selection, one session snapshot, and refresh scheduling. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { QuestionAnswer } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import { readShiftStats, recordShiftEvents, resetShiftStats, type ShiftEvent, type ShiftStats } from './day-stats.ts'
import { compareVisit, rememberVisit, type VisitChange, type VisitMemory } from './visit-memory.ts'
import type {
  SessionTaskFollowFrame, SessionTaskView, SessionTasksSnapshot,
} from '@deepseek-ai/dsh-experimental-api-session-tasks/types'

/** One selectable Workspace row. */
export interface ConsoleWorkspace {
  /** Stable Workspace identity. */
  readonly id: string
  /** Display title. */
  readonly title: string
  /** Canonical directory path. */
  readonly path: string
}

/** Follow lifecycle of the focused Session. */
export type ConsoleFocusPhase = 'connecting' | 'live' | 'ended' | 'failed'

/** One observed change of the focused Session. */
export interface ConsoleFocusTimelineEntry {
  /** Observation time. */
  readonly at: number
  /** Kind of change. */
  readonly kind: 'baseline' | 'status' | 'activity' | 'ended'
  /** Previous status for a status change. */
  readonly from?: string
  /** Current status for a status change or baseline. */
  readonly to?: string
  /** Current activity family kinds for an activity change. */
  readonly activity?: string
}

/** One focused Session followed inside the console. */
export interface ConsoleFocus {
  /** Followed Session identity. */
  readonly sessionId: string
  /** When this console started following the Session. */
  readonly startedAt: number
  /** Stream lifecycle. */
  readonly phase: ConsoleFocusPhase
  /** Latest row reported by the follow stream. */
  readonly row?: SessionTaskView
  /** Changes observed while this console followed the Session, oldest first. */
  readonly timeline: readonly ConsoleFocusTimelineEntry[]
}

/** Observable page state. */
export interface ConsoleState {
  /** Read lifecycle of the current overview. */
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  /** User-safe failure text, set only in the error state. */
  readonly error?: string | undefined
  /** Workspace the visible rows belong to. */
  readonly workspaceId?: string
  /** Live sessions of that workspace. */
  readonly sessions: readonly SessionTaskView[]
  /** Whether the new-Session dispatch form is in flight. */
  readonly dispatch: 'idle' | 'sending'
  /** Whether the last dispatch attempt failed before the Host accepted it. */
  readonly dispatchFailed?: true | undefined
  /** Session whose row action is in flight, when one is running. */
  readonly busySessionId?: string | undefined
  /** Whether the last row action failed. */
  readonly actionFailed?: true | undefined
  /** Session followed inside the console, when the overview is replaced by it. */
  readonly focus?: ConsoleFocus | undefined
  /** Rows that changed since the previous visit, mapped to the first change seen. */
  readonly changes?: ReadonlyMap<string, VisitChange> | undefined
  /** Start time of the previous visit, when one is remembered. */
  readonly lastSeenAt?: number | undefined
  /** Today's observed counters shown in the shift summary. */
  readonly shift?: ShiftStats | undefined
  /** When the visible rows were last read from the Host. */
  readonly updatedAt?: number | undefined
}

/** Host ports the store reads; tests can provide them without a browser. */
export interface ProjectConsoleHost {
  /** Current Workspace rows in Host order. */
  listWorkspaces(): readonly ConsoleWorkspace[]
  /** Subscribe to Workspace list changes. */
  subscribeWorkspaces(listener: () => void): () => void
  /** Read one workspace-scoped overview through the Remote. */
  snapshot(workspaceId?: string): Promise<RemoteResult<SessionTasksSnapshot>>
  /** Show one Session's Conversation, where the shipped stream renders its progress. */
  openSession(sessionId: string): void
  /** Create a Session in the Workspace and return its identity. */
  createSession(workspaceId: string): Promise<string>
  /** Send one prompt into an existing Session. */
  promptSession(sessionId: string, prompt: string, mode: 'queue' | 'steer'): Promise<void>
  /** Cancel the active turn of one Session. */
  cancelSession(sessionId: string): Promise<void>
  /** Answer one Session's pending approval with the user's decision. */
  respondApproval(sessionId: string, decision: 'allowed-once' | 'rejected'): Promise<void>
  /** Submit one complete answer batch to a pending question or plan review. */
  answerQuestion(sessionId: string, answer: QuestionAnswer): Promise<void>
  /** Follow one Session's row updates until it stops being live. */
  follow(sessionId: string, signal: AbortSignal): AsyncIterable<SessionTaskFollowFrame>
  /** Read the baseline recorded by a previous visit of one Workspace. */
  readVisit(workspaceId: string): VisitMemory | undefined
  /** Record the current rows as the baseline of the next visit. */
  writeVisit(workspaceId: string, memory: VisitMemory): void
  /** Acknowledge the current rows as read in the Host's durable read state. */
  acknowledge(workspaceId: string): Promise<void>
}

/** Default coalescing window before an event-triggered re-read. */
const REFRESH_DELAY_MS = 150

/** One page's overview state and refresh policy. */
export class ProjectConsoleStore {
  private readonly listeners = new Set<() => void>()
  private state: ConsoleState = { status: 'idle', sessions: [], dispatch: 'idle' }
  private workspaces: readonly ConsoleWorkspace[] = []
  private panelId: string | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private tail: Promise<void> = Promise.resolve()
  private readonly cache = new Map<string, { sessions: readonly SessionTaskView[]; updatedAt: number }>()
  private readonly prefetching = new Set<string>()
  private inFlight: { readonly workspaceId: string | undefined; readonly promise: Promise<void> } | undefined
  private focusAbort: AbortController | undefined
  private focusRun = 0
  private memoryWorkspace: string | undefined
  private currentRows: readonly SessionTaskView[] = []
  private readonly previousStatus = new Map<string, SessionTaskView['status']>()
  private readonly knownSessions = new Set<string>()
  private lastMemoryWrite = 0
  private readonly stopWorkspaces: () => void

  /** @param host - Workspace and Remote ports. */
  constructor(private readonly host: ProjectConsoleHost) {
    this.state = { ...this.state, shift: readShiftStats() }
    this.workspaces = host.listWorkspaces()
    this.stopWorkspaces = host.subscribeWorkspaces(() => {
      this.workspaces = host.listWorkspaces()
      if (this.panelId !== undefined && !this.workspaces.some(workspace => workspace.id === this.panelId)) {
        this.panelId = this.workspaces[0]?.id
        this.emit()
        this.scheduleRefresh()
        return
      }
      this.emit()
    })
  }

  /** @returns identity-stable current state for React. */
  readonly getSnapshot = (): ConsoleState => this.state

  /**
   * Subscribe to state changes.
   * @param listener - invalidation callback.
   * @returns unsubscribe function.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns selectable Workspaces in Host order. */
  workspaceOptions(): readonly ConsoleWorkspace[] {
    return this.workspaces
  }

  /** @returns the selected Workspace id, when one is available. */
  selectedWorkspaceId(): string | undefined {
    return this.panelId
  }

  /**
   * Show one Session's Conversation.
   * @param sessionId - the row to open.
   */
  openSession(sessionId: string): void {
    if (this.disposed) return
    this.host.openSession(sessionId)
  }

  /**
   * Create a Session in the selected Workspace, send its first prompt, and open it.
   * @param prompt - non-empty prompt text.
   * @returns whether the Session was created and accepted the prompt.
   */
  async dispatch(prompt: string): Promise<boolean> {
    const text = prompt.trim()
    if (this.disposed || this.panelId === undefined || text === '') return false
    this.state = { ...this.state, dispatch: 'sending', dispatchFailed: undefined }
    this.emit()
    try {
      const sessionId = await this.host.createSession(this.panelId)
      await this.host.promptSession(sessionId, text, 'queue')
      this.host.openSession(sessionId)
      this.state = { ...this.state, dispatch: 'idle', dispatchFailed: undefined }
      this.recordShift(['dispatched'])
      this.emit()
      return true
    } catch {
      this.state = { ...this.state, dispatch: 'idle', dispatchFailed: true }
      this.emit()
      return false
    }
  }

  /**
   * Send a prompt into one existing Session without leaving the console.
   * @param sessionId - target row.
   * @param prompt - non-empty prompt text.
   * @param mode - 'queue' appends a turn; 'steer' interrupts the running one.
   * @returns whether the Host accepted the prompt.
   */
  async sendToSession(sessionId: string, prompt: string, mode: 'queue' | 'steer'): Promise<boolean> {
    const text = prompt.trim()
    if (this.disposed || text === '') return false
    this.state = { ...this.state, busySessionId: sessionId, actionFailed: undefined }
    this.emit()
    try {
      await this.host.promptSession(sessionId, text, mode)
      this.state = { ...this.state, busySessionId: undefined, actionFailed: undefined }
      this.emit()
      this.scheduleRefresh()
      return true
    } catch {
      this.state = { ...this.state, busySessionId: undefined, actionFailed: true }
      this.emit()
      return false
    }
  }

  /**
   * Cancel the active turn of one Session.
   * @param sessionId - target row.
   * @returns whether the Host admitted the cancellation.
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    if (this.disposed) return false
    this.state = { ...this.state, busySessionId: sessionId, actionFailed: undefined }
    this.emit()
    try {
      await this.host.cancelSession(sessionId)
      this.state = { ...this.state, busySessionId: undefined, actionFailed: undefined }
      this.recordShift(['interrupted'])
      this.emit()
      this.scheduleRefresh()
      return true
    } catch {
      this.state = { ...this.state, busySessionId: undefined, actionFailed: true }
      this.emit()
      return false
    }
  }

  /**
   * Answer one Session's pending approval.
   * @param sessionId - target row.
   * @param decision - allow once or reject the pending tool call.
   * @returns whether the decision was delivered.
   */
  async answerApproval(sessionId: string, decision: 'allowed-once' | 'rejected'): Promise<boolean> {
    if (this.disposed) return false
    this.state = { ...this.state, busySessionId: sessionId, actionFailed: undefined }
    this.emit()
    try {
      await this.host.respondApproval(sessionId, decision)
      this.state = { ...this.state, busySessionId: undefined, actionFailed: undefined }
      this.recordShift(['approvals'])
      this.emit()
      this.scheduleRefresh()
      return true
    } catch {
      this.state = { ...this.state, busySessionId: undefined, actionFailed: true }
      this.emit()
      return false
    }
  }

  /**
   * Answer one Session's pending question or plan review.
   * @param sessionId - target row.
   * @param answer - complete structured answer batch.
   * @returns whether the answer was submitted.
   */
  async answerQuestion(sessionId: string, answer: QuestionAnswer): Promise<boolean> {
    if (this.disposed) return false
    this.state = { ...this.state, busySessionId: sessionId, actionFailed: undefined }
    this.emit()
    try {
      await this.host.answerQuestion(sessionId, answer)
      this.state = { ...this.state, busySessionId: undefined, actionFailed: undefined }
      this.recordShift(['questions'])
      this.emit()
      this.scheduleRefresh()
      return true
    } catch {
      this.state = { ...this.state, busySessionId: undefined, actionFailed: true }
      this.emit()
      return false
    }
  }

  /**
   * Follow one Session inside the console until it stops being live.
   * @param sessionId - the row to follow.
   */
  focusSession(sessionId: string): void {
    if (this.disposed) return
    this.closeFocus()
    const abort = new AbortController()
    this.focusAbort = abort
    const run = ++this.focusRun
    this.state = { ...this.state, focus: { sessionId, startedAt: Date.now(), phase: 'connecting', timeline: [] } }
    this.emit()
    void (async () => {
      try {
        for await (const frame of this.host.follow(sessionId, abort.signal)) {
          if (this.disposed || run !== this.focusRun) return
          const row = frame.row
          const previous = this.state.focus
          const timeline = [...previous?.timeline ?? []]
          if (previous?.row === undefined) {
            if (row !== undefined) timeline.push({ at: Date.now(), kind: 'baseline', to: row.status })
          } else if (row === undefined) {
            timeline.push({ at: Date.now(), kind: 'ended' })
          } else if (previous.row !== undefined && row !== undefined) {
            if (previous.row.status !== row.status) {
              timeline.push({ at: Date.now(), kind: 'status', from: previous.row.status, to: row.status })
            }
            const before = previous.row.activity.map(entry => entry.kind).join(',')
            const after = row.activity.map(entry => entry.kind).join(',')
            const lastEntry = timeline.at(-1)
            const churning = lastEntry?.kind === 'activity' && Date.now() - lastEntry.at < 1_500
            if (before !== after && !churning) timeline.push({ at: Date.now(), kind: 'activity', activity: after })
          }
          this.state = {
            ...this.state,
            focus: row === undefined
              ? { sessionId, startedAt: previous?.startedAt ?? Date.now(), phase: 'ended', timeline: timeline.slice(-20) }
              : { sessionId, startedAt: previous?.startedAt ?? Date.now(), phase: 'live', row, timeline: timeline.slice(-20) },
          }
          this.emit()
          if (row === undefined) return
        }
      } catch {
        if (this.disposed || run !== this.focusRun || abort.signal.aborted) return
        this.state = {
          ...this.state,
          focus: {
            sessionId, startedAt: this.state.focus?.startedAt ?? Date.now(), phase: 'failed',
            ...this.state.focus?.row === undefined ? {} : { row: this.state.focus.row },
            timeline: this.state.focus?.timeline ?? [],
          },
        }
        this.emit()
      }
    })()
  }

  /** Leave the focused Session and stop its follow stream. */
  closeFocus(): void {
    this.focusAbort?.abort()
    this.focusAbort = undefined
    this.focusRun += 1
    if (this.state.focus === undefined) return
    const { focus: _focus, ...rest } = this.state
    this.state = rest
    this.emit()
  }

  /**
   * Select one Workspace and read its overview.
   * @param workspaceId - Workspace to display; omission keeps the current selection.
   * @returns completion after the selected Workspace's state settles.
   */
  selectWorkspace(workspaceId?: string): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.panelId !== workspaceId) {
      // A different workspace must not keep showing the previous rows: clear
      // them before the read so the studio/canvas cannot appear stuck.
      this.knownSessions.clear()
      this.previousStatus.clear()
    }
    this.closeFocus()
    this.panelId = workspaceId
    return this.refresh()
  }

  /**
   * Record observed events into today's counters and publish the summary.
   * @param events - events observed by the store.
   */
  private recordShift(events: readonly ShiftEvent[]): void {
    this.state = { ...this.state, shift: recordShiftEvents(events) }
    this.emit()
  }

  /** Acknowledge the visible Workspace as read in the Host's durable read state. */
  acknowledge(): void {
    if (this.disposed || this.memoryWorkspace === undefined) return
    void this.host.acknowledge(this.memoryWorkspace).catch(() => {})
  }

  /** Clear today's observed counters. */
  resetShift(): void {
    if (this.disposed) return
    this.state = { ...this.state, shift: resetShiftStats() }
    this.emit()
  }

  /**
   * Warm the cache for other Workspaces in the background so switching back is
   * immediate; reads are staggered and never change the visible state.
   */
  private prefetchOtherWorkspaces(): void {
    if (this.disposed) return
    for (const workspace of this.workspaces) {
      const workspaceId = workspace.id
      if (workspaceId === this.panelId || this.cache.has(workspaceId) || this.prefetching.has(workspaceId)) continue
      this.prefetching.add(workspaceId)
      setTimeout(() => {
        this.prefetching.delete(workspaceId)
        if (this.disposed || this.panelId === workspaceId || this.cache.has(workspaceId)) return
        void this.host.snapshot(workspaceId).then((result) => {
          if (result.ok) this.cache.set(workspaceId, { sessions: result.value.sessions, updatedAt: Date.now() })
        }).catch(() => undefined)
      }, 1_500 * (this.prefetching.size + 1))
    }
  }

  /** Coalesce event-triggered re-reads of the selected Workspace. */
  scheduleRefresh(): void {
    if (this.disposed || this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.refresh()
    }, REFRESH_DELAY_MS)
  }

  /**
   * Read the selected Workspace overview now, superseding reads not yet started.
   * @returns completion after the state settles.
   */
  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.panelId ??= this.workspaces[0]?.id
    const workspaceId = this.panelId
    // Auto-refresh and a manual read can overlap: one read per Workspace is
    // enough, otherwise slow Host snapshots pile up and keep the page loading.
    if (this.inFlight !== undefined && this.inFlight.workspaceId === workspaceId) return this.inFlight.promise
    // A periodic re-read of the same Workspace must not blank the visible
    // state: keeping `ready` avoids the inbox/team board flashing on every poll.
    const cached = workspaceId === undefined ? undefined : this.cache.get(workspaceId)
    const silent = this.state.status === 'ready' && this.state.workspaceId === workspaceId
    this.state = workspaceId === undefined
      ? { ...this.state, status: 'loading' }
      : silent
        ? { ...this.state, workspaceId }
        : cached === undefined
          ? { ...this.state, status: 'loading', workspaceId, sessions: [] }
          : { ...this.state, status: 'ready', workspaceId, sessions: cached.sessions, updatedAt: cached.updatedAt }
    this.emit()
    const run = async (): Promise<void> => {
      if (workspaceId === undefined) {
        this.state = { ...this.state, status: 'ready', sessions: [], updatedAt: Date.now() }
        this.emit()
        return
      }
      try {
        const result = await this.host.snapshot(workspaceId)
        if (this.disposed || this.panelId !== workspaceId) return
        if (result.ok) {
          const rows = result.value.sessions
          this.cache.set(workspaceId, { sessions: rows, updatedAt: Date.now() })
          this.prefetchOtherWorkspaces()
          this.currentRows = rows
          const observed: ShiftEvent[] = []
          if (this.knownSessions.size > 0) {
            for (const row of rows) {
              if (!this.knownSessions.has(row.sessionId)) observed.push('newSession')
              else if (this.previousStatus.get(row.sessionId) === 'running' && row.status === 'idle') observed.push('completed')
            }
          }
          this.knownSessions.clear()
          for (const row of rows) {
            this.knownSessions.add(row.sessionId)
            this.previousStatus.set(row.sessionId, row.status)
          }
          if (observed.length > 0) this.recordShift(observed)
          const firstVisit = this.memoryWorkspace !== workspaceId
          const previous = firstVisit ? this.host.readVisit(workspaceId) : undefined
          this.memoryWorkspace = workspaceId
          if (Date.now() - this.lastMemoryWrite > 30_000) {
            this.host.writeVisit(workspaceId, rememberVisit(rows, Date.now()))
            this.lastMemoryWrite = Date.now()
          }
          const serverChanges = result.value.changes
          const serverSeenAt = result.value.lastSeenAt
          const localChanges = firstVisit && serverChanges === undefined ? compareVisit(previous, rows) : undefined
          this.state = {
            ...this.state, status: 'ready', workspaceId, sessions: rows, error: undefined, updatedAt: Date.now(),
            ...serverChanges === undefined
              ? localChanges === undefined ? {} : { changes: localChanges }
              : { changes: new Map(serverChanges.map(sessionId => [sessionId, 'updated' as VisitChange])) },
            ...serverSeenAt !== undefined
              ? { lastSeenAt: serverSeenAt }
              : previous === undefined || !firstVisit ? {} : { lastSeenAt: previous.lastSeenAt },
          }
        } else {
          this.state = { ...this.state, status: 'error', workspaceId, error: result.error.message }
        }
      } catch (error) {
        if (this.disposed || this.panelId !== workspaceId) return
        this.state = {
          ...this.state, status: 'error', workspaceId,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      this.emit()
    }
    const promise = this.tail.then(run, run)
    this.tail = promise
    this.inFlight = { workspaceId, promise }
    void promise.finally(() => {
      if (this.inFlight?.promise === promise) this.inFlight = undefined
    })
    return promise
  }

  /** Stop timers, subscriptions, and pending publication. */
  dispose(): void {
    if (this.memoryWorkspace !== undefined) {
      this.host.writeVisit(this.memoryWorkspace, rememberVisit(this.currentRows, Date.now()))
      void this.host.acknowledge(this.memoryWorkspace).catch(() => {})
    }
    this.disposed = true
    this.focusAbort?.abort()
    this.focusAbort = undefined
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.stopWorkspaces()
    this.listeners.clear()
  }

  private emit(): void {
    if (this.disposed) return
    for (const listener of this.listeners) listener()
  }
}
