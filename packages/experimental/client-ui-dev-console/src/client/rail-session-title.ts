/** Display titles remembered when a Session menu opens the rail console. */
const titles = new Map<string, string>()

/** @param sessionId - Session opened in the rail. @param title - row display title. */
export function rememberRailSessionTitle(sessionId: string, title: string): void {
  titles.set(sessionId, title)
}

/** @param sessionId - Session whose row title was remembered. @returns the last known title. */
export function readRailSessionTitle(sessionId: string): string | undefined {
  return titles.get(sessionId)
}
