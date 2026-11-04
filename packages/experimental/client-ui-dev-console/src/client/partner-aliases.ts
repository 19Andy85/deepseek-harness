/** Manual partner aliases persisted per browser. */
const STORAGE_KEY = 'project-console.partner-aliases.v1'

/**
 * Read the stored aliases.
 * @returns aliases keyed by Session id; empty when storage is unavailable.
 */
export function readPartnerAliases(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return {}
    const aliases: Record<string, string> = {}
    for (const [sessionId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim() !== '') aliases[sessionId] = value.trim()
    }
    return aliases
  } catch {
    return {}
  }
}

/**
 * Store or remove one alias.
 * @param sessionId - Session whose partner is renamed.
 * @param alias - new alias, or undefined to remove the alias.
 * @returns the updated alias map.
 */
export function writePartnerAlias(sessionId: string, alias: string | undefined): Record<string, string> {
  const current = readPartnerAliases()
  const next: Record<string, string> = {}
  for (const [id, value] of Object.entries(current)) {
    if (id !== sessionId) next[id] = value
  }
  if (alias !== undefined && alias.trim() !== '') next[sessionId] = alias.trim()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable keeps aliases for this page session only.
  }
  return next
}
