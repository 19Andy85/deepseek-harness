/** Persisted preference for automatically asking the agent to propose a task. */
const KEY = 'project-console.auto-propose.v1'

/** @returns whether automatic proposal is enabled. */
export function readAutoPropose(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

/** @param enabled - whether to enable automatic proposal. */
export function writeAutoPropose(enabled: boolean): void {
  try { localStorage.setItem(KEY, enabled ? '1' : '0') } catch { /* storage unavailable */ }
}
