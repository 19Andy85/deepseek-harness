/** Reading-size preference and display-aware defaults for the console. */
const STORAGE_KEY = 'project-console.reading-scale.v1'

/** User-facing reading-size option. */
export type ReadingMode = 'auto' | 'compact' | 'standard' | 'comfortable' | 'extra-large'

/** Concrete reading level applied to the page. */
export type ReadingLevel = 'compact' | 'standard' | 'comfortable' | 'extra-large'

/** Display facts the automatic level reads. */
export interface DisplayFacts {
  /** Current device pixel ratio. */
  readonly devicePixelRatio: number
  /** Logical screen width in CSS pixels. */
  readonly screenWidth: number
  /** Physical screen width in device pixels. */
  readonly physicalWidth: number
}

/**
 * Read display facts from the browser.
 * @returns the current display facts; falls back to the viewport when `screen` is unavailable.
 */
export function displayFacts(): DisplayFacts {
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  const screenWidth = window.screen?.width !== undefined && window.screen.width > 0
    ? window.screen.width
    : window.innerWidth
  return {
    devicePixelRatio: ratio,
    screenWidth,
    physicalWidth: Math.round(screenWidth * ratio),
  }
}

/**
 * Detect a reading level from display facts.
 * @param facts - current display facts.
 * @returns comfortable for a scaled Retina display, compact for a narrow screen, standard otherwise.
 */
export function detectReadingLevel(facts: DisplayFacts): ReadingLevel {
  if (facts.physicalWidth >= 2560 && facts.devicePixelRatio >= 1.2 && facts.devicePixelRatio < 2) return 'comfortable'
  if (facts.screenWidth <= 1440) return 'compact'
  return 'standard'
}

/**
 * Resolve the applied level: an explicit user choice wins over detection.
 * @param mode - stored preference.
 * @param facts - current display facts.
 * @returns the concrete reading level.
 */
export function resolveReadingLevel(mode: ReadingMode, facts: DisplayFacts): ReadingLevel {
  return mode === 'auto' ? detectReadingLevel(facts) : mode
}

/**
 * Read the stored reading-size preference.
 * @returns stored mode, or auto when storage is unavailable.
 */
export function readReadingMode(): ReadingMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'compact' || raw === 'standard' || raw === 'comfortable' || raw === 'extra-large' || raw === 'auto') return raw
  } catch {
    // Storage unavailable keeps the automatic default.
  }
  return 'auto'
}

/**
 * Persist the reading-size preference.
 * @param mode - chosen mode.
 */
export function writeReadingMode(mode: ReadingMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage unavailable keeps the choice for this page session only.
  }
}
