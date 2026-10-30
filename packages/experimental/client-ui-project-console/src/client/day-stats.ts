/** Real, client-observed counts of one day's console use; no fabricated history. */

/** Events the console observes and may report in the shift summary. */
export type ShiftEvent = 'newSession' | 'completed' | 'dispatched' | 'interrupted' | 'approvals' | 'questions'

/** One day's observed counters. */
export interface ShiftStats {
  /** Local day of the counters (YYYY-MM-DD). */
  readonly day: string
  /** When the first event of the day was observed. */
  readonly since: number
  /** Sessions that first appeared while the console watched. */
  readonly newSession: number
  /** Sessions observed moving from running to idle. */
  readonly completed: number
  /** Prompts dispatched from the console. */
  readonly dispatched: number
  /** Running turns interrupted from the console. */
  readonly interrupted: number
  /** Approvals answered from the console. */
  readonly approvals: number
  /** Questions or plan reviews answered from the console. */
  readonly questions: number
}

/** localStorage key prefix of one day's counters. */
const DAY_KEY = 'dsh.project-console.shift.v1:'

/** In-process fallback used only while storage itself is unavailable. */
const memory = new Map<string, ShiftStats>()

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch (error) {
    void error
    return undefined
  }
}

function dayOf(at: number): string {
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}

function emptyStats(at: number): ShiftStats {
  return {
    day: dayOf(at), since: at,
    newSession: 0, completed: 0, dispatched: 0, interrupted: 0, approvals: 0, questions: 0,
  }
}

/**
 * Read today's counters.
 * @param at - reference time, defaults to now.
 * @returns the stored counters, or a zeroed summary for this day.
 */
export function readShiftStats(at: number = Date.now()): ShiftStats {
  const store = storage()
  if (store === undefined) return memory.get(dayOf(at)) ?? emptyStats(at)
  try {
    const raw = store.getItem(DAY_KEY + dayOf(at))
    if (raw === null) return emptyStats(at)
    const parsed = JSON.parse(raw) as ShiftStats
    return parsed.day === dayOf(at) ? parsed : emptyStats(at)
  } catch (error) {
    void error
    return memory.get(dayOf(at)) ?? emptyStats(at)
  }
}

/**
 * Record observed events into today's counters in one read and one write.
 * @param events - observed console events.
 * @param at - event time, defaults to now.
 * @returns the updated counters.
 */
export function recordShiftEvents(events: readonly ShiftEvent[], at: number = Date.now()): ShiftStats {
  const current = readShiftStats(at)
  const counts: Record<ShiftEvent, number> = {
    newSession: current.newSession,
    completed: current.completed,
    dispatched: current.dispatched,
    interrupted: current.interrupted,
    approvals: current.approvals,
    questions: current.questions,
  }
  for (const event of events) counts[event] += 1
  const next: ShiftStats = { ...current, ...counts }
  memory.set(next.day, next)
  const store = storage()
  if (store !== undefined) {
    try {
      store.setItem(DAY_KEY + next.day, JSON.stringify(next))
    } catch (error) {
      void error
    }
  }
  return next
}

/**
 * Record one observed event into today's counters.
 * @param event - observed console event.
 * @param at - event time, defaults to now.
 * @returns the updated counters.
 */
export function recordShiftEvent(event: ShiftEvent, at: number = Date.now()): ShiftStats {
  return recordShiftEvents([event], at)
}

/**
 * Clear today's counters (the summary's reset action).
 * @param at - reference time, defaults to now.
 * @returns the zeroed summary.
 */
export function resetShiftStats(at: number = Date.now()): ShiftStats {
  const next = emptyStats(at)
  memory.set(next.day, next)
  try {
    globalThis.localStorage?.setItem(DAY_KEY + next.day, JSON.stringify(next))
  } catch (error) {
    void error
  }
  return next
}
