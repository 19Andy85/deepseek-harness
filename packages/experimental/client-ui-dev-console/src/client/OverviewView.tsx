/** Global console overview: attention, sessions, plans, and workspace portfolio. */
import type { HealthCounts } from './attention.ts'
import type { ActionItem } from './action-items.ts'
import type { GlobalHealthCounts, WorkspaceRunningCount } from './global-inbox.ts'
import type { ConsoleWorkspace } from './ProjectConsoleStore.ts'
import type { ReactNode } from 'react'
import type { ProjectConsoleKey } from './locales.ts'
import css from './OverviewView.module.css'

/** Props of the overview skeleton. */
export interface OverviewViewProps {
  readonly health: HealthCounts
  readonly globalHealth: GlobalHealthCounts
  readonly usage: number
  readonly actionItems: readonly ActionItem[]
  readonly runningByWorkspace: readonly WorkspaceRunningCount[]
  readonly workspaces: readonly ConsoleWorkspace[]
  readonly selectedWorkspaceId?: string | undefined
  readonly globalPending: number
  readonly projects?: readonly ProjectSummaryView[] | undefined
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onSelectWorkspace: (workspaceId: string) => void
  readonly onRefresh: () => void
  readonly onOpenAction: (item: ActionItem) => void
}

/** One project and its workspaces for the portfolio card. */
export interface ProjectSummaryView {
  readonly id: string
  readonly name: string
  readonly root: string
  readonly workspaces: readonly { readonly id: string; readonly name: string; readonly worktree: string; readonly branch: string }[]
}

const tokenFormat = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })

/**
 * Render the first global overview skeleton over the existing console data.
 * @param props - current workspace health, sessions, workspaces, and callbacks.
 * @returns the overview content.
 */
export function OverviewView(props: OverviewViewProps) {
  const {
    health, globalHealth, usage, actionItems, runningByWorkspace, workspaces, selectedWorkspaceId, globalPending, projects, t,
    onSelectWorkspace, onRefresh, onOpenAction,
  } = props
  const statusCount = (label: ProjectConsoleKey, value: number, tone: string | undefined): ReactNode => (
    <span className={css.metric} title={label}><b className={tone}>{value}</b><span>{t(label)}</span></span>
  )
  return (
    <div className={css.overview}>
      <div className={css.attention} aria-label={t('overview')}>
        {statusCount('needsYou', globalHealth.needsYou, css.warn)}
        {statusCount('failed', health.failed, css.bad)}
        {statusCount('running', globalHealth.running, css.info)}
        {statusCount('completedUnread', globalHealth.completedUnread, css.ok)}
        {statusCount('idle', globalHealth.idle, css.muted)}
        <span className={css.spacer} />
        <span className={css.metric}><b className={css.warn}>{globalPending}</b><span>{t('globalInbox')}</span></span>
        <button type="button" className={css.button} onClick={onRefresh}>{t('refresh')}</button>
      </div>

      <div className={css.grid}>
        <section className={css.card}>
          <div className={css.cardHead}><h2>{t('globalInbox')}</h2><span className={css.badge}>{actionItems.length}</span></div>
          {actionItems.length === 0 ? <p className={css.empty}>{t('noPending')}</p> : (
            <div className={css.list}>
              {actionItems.slice(0, 5).map(item => (
                <button key={item.id} type="button" className={css.rowItem} onClick={() => { onOpenAction(item) }}>
                  <span className={css.rowTitle}>{item.title}</span>
                  <span className={css.rowMeta}>{item.detail}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={css.card}>
          <div className={css.cardHead}><h2>{t('activeSessions')}</h2><span className={css.badge}>{globalHealth.running}</span></div>
          <div className={css.list}>
            {runningByWorkspace.length === 0 ? <p className={css.empty}>{t('noActivity')}</p> : null}
            {runningByWorkspace.slice(0, 6).map(workspace => (
              <button key={workspace.workspaceId} type="button" className={css.rowItem} onClick={() => { onSelectWorkspace(workspace.workspaceId) }}>
                <span className={css.rowTitle}>{workspace.title}</span>
                <span className={css.rowMetaRun}>{workspace.count}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={css.card}>
          <div className={css.cardHead}><h2>{t('plansHealth')}</h2><span className={css.badge}>0</span></div>
          <p className={css.empty}>{t('planDataPending')}</p>
        </section>

        <section className={css.card}>
          <div className={css.cardHead}><h2>{t('projectsWorkspaces')}</h2><span className={css.badge}>{projects !== undefined && projects.length > 0 ? projects.length : workspaces.length}</span></div>
          <div className={css.list}>
            {projects !== undefined && projects.length > 0
              ? projects.map(project => (
                <div key={project.id} className={css.projectGroup}>
                  <div className={css.projectName}>{project.name}</div>
                  {project.workspaces.map(workspace => (
                    <button
                      key={workspace.id}
                      type="button"
                      className={workspace.id === selectedWorkspaceId ? `${css.rowItem} ${css.rowSelected}` : css.rowItem}
                      onClick={() => { onSelectWorkspace(workspace.id) }}
                    >
                      <span className={css.rowTitle}>{workspace.name}</span>
                      <span className={css.rowMeta}>{workspace.branch}</span>
                    </button>
                  ))}
                </div>
              ))
              : workspaces.slice(0, 6).map(workspace => (
                <button
                  key={workspace.id}
                  type="button"
                  className={workspace.id === selectedWorkspaceId ? `${css.rowItem} ${css.rowSelected}` : css.rowItem}
                  onClick={() => { onSelectWorkspace(workspace.id) }}
                >
                  <span className={css.rowTitle}>{workspace.title}</span>
                  <span className={css.rowMeta}>{workspace.id === selectedWorkspaceId ? t('workspace') : ''}</span>
                </button>
              ))}
          </div>
          <div className={css.cardFoot}>{t('workspaceTokens')} · {tokenFormat.format(usage)}</div>
        </section>
      </div>
    </div>
  )
}
