/** Which console view the user last chose. */
export type ConsoleView = 'canvas' | 'studio'

/** localStorage key of the view preference. */
const VIEW_KEY = 'dsh.project-console.view.v1'

/**
 * Read the stored view preference.
 * @returns the stored view, or canvas when none is stored.
 */
export function readViewPreference(): ConsoleView {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === 'studio' ? 'studio' : 'canvas'
  } catch (error) {
    void error
    return 'canvas'
  }
}

/**
 * Persist the chosen view.
 * @param view - view to remember.
 */
export function writeViewPreference(view: ConsoleView): void {
  try {
    globalThis.localStorage?.setItem(VIEW_KEY, view)
  } catch (error) {
    void error
  }
}
