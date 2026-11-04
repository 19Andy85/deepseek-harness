/** Local dispatch task cards: small prompts the manager can drag onto a partner. */
const STORAGE_KEY = 'project-console.task-cards.v1'
const MAX_CARDS = 6

/** One local task card. */
export interface TaskCard {
  /** Stable card identity. */
  readonly id: string
  /** Prompt the card dispatches. */
  readonly text: string
}

/**
 * Read stored task cards.
 * @returns stored cards, or an empty list when storage is unavailable.
 */
export function readTaskCards(): TaskCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const cards: TaskCard[] = []
    for (const value of parsed) {
      if (value === null || typeof value !== 'object') continue
      const record = value as { id?: unknown; text?: unknown }
      if (typeof record.id !== 'string' || typeof record.text !== 'string') continue
      if (record.text.trim() === '') continue
      cards.push({ id: record.id, text: record.text })
    }
    return cards.slice(0, MAX_CARDS)
  } catch {
    return []
  }
}

/**
 * Replace the stored task cards.
 * @param cards - cards to persist.
 * @returns the persisted list, capped.
 */
export function writeTaskCards(cards: readonly TaskCard[]): TaskCard[] {
  const next = cards.slice(0, MAX_CARDS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable keeps the cards for this page session only.
  }
  return next
}

/**
 * Create one card from typed text.
 * @param text - prompt text.
 * @returns the new card, or undefined for blank text.
 */
export function createTaskCard(text: string): TaskCard | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  return { id: `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed }
}

/**
 * Parse a drag payload into a card.
 * @param raw - serialized card payload.
 * @returns the card, or undefined for malformed payloads.
 */
export function parseTaskCard(raw: string): TaskCard | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const record = parsed as { id?: unknown; text?: unknown }
    if (typeof record.id !== 'string' || typeof record.text !== 'string') return undefined
    return record.text.trim() === '' ? undefined : { id: record.id, text: record.text }
  } catch {
    return undefined
  }
}
