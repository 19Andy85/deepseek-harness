/** Live project console state: workspace selection, one session snapshot, and refresh scheduling. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionTaskView, SessionTasksSnapshot } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'

/** One selectable Workspace row. */
export interface ConsoleWorkspace {
  /** Stable Workspace identity. */
  readonly id: string
  /** Display title. */
  readonly title: string
  /** Canonical directory path. */
  readonly path: string
}

/** Observable page state. */
export interface ConsoleState {
  /** Read lifecycle of the current overview. */
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  /** User-safe failure text, set only in the error state. */
  readonly error?: string
  /** Workspace the visible rows belong to. */
  readonly workspaceId?: string
  /** Live sessions of that workspace. */
  readonly sessions: readonly SessionTaskView[]
}

/** Host ports the store reads; tests can provide them without a browser. */
export interface ProjectConsoleHost {
  /** Current Workspace rows in Host order. */
  listWorkspaces(): readonly ConsoleWorkspace[]
  /** Subscribe to Workspace list changes. */
  subscribeWorkspaces(listener: () => void): () => void
  /** Read one workspace-scoped overview through the Remote. */
  snapshot(workspaceId?: string): Promise<RemoteResult<SessionTasksSnapshot>>
}

/** Default coalescing window before an event-triggered re-read. */
const REFRESH_DELAY_MS = 150

/** One page's overview state and refresh policy. */
export class ProjectConsoleStore {
  private readonly listeners = new Set<() => void>()
  private state: ConsoleState = { status: 'idle', sessions: [] }
  private workspaces: readonly ConsoleWorkspace[] = []
  private panelId: string | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private tail: Promise<void> = Promise.resolve()
  private readonly stopWorkspaces: () => void

  /** @param host - Workspace and Remote ports. */
  constructor(private readonly host: ProjectConsoleHost) {
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
   * Select one Workspace and read its overview.
   * @param workspaceId - Workspace to display; omission keeps the current selection.
   * @returns completion after the selected Workspace's state settles.
   */
  selectWorkspace(workspaceId?: string): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.panelId = workspaceId
    return this.refresh()
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
    this.state = workspaceId === undefined
      ? { status: 'loading', sessions: this.state.sessions }
      : { status: 'loading', workspaceId, sessions: this.state.sessions }
    this.emit()
    const run = async (): Promise<void> => {
      if (workspaceId === undefined) {
        this.state = { status: 'ready', sessions: [] }
        this.emit()
        return
      }
      try {
        const result = await this.host.snapshot(workspaceId)
        if (this.disposed || this.panelId !== workspaceId) return
        this.state = result.ok
          ? { status: 'ready', workspaceId, sessions: result.value.sessions }
          : { status: 'error', workspaceId, sessions: this.state.sessions, error: result.error.message }
      } catch (error) {
        if (this.disposed || this.panelId !== workspaceId) return
        this.state = {
          status: 'error', workspaceId, sessions: this.state.sessions,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      this.emit()
    }
    this.tail = this.tail.then(run, run)
    return this.tail
  }

  /** Stop timers, subscriptions, and pending publication. */
  dispose(): void {
    this.disposed = true
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
