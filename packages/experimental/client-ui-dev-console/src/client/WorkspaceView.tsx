/** Dev Console workspace panel: registry on the left, selected workspace detail on the right. */
import { useEffect, useState } from 'react'
import { ConfigEditor } from './ConfigEditor.tsx'
import type { ProjectConsoleKey } from './locales.ts'
import css from './WorkspaceView.module.css'

export interface WorkspaceStateView {
  readonly bindings: Readonly<Record<string, readonly string[]>>
  readonly audit: readonly AgentsAudit[]
}

export interface AgentsAudit { readonly at: number; readonly path: string; readonly baseHash: string; readonly newHash: string }

function lineDiff(original: string, next: string): string {
  const before = original.split('\n')
  const after = next.split('\n')
  const out: string[] = []
  const max = Math.max(before.length, after.length)
  for (let index = 0; index < max; index += 1) {
    if (before[index] === after[index]) continue
    if (before[index] !== undefined) out.push(`- ${before[index]}`)
    if (after[index] !== undefined) out.push(`+ ${after[index]}`)
  }
  return out.length === 0 ? 'no changes' : out.join('\n')
}

/** One configured workspace as the panel renders it. */
export interface WorkspaceConfigView {
  readonly id: string
  readonly name: string
  readonly worktree: string
  readonly branch: string
  readonly hooks: { readonly expectedBranch: string; readonly expectedToplevel: string }
}

/** Live inspection of one workspace. */
export interface WorkspaceInspectionView {
  readonly canonicalWorktree?: string
  readonly toplevel?: string
  readonly branch?: string
  readonly clean: boolean
  readonly problems: readonly string[]
}

/** One workspace row. */
export interface WorkspaceStatusView {
  readonly projectId: string
  readonly projectName?: string
  readonly projectRoot?: string
  readonly workspace: WorkspaceConfigView
  readonly inspection?: WorkspaceInspectionView
  readonly sessions?: readonly { readonly sessionId: string; readonly cwd: string; readonly live: boolean }[]
}

/** Recent activity summary of one workspace. */
export interface WorkspaceSummaryView {
  readonly commit?: { readonly hash: string; readonly subject: string; readonly at: string }
  readonly dirtyCount: number
  readonly ahead?: number
  readonly behind?: number
  readonly agents?: { readonly bytes: number; readonly hash: string }
}

/** Snapshot of the workspace registry. */
export interface WorkspaceSnapshotView {
  readonly problems: readonly { readonly code: string; readonly path: string; readonly message: string }[]
  readonly warnings: readonly { readonly code: string; readonly path: string; readonly message: string }[]
  readonly workspaces: readonly WorkspaceStatusView[]
}

/** Result of opening a workspace. */
export interface WorkspaceOpenView {
  readonly sessionId: string
  readonly cwd: string
}

/** Injected Dev Console workspace actions. */
export interface WorkspaceViewInjected {
  readonly snapshot: () => Promise<WorkspaceSnapshotView>
  readonly sessionContext: (sessionId: string) => Promise<{
    readonly sessionId: string
    readonly workspaceId?: string | undefined
    readonly projectId?: string | undefined
    readonly briefId?: string | undefined
    readonly briefTitle?: string | undefined
    readonly planId?: string | undefined
    readonly planVersion?: number | undefined
  }>
  readonly inspect: (workspaceIds?: readonly string[], refresh?: boolean) => Promise<readonly WorkspaceStatusView[]>
  readonly history: (workspaceId: string, options?: { readonly offset?: number; readonly query?: string }) => Promise<{
    readonly sessions: readonly { readonly sessionId: string; readonly live: boolean }[]
    readonly total: number
    readonly hasMore: boolean
  }>
  readonly state: () => Promise<WorkspaceStateView>
  readonly bind: (workspaceId: string, sessionId: string) => Promise<WorkspaceStateView>
  readonly summary: (workspaceId: string) => Promise<WorkspaceSummaryView>
  readonly openWorkspace: (workspaceId: string) => Promise<WorkspaceOpenView>
  readonly git: (workspaceId: string, action: 'status' | 'log' | 'diff') => Promise<{ readonly text: string }>
  readonly agents: (workspaceId: string) => Promise<{ readonly path: string; readonly text: string; readonly hash: string }>
  readonly saveAgents: (workspaceId: string, text: string, baseHash: string) => Promise<{ readonly hash: string }>
  readonly autoConfig: (overwrite: boolean) => Promise<{ readonly path: string; readonly projects: number }>
  readonly config: () => Promise<{ readonly path: string; readonly yaml: string }>
  readonly saveConfig: (yaml: string) => Promise<{ readonly path: string; readonly warnings: readonly { readonly message: string }[] }>
  readonly openSession: (sessionId: string) => void
}

