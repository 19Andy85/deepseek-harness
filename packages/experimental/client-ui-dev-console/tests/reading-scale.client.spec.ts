/** Reading-size detection and preference resolution. */

import { describe, expect, it } from 'vitest'
import { detectReadingLevel, resolveReadingLevel } from '../src/client/reading-scale.ts'

describe('reading scale', () => {
  it('comfortable on a scaled Retina display', () => {
    expect(detectReadingLevel({ devicePixelRatio: 1.5, screenWidth: 2048, physicalWidth: 3072 })).toBe('comfortable')
  })

  it('standard on a default Retina display', () => {
    expect(detectReadingLevel({ devicePixelRatio: 2, screenWidth: 1536, physicalWidth: 3072 })).toBe('standard')
  })

  it('compact on a narrow screen', () => {
    expect(detectReadingLevel({ devicePixelRatio: 1, screenWidth: 1280, physicalWidth: 1280 })).toBe('compact')
  })

  it('standard on an unscaled 4K display', () => {
    expect(detectReadingLevel({ devicePixelRatio: 1, screenWidth: 3840, physicalWidth: 3840 })).toBe('standard')
  })

  it('lets an explicit choice override detection', () => {
    const facts = { devicePixelRatio: 1.5, screenWidth: 2048, physicalWidth: 3072 }
    expect(resolveReadingLevel('compact', facts)).toBe('compact')
    expect(resolveReadingLevel('auto', facts)).toBe('comfortable')
  })
})
