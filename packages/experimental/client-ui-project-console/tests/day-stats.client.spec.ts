/** Day-scoped observed counters. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readShiftStats, recordShiftEvent, resetShiftStats } from '../src/client/day-stats.ts'

function storage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => { data.clear() },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size },
  }
}

const noon = new Date(2026, 9, 30, 12, 0, 0).getTime()

describe('shift stats', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', storage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('accumulates observed events for the same day', () => {
    recordShiftEvent('newSession', noon)
    recordShiftEvent('completed', noon)
    recordShiftEvent('completed', noon)
    const stats = readShiftStats(noon)
    expect(stats).toMatchObject({ day: '2026-10-30', newSession: 1, completed: 2, dispatched: 0 })
    expect(stats.since).toBe(noon)
  })

  it('starts a fresh summary on the next day', () => {
    recordShiftEvent('approvals', noon)
    const tomorrow = new Date(2026, 9, 31, 9, 0, 0).getTime()
    expect(readShiftStats(tomorrow)).toMatchObject({ day: '2026-10-31', approvals: 0 })
  })

  it('resets the counters and survives unavailable storage', () => {
    recordShiftEvent('questions', noon)
    expect(resetShiftStats(noon).questions).toBe(0)
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    expect(() => { recordShiftEvent('completed', noon) }).not.toThrow()
    expect(readShiftStats(noon).completed).toBe(1)
  })
})