/** Props of the workspace panel. */
export interface WorkspaceViewProps extends WorkspaceViewInjected {
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onClose: () => void
  /** Render inline inside the console body instead of as a modal. */
  readonly inline?: boolean
  readonly sessionId?: string | undefined
}

type Detail =
  | { readonly kind: 'git'; readonly title: string; readonly text: string }
  | { readonly kind: 'agents'; readonly title: string; readonly text: string; readonly workspaceId: string; readonly hash: string }
  | undefined

/**
 * Render the workspace registry and the selected workspace's detail.
 * @param props - Remote actions, dictionary, and close handler.
 * @returns the workspace panel.
 */
export function WorkspaceView({
  snapshot, inspect, history, state, bind, summary, sessionContext, sessionId, openWorkspace, git, agents,
  saveAgents, autoConfig, config, saveConfig, openSession, t, onClose, inline,
}: WorkspaceViewProps) {
  const [data, setData] = useState<WorkspaceSnapshotView | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [detail, setDetail] = useState<Detail>(undefined)
  const [draft, setDraft] = useState('')
  const [agentsOriginal, setAgentsOriginal] = useState('')
  const [audit, setAudit] = useState<readonly AgentsAudit[]>([])
  const [bindings, setBindings] = useState<Readonly<Record<string, readonly string[]>>>({})
  const [opening, setOpening] = useState<string | undefined>(undefined)
  const [pendingEphemeral, setPendingEphemeral] = useState<string | undefined>(undefined)
  const [configOpen, setConfigOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'ready' | 'blocked'>('all')
  const [historyRows, setHistoryRows] = useState<readonly { readonly sessionId: string; readonly live: boolean }[] | undefined>(undefined)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [overview, setOverview] = useState<WorkspaceSummaryView | undefined>(undefined)
  const [overviewLoading, setOverviewLoading] = useState(false)
  type SessionInfo = {
    readonly briefTitle?: string | undefined
    readonly planVersion?: number | undefined
    readonly workspaceId?: string | undefined
    readonly directives?: readonly {
      readonly id: string
      readonly type: string
      readonly summary: string
      readonly status: 'pending' | 'delivered' | 'failed'
      readonly createdAt: number
    }[] | undefined
  }
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | undefined>(undefined)
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined)
  const [inspecting, setInspecting] = useState(true)
  const notify = (kind: 'ok' | 'error', text: string): void => {
    setToast({ kind, text })
    window.setTimeout(() => { setToast(current => current?.text === text ? undefined : current) }, 3000)
  }
  const inspectAll = async (refresh: boolean): Promise<void> => {
    setInspecting(true)
    try {
      const rows = await inspect(undefined, refresh)
      setData(current => current === undefined ? current : {
        ...current,
        workspaces: current.workspaces.map(row => rows.find(next => next.workspace.id === row.workspace.id) ?? row),
      })
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    } finally { setInspecting(false) }
  }
  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      const next = await snapshot()
      setData(next)
      setError(undefined)
      setSelected(current => current !== undefined && next.workspaces.some(row => row.workspace.id === current)
        ? current
        : next.workspaces[0]?.workspace.id)
      void inspectAll(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    void state().then((value) => {
      setBindings(value.bindings)
      setAudit(value.audit)
    }).catch(() => { /* state is optional before storage mounts */ })
  }, [])
  useEffect(() => {
    if (sessionId === undefined) { setSessionInfo(undefined); return }
    void sessionContext(sessionId).then((value) => {
      setSessionInfo(value)
      if (value.workspaceId !== undefined) setSelected(value.workspaceId)
    }).catch(() => { setSessionInfo(undefined) })
  }, [sessionId])
  useEffect(() => {
    if (selected === undefined) { setOverview(undefined); return }
    setOverview(undefined)
    setOverviewLoading(true)
    void summary(selected).then(setOverview).catch(() => { setOverview(undefined) }).finally(() => { setOverviewLoading(false) })
  }, [selected])
  const open = (workspaceId: string): void => {
    const ephemeral = data?.warnings.some(warning => warning.code === 'ephemeral-path') === true
    if (ephemeral && pendingEphemeral !== workspaceId) { setPendingEphemeral(workspaceId); return }
    setPendingEphemeral(undefined)
    setOpening(workspaceId)
    void openWorkspace(workspaceId).then((value) => {
      void bind(workspaceId, value.sessionId).then((result) => {
        setBindings(result.bindings)
        setAudit(result.audit)
      }).catch((reason: unknown) => {
        notify('error', reason instanceof Error ? reason.message : String(reason))
      })
      notify('ok', `${t('workspaceOpened')} · ${value.sessionId}`)
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setOpening(undefined) })
  }
  const runGit = (workspaceId: string, action: 'status' | 'log' | 'diff'): void => {
    setBusy(`git-${action}`)
    void git(workspaceId, action).then((value) => {
      setDetail({ kind: 'git', title: `git ${action}`, text: value.text })
      notify('ok', t('loaded'))
    }).catch((reason: unknown) => {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(undefined) })
  }
  const openAgents = (workspaceId: string): void => {
    setBusy('agents')
    void agents(workspaceId).then((value) => {
      setDetail({ kind: 'agents', title: value.path, text: value.text, workspaceId, hash: value.hash })
      setDraft(value.text)
      setAgentsOriginal(value.text)
      notify('ok', t('loaded'))
    }).catch((reason: unknown) => {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(undefined) })
  }
  const loadHistory = async (append: boolean): Promise<void> => {
    if (selected === undefined) return
    setBusy('history')
    try {
      const result = await history(selected, {
        ...append ? { offset: historyRows?.length ?? 0 } : {},
        ...historyQuery.trim() === '' ? {} : { query: historyQuery },
      })
      setHistoryRows(append ? [...(historyRows ?? []), ...result.sessions] : result.sessions)
      setHistoryTotal(result.total)
      setHistoryHasMore(result.hasMore)
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(undefined) }
  }
  const projects = new Map<string, WorkspaceStatusView[]>()
  const needle = query.trim().toLowerCase()
  for (const row of data?.workspaces ?? []) {
    const text = `${row.projectId} ${row.workspace.id} ${row.workspace.name} ${row.workspace.worktree}`.toLowerCase()
    if (needle !== '' && !text.includes(needle)) continue
    const problems = row.inspection?.problems.length ?? 0
    if (filter === 'ready' && problems > 0) continue
    if (filter === 'blocked' && problems === 0) continue
    projects.set(row.projectId, [...(projects.get(row.projectId) ?? []), row])
  }
  const current = data?.workspaces.find(row => row.workspace.id === selected)
  const bound = selected === undefined ? [] : bindings[selected] ?? []
  return (
    <div
      className={inline === true ? css.inlineRoot : css.scrim}
      role="dialog"
      aria-label={t('workspacesTitle')}
      onMouseDown={(event) => { if (inline !== true && event.target === event.currentTarget) onClose() }}
    >
      <section className={inline === true ? css.inlinePanel : css.panel}>
        <header className={css.head}>
          <div>
            <h2 className={css.title}>{t('workspacesTitle')}</h2>
            <p className={css.hint}>{t('workspacesHint')}</p>
          </div>
          <div className={css.actions}>
            {data === undefined ? null : (
              <button type="button" className={css.button} onClick={() => {
                const overwrite = data.workspaces.length > 0
                if (overwrite && !window.confirm(t('regenerateConfirm'))) return
                void autoConfig(overwrite).then(() => { void load() }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : String(reason))
                })
              }}>{data.workspaces.length === 0 ? t('autoConfig') : t('regenerateConfig')}</button>
            )}
            <button type="button" className={css.button} onClick={() => { setConfigOpen(true) }}>{t('editConfig')}</button>
            <button type="button" className={css.button} disabled={inspecting} onClick={() => { void inspectAll(true) }}>{inspecting ? t('inspecting') : t('refresh')}</button>
            <button type="button" className={css.button} onClick={onClose}>{t('close')}</button>
          </div>
        </header>
        {error === undefined ? null : <p className={css.error}>{error}</p>}
        <div className={css.body}>
          <aside className={css.list} aria-label={t('workspacesTitle')}>
            <input
              className={css.search}
              value={query}
              placeholder={t('searchWorkspaces')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
            <div className={css.filterRow}>
              {(['all', 'ready', 'blocked'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? `${css.filterButton} ${css.filterActive}` : css.filterButton}
                  onClick={() => { setFilter(value) }}
                >{value === 'all' ? t('filterAll') : value === 'ready' ? t('workspaceOk') : t('workspaceBlocked')}</button>
              ))}
            </div>
            {loading ? <p className={css.muted}>{t('loading')}</p> : null}
            {[...projects.entries()].map(([projectId, rows]) => (
              <section key={projectId} className={css.project}>
                <h3 className={css.projectName}>{rows[0]?.projectName ?? projectId}</h3>
                {rows.map(row => (
                  <button
                    key={row.workspace.id}
                    type="button"
                    className={selected === row.workspace.id ? `${css.workspaceRow} ${css.workspaceRowActive}` : css.workspaceRow}
                    onClick={() => { setSelected(row.workspace.id); setDetail(undefined); setHistoryRows(undefined); setHistoryQuery('') }}
                  >
                    <span className={css.workspaceText}>
                      <span className={css.workspaceName}>{row.workspace.name}</span>
                      <span className={css.workspaceMeta}>{row.inspection?.branch ?? row.workspace.branch}</span>
                    </span>
                    {row.inspection === undefined
                      ? <span className={css.muted}>{t('loading')}</span>
                      : (
                        <span className={row.inspection.problems.length === 0 ? css.ok : css.fail}>
                          {row.inspection.problems.length === 0 ? t('workspaceOk') : t('workspaceBlocked')}
                        </span>
                      )}
                  </button>
                ))}
              </section>
            ))}
            {!loading && data?.workspaces.length === 0
              ? <p className={css.muted}>{t('noWorkspaces')}</p>
              : null}
          </aside>
          <main className={css.detail}>
            {current === undefined
              ? <p className={css.muted}>{t('noWorkspaces')}</p>
              : (
                <>
                  <div className={css.detailHead}>
                    <div>
                      <h3 className={css.detailTitle}>{current.workspace.name}</h3>
                      <p className={css.hint}>{current.projectId} / {current.workspace.id}</p>
                    </div>
                    {current.inspection === undefined
                      ? <span className={css.muted}>{t('loading')}</span>
                      : (
                        <span className={current.inspection.problems.length === 0 ? css.ok : css.fail}>
                          {current.inspection.problems.length === 0 ? t('workspaceOk') : t('workspaceBlocked')}
                        </span>
                      )}
                  </div>
                  {sessionInfo === undefined ? null : (
                    <div className={css.contextBanner}>
                      <div>当前会话：{sessionInfo.briefTitle ?? '未关联任务单'}
                        {sessionInfo.planVersion === undefined ? '' : ` · 计划 v${String(sessionInfo.planVersion)}`}
                      </div>
                      {sessionInfo.briefTitle === undefined
                        ? <div className={css.contextMuted}>先在「消息 → 任务单」创建任务单并关联工作区，计划批准后会在这里出现。</div>
                        : null}
                      {(sessionInfo.directives ?? []).length === 0 ? null : (
                        <div className={css.contextMuted}>
                          最近指令：{sessionInfo.directives?.slice(0, 3).map(item => `${item.type} · ${item.status}`).join('；')}
                        </div>
                      )}
                    </div>
                  )}
                  <dl className={css.facts}>
                    <div><dt>{t('worktree')}</dt><dd>{current.inspection?.canonicalWorktree ?? current.workspace.worktree}</dd></div>
                    <div><dt>{t('branch')}</dt><dd>{current.inspection === undefined ? '…' : `${current.inspection.branch ?? '—'} / ${current.workspace.hooks.expectedBranch}`}</dd></div>
                    <div><dt>{t('toplevel')}</dt><dd>{current.inspection === undefined ? '…' : current.inspection.toplevel ?? '—'}</dd></div>
                  </dl>
                  {current.inspection === undefined
                    ? <p className={css.muted}>{t('inspecting')}</p>
                    : current.inspection.problems.map(problem => <p key={problem} className={css.fail}>{problem}</p>)}
                  <div className={css.overview}>
                    {overviewLoading
                      ? <span className={css.muted}>{t('loading')}</span>
                      : overview === undefined
                        ? <span className={css.muted}>{t('summaryUnavailable')}</span>
                        : (
                          <>
                            <span className={css.metric}><strong>{overview.commit?.hash ?? '—'}</strong><span>{overview.commit?.subject ?? t('noCommit')}</span></span>
                            <span className={css.metric}><strong>{overview.dirtyCount}</strong><span>{t('dirtyFiles')}</span></span>
                            <span className={css.metric}><strong>{overview.ahead ?? '—'} / {overview.behind ?? '—'}</strong><span>{t('aheadBehind')}</span></span>
                            <span className={css.metric}><strong>{overview.agents?.bytes ?? '—'}</strong><span>AGENTS.md</span></span>
                          </>
                        )}
                  </div>
                  <div className={css.actions}>
                    <button type="button" className={css.button} onClick={() => { runGit(current.workspace.id, 'status') }} disabled={busy !== undefined}>{busy === 'git-status' ? '…' : t('gitStatus')}</button>
                    <button type="button" className={css.button} onClick={() => { runGit(current.workspace.id, 'log') }} disabled={busy !== undefined}>{busy === 'git-log' ? '…' : t('gitLog')}</button>
                    <button type="button" className={css.button} onClick={() => { runGit(current.workspace.id, 'diff') }} disabled={busy !== undefined}>{busy === 'git-diff' ? '…' : t('gitDiff')}</button>
                    <button type="button" className={css.button} onClick={() => { openAgents(current.workspace.id) }} disabled={busy !== undefined}>{busy === 'agents' ? '…' : 'AGENTS'}</button>
                    <button
                      type="button"
                      className={css.button}
                      disabled={current.inspection === undefined || current.inspection.problems.length > 0 || opening !== undefined}
                      onClick={() => {
                        const sessionId = bound[0]
                        if (sessionId === undefined) { open(current.workspace.id); return }
                        openSession(sessionId)
                      }}
                    >{opening === current.workspace.id ? t('opening') : pendingEphemeral === current.workspace.id ? t('confirmEphemeralOpen') : bound.length === 0 ? t('newWorkspaceSession') : t('openBoundSession')}</button>
                  </div>
                  <section className={css.sessions}>
                    <h4 className={css.sectionTitle}>{t('sessions')}</h4>
                    {bound.length === 0
                      ? <p className={css.muted}>{t('noBoundSessions')}</p>
                      : bound.map(sessionId => (
                        <button key={sessionId} type="button" className={css.sessionChip} onClick={() => { openSession(sessionId) }}>
                          {sessionId}
                        </button>
                      ))}
                    <div className={css.historySearch}>
                      <input
                        className={css.search}
                        value={historyQuery}
                        placeholder={t('historySearch')}
                        onChange={(event) => { setHistoryQuery(event.currentTarget.value) }}
                        onKeyDown={(event) => { if (event.key === 'Enter') { void loadHistory(false) } }}
                      />
                      <button type="button" className={css.button} disabled={busy !== undefined} onClick={() => { void loadHistory(false) }}>
                        {busy === 'history' ? '…' : t('loadHistory')}
                      </button>
                    </div>
                    {historyRows === undefined ? null : historyRows.length === 0
                      ? <p className={css.muted}>{t('noHistory')}</p>
                      : (
                        <>
                          <p className={css.muted}>{historyRows.length} / {historyTotal}</p>
                          {historyRows.map(row => (
                            <button key={row.sessionId} type="button" className={css.sessionChip} onClick={() => { openSession(row.sessionId) }}>
                              {row.live ? '● ' : ''}{row.sessionId}
                            </button>
                          ))}
                          {!historyHasMore ? null : (
                            <button type="button" className={css.button} onClick={() => { void loadHistory(true) }}>{t('loadMore')}</button>
                          )}
                        </>
                      )}
                  </section>
                  {detail === undefined ? null : (
                    <section className={css.result}>
                      <div className={css.detailHead}>
                        <h4 className={css.sectionTitle}>{detail.title}</h4>
                        {detail.kind === 'agents'
                          ? (
                            <button type="button" className={css.button} onClick={() => {
                              const target = detail
                              setBusy('save-agents')
                              void saveAgents(target.workspaceId, draft, target.hash).then((value) => {
                                setAgentsOriginal(draft)
                                setDetail({ ...target, text: draft, hash: value.hash })
                                notify('ok', t('configSaved'))
                                void state().then((next) => { setAudit(next.audit) }).catch(() => { /* audit refresh is best effort */ })
                              }).catch((reason: unknown) => {
                                notify('error', reason instanceof Error ? reason.message : String(reason))
                              }).finally(() => { setBusy(undefined) })
                            }} disabled={busy !== undefined}>{busy === 'save-agents' ? t('saving') : t('saveAgents')}</button>
                          )
                          : null}
                      </div>
                      {detail.kind === 'git'
                        ? <pre className={css.pre}>{detail.text}</pre>
                        : (
                          <>
                            <textarea className={css.editor} value={draft} onChange={(event) => { setDraft(event.currentTarget.value) }} />
                            <pre className={css.pre}>{lineDiff(agentsOriginal, draft)}</pre>
                            <div className={css.audit}>
                              <span>{t('agentsAudit')}</span>
                              {audit.length === 0
                                ? <span className={css.muted}>{t('noAudit')}</span>
                                : audit.slice(0, 3).map(entry => (
                                  <span key={entry.at}>{new Date(entry.at).toLocaleTimeString()} · {entry.path.split('/').slice(-2).join('/')}</span>
                                ))}
                            </div>
                          </>
                        )}
                    </section>
                  )}
                </>
              )}
          </main>
        </div>
      </section>
      {toast === undefined ? null : (
        <div className={toast.kind === 'ok' ? css.toast : `${css.toast} ${css.toastError}`} role="status">
          {toast.text}
          <button type="button" className={css.toastClose} onClick={() => { setToast(undefined) }}>×</button>
        </div>
      )}
      {configOpen
        ? (
          <ConfigEditor
            load={config}
            save={saveConfig}
            t={t}
            onClose={() => { setConfigOpen(false) }}
            onSaved={() => { void load() }}
          />
        )
        : null}
    </div>
  )
}
