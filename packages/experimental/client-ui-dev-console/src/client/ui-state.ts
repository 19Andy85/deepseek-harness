/** Per-workspace UI state so the console resumes where the manager left off. */
import type { HealthFilter } from './visual/visual.tsx'

/** Relation presentation chosen in the toolbar. */
export type RelationMode = 'inline' | 'canvas'

/** Restorable console UI state of one Workspace. */
export interface ConsoleUiState {
  /** Selected partner Session. */
  readonly activeId?: string | undefined
  /** Active state-bar filter. */
  readonly filter?: HealthFilter
  /** Relation presentation. */
  readonly relationView?: RelationMode
  /** Whether the task-card composer was expanded. */
  readonly cardBoardOpen?: boolean
  /** Scroll offset of the main column. */
  readonly scrollTop?: number
}

const PREFIX = 'project-console.ui.v1:'
const EMPTY: ConsoleUiState = {}

function keyOf(workspaceId: string): string {
  return `${PREFIX}${workspaceId}`
}

/**
 * Read the saved UI state of one Workspace.
 * @param workspaceId - Workspace identity; undefined keeps the default state.
 * @returns saved state, or an empty object when nothing valid was stored.
 */
export function readUiState(workspaceId: string | undefined): ConsoleUiState {
  if (workspaceId === undefined) return EMPTY
  try {
    const raw = localStorage.getItem(keyOf(workspaceId))
    if (raw === null) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return EMPTY
    const value = parsed as Record<string, unknown>
    const state: {
      activeId?: string
      filter?: HealthFilter
      relationView?: RelationMode
      cardBoardOpen?: boolean
      scrollTop?: number
    } = {}
    if (typeof value.activeId === 'string') state.activeId = value.activeId
    if (value.filter === 'running' || value.filter === 'needs' || value.filter === 'failed'
      || value.filter === 'completed' || value.filter === 'idle') state.filter = value.filter
    if (value.relationView === 'inline' || value.relationView === 'canvas') state.relationView = value.relationView
    if (typeof value.cardBoardOpen === 'boolean') state.cardBoardOpen = value.cardBoardOpen
    if (typeof value.scrollTop === 'number' && Number.isFinite(value.scrollTop)) state.scrollTop = value.scrollTop
    return state
  } catch {
    return EMPTY
  }
}

/**
 * Persist the UI state of one Workspace.
 * @param workspaceId - Workspace identity.
 * @param state - state to store.
 */
export function writeUiState(workspaceId: string, state: ConsoleUiState): void {
  try {
    localStorage.setItem(keyOf(workspaceId), JSON.stringify(state))
  } catch {
    // Storage unavailable keeps the state for this page session only.
  }
}
