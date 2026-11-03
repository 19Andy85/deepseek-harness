/** Local durable state for the console: recent actions and unsent drafts. */
const PREFIX = 'dsh.project-console.durable.v1:'

/** BroadcastChannel name shared by console windows. */
export const CONSOLE_CHANNEL = 'dsh.project-console.durable.v1'

/** One recorded console action. */
export interface ConsoleAction {
  /** Stable identity of the action. */
  readonly id: number
  /** Localized label shown in the recent-action log. */
  readonly label: string
  /** Epoch milliseconds. */
  readonly at: number
}

/** A cross-window durable-state update. */
export type ConsoleMessage =
  | { readonly kind: 'actions'; readonly workspace: string; readonly actions: readonly ConsoleAction[] }
  | { readonly kind: 'prompt'; readonly workspace: string; readonly value: string }
  | { readonly kind: 'card'; readonly workspace: string; readonly value: string }
  | { readonly kind: 'reply'; readonly workspace: string; readonly sessionId: string; readonly value: string }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw === null || raw === undefined ? fallback : JSON.parse(raw) as T
  } catch (error) {
    void error
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)) } catch (error) { void error }
}

/** @param workspaceId - owning workspace. @returns persisted recent actions. */
export function readActions(workspaceId: string | undefined): readonly ConsoleAction[] {
  return workspaceId === undefined ? [] : read(`${PREFIX}actions:${workspaceId}`, [])
}

/** @param workspaceId - owning workspace. @param actions - actions to persist. */
export function writeActions(workspaceId: string | undefined, actions: readonly ConsoleAction[]): void {
  if (workspaceId === undefined) return
  write(`${PREFIX}actions:${workspaceId}`, actions.slice(0, 50))
}

/** @param workspaceId - owning workspace. @param kind - draft kind. @returns the saved draft. */
export function readDraft(workspaceId: string | undefined, kind: 'prompt' | 'card'): string {
  return workspaceId === undefined ? '' : read(`${PREFIX}draft:${workspaceId}:${kind}`, '')
}

/** @param workspaceId - owning workspace. @param kind - draft kind. @param value - draft text. */
export function writeDraft(workspaceId: string | undefined, kind: 'prompt' | 'card', value: string): void {
  if (workspaceId === undefined) return
  write(`${PREFIX}draft:${workspaceId}:${kind}`, value)
}

/** @param sessionId - session the reply belongs to. @returns the saved reply draft. */
export function readReplyDraft(sessionId: string | null): string {
  return sessionId === null ? '' : read(`${PREFIX}reply:${sessionId}`, '')
}

/** @param sessionId - session the reply belongs to. @param value - draft text. */
export function writeReplyDraft(sessionId: string | null, value: string): void {
  if (sessionId === null) return
  write(`${PREFIX}reply:${sessionId}`, value)
}
