/** Which console view the user last chose. */
export type ConsoleView = 'overview' | 'canvas' | 'studio' | 'workspaces'

/** localStorage key of the view preference. */
const VIEW_KEY = 'dsh.project-console.view.v1'

/**
 * Read the stored view preference.
 * @returns the stored view, or canvas when none is stored.
 */
export function readViewPreference(): ConsoleView {
  try {
    const stored = globalThis.localStorage?.getItem(VIEW_KEY)
    return stored === 'overview' || stored === 'studio' || stored === 'workspaces' ? stored : stored === 'domains' ? 'workspaces' : 'overview'
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
