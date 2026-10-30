/** View preference persistence. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readViewPreference, writeViewPreference } from '../src/client/view-preference.ts'

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => { data.clear() },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size },
  }
}

describe('view preference', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('defaults to canvas and remembers studio', () => {
    vi.stubGlobal('localStorage', storage())
    expect(readViewPreference()).toBe('canvas')
    writeViewPreference('studio')
    expect(readViewPreference()).toBe('studio')
  })

  it('falls back to canvas when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    })
    expect(readViewPreference()).toBe('canvas')
    expect(() => { writeViewPreference('studio') }).not.toThrow()
  })
})
