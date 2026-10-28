/** Workspace console page: live sessions and their running activity families. */
import { useSyncExternalStore } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConsoleState, ConsoleWorkspace } from './ProjectConsoleStore.ts'
import type { ProjectConsoleKey } from './locales.ts'
import css from './ProjectConsolePage.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Project console page copy. */
    projectConsole: ProjectConsoleKey
  }
}

/** Data and actions the page reads; provided by the client plugin. */
export interface ProjectConsoleInjected {
  /** Observable overview state. */
  readonly store: HostObservable<ConsoleState>
  /** @returns selectable Workspaces in Host order. */
  readonly workspaceOptions: () => readonly ConsoleWorkspace[]
  /** @returns the selected Workspace id, when one is available. */
  readonly selectedWorkspaceId: () => string | undefined
  /**
   * Select one Workspace and read its overview.
   * @param workspaceId - Workspace to display.
   */
  readonly selectWorkspace: (workspaceId?: string) => void
  /** Re-read the selected Workspace overview. */
  readonly refresh: () => void
}

/** Framework props of the workspace console page. */
export type ProjectConsolePageProps = PropsRuntime<'main'> & PropsLocale<'projectConsole'> & InjectFace<ProjectConsoleInjected>

function activityLabel(entry: ConsoleState['sessions'][number]['activity'][number]): string {
  const items = entry.items?.map(item => item.label ?? item.id).join(', ')
  return items === undefined || items === '' ? entry.kind : `${entry.kind} · ${items}`
}

/**
 * Render the console page.
 * @param props - framework props, the page dictionary, and injected state/actions.
 * @returns the page body.
 */
export function ProjectConsolePage({ t, store, workspaceOptions, selectedWorkspaceId, selectWorkspace, refresh }: ProjectConsolePageProps) {
  const state = useSyncExternalStore(
    listener => store.subscribe(listener),
    () => store.getSnapshot(),
  )
  const selected = selectedWorkspaceId()
  const workspaces = workspaceOptions()
  const hasRows = state.sessions.length > 0

  return (
    <section className={css.page}>
      <header className={css.head}>
        <h1 className={css.title}>{t('title')}</h1>
        <p className={css.subtitle}>{t('description')}</p>
        <div className={css.toolbar}>
          <label className={css.meta} htmlFor="project-console-workspace">{t('workspace')}</label>
          <select
            id="project-console-workspace"
            className={css.select}
            value={selected ?? ''}
            onChange={(event) => { selectWorkspace(event.currentTarget.value === '' ? undefined : event.currentTarget.value) }}
          >
            {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}
          </select>
          <button type="button" className={css.select} onClick={() => { refresh() }}>{t('refresh')}</button>
        </div>
      </header>
      <div className={css.body}>
        {state.status === 'error' && !hasRows
          ? <div className={css.empty}>{t('error')}</div>
          : null}
        {state.status === 'error' && hasRows
          ? <div className={css.notice} role="alert">
            <span className={css.noticeText}>{t('error')}</span>
            <button type="button" className={css.select} onClick={() => { refresh() }}>{t('retry')}</button>
          </div>
          : null}
        {state.status === 'loading' && !hasRows
          ? ['a', 'b', 'c'].map(key => <div key={key} className={css.skeleton} />)
          : null}
        {state.status === 'ready' && !hasRows
          ? <div className={css.empty}>{t('empty')}</div>
          : null}
        {state.sessions.map(session => (
          <article key={session.sessionId} className={css.row}>
            <div className={css.rowHead}>
              <span className={css.sessionId}>{session.sessionId}</span>
              <span className={css.meta}>{session.status === 'running' ? t('running') : t('idle')}</span>
              {session.cwd === undefined ? null : <span className={css.meta}>{session.cwd}</span>}
            </div>
            <div className={css.badges}>
              {session.activity.length === 0
                ? <span className={css.chip}>{t('noActivity')}</span>
                : session.activity.map(entry => (
                  <span
                    key={entry.kind}
                    className={session.status === 'running' ? `${css.chip} ${css.chipRunning}` : css.chip}
                  >
                    {activityLabel(entry)}
                  </span>
                ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
