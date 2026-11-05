/** Dev Console domain panel: registry on the left, selected domain detail on the right. */
import { useEffect, useState } from 'react'
import { ConfigEditor } from './ConfigEditor.tsx'
import type { ProjectConsoleKey } from './locales.ts'
import css from './DomainView.module.css'

const BINDINGS_KEY = 'dsh.dev-console.domain-sessions.v1'
const AUDIT_KEY = 'dsh.dev-console.agents-audit.v1'

function readBindings(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(BINDINGS_KEY) ?? '{}') as Record<string, string[]> } catch { return {} }
}

function writeBinding(domainId: string, sessionId: string): void {
  const all = readBindings()
  all[domainId] = [...new Set([sessionId, ...(all[domainId] ?? [])])].slice(0, 20)
  localStorage.setItem(BINDINGS_KEY, JSON.stringify(all))
}

interface AgentsAudit { readonly at: number; readonly path: string; readonly baseHash: string; readonly newHash: string }

function readAudit(): readonly AgentsAudit[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]') as AgentsAudit[] } catch { return [] }
}

function appendAudit(entry: AgentsAudit): void {
  localStorage.setItem(AUDIT_KEY, JSON.stringify([entry, ...readAudit()].slice(0, 20)))
}

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

/** One configured domain as the panel renders it. */
export interface DomainConfigView {
  readonly id: string
  readonly name: string
  readonly worktree: string
  readonly branch: string
  readonly hooks: { readonly expectedBranch: string; readonly expectedToplevel: string }
}

/** Live inspection of one domain. */
export interface DomainInspectionView {
  readonly canonicalWorktree?: string
  readonly toplevel?: string
  readonly branch?: string
  readonly clean: boolean
  readonly problems: readonly string[]
}

/** One domain row. */
export interface DomainStatusView {
  readonly projectId: string
  readonly domain: DomainConfigView
  readonly inspection?: DomainInspectionView
  readonly sessions?: readonly { readonly sessionId: string; readonly cwd: string; readonly live: boolean }[]
}

/** Snapshot of the domain registry. */
export interface DomainSnapshotView {
  readonly problems: readonly { readonly code: string; readonly path: string; readonly message: string }[]
  readonly warnings: readonly { readonly code: string; readonly path: string; readonly message: string }[]
  readonly domains: readonly DomainStatusView[]
}

/** Result of opening a domain. */
export interface DomainOpenView {
  readonly sessionId: string
  readonly cwd: string
}

/** Injected Dev Console domain actions. */
export interface DomainViewInjected {
  readonly snapshot: () => Promise<DomainSnapshotView>
  readonly inspect: (domainIds?: readonly string[], refresh?: boolean) => Promise<readonly DomainStatusView[]>
  readonly openDomain: (domainId: string) => Promise<DomainOpenView>
  readonly git: (domainId: string, action: 'status' | 'log' | 'diff') => Promise<{ readonly text: string }>
  readonly agents: (domainId: string) => Promise<{ readonly path: string; readonly text: string; readonly hash: string }>
  readonly saveAgents: (domainId: string, text: string, baseHash: string) => Promise<{ readonly hash: string }>
  readonly autoConfig: (overwrite: boolean) => Promise<{ readonly path: string; readonly projects: number }>
  readonly config: () => Promise<{ readonly path: string; readonly yaml: string }>
  readonly saveConfig: (yaml: string) => Promise<{ readonly path: string; readonly warnings: readonly { readonly message: string }[] }>
  readonly openSession: (sessionId: string) => void
}

/** Props of the domain panel. */
export interface DomainViewProps extends DomainViewInjected {
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onClose: () => void
}

type Detail =
  | { readonly kind: 'git'; readonly title: string; readonly text: string }
  | { readonly kind: 'agents'; readonly title: string; readonly text: string; readonly domainId: string; readonly hash: string }
  | undefined

/**
 * Render the domain registry and the selected domain's detail.
 * @param props - Remote actions, dictionary, and close handler.
 * @returns the domain panel.
 */
export function DomainView({
  snapshot, inspect, openDomain, git, agents, saveAgents, autoConfig, config, saveConfig, openSession, t, onClose,
}: DomainViewProps) {
  const [data, setData] = useState<DomainSnapshotView | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [detail, setDetail] = useState<Detail>(undefined)
  const [draft, setDraft] = useState('')
  const [agentsOriginal, setAgentsOriginal] = useState('')
  const [audit, setAudit] = useState<readonly AgentsAudit[]>(() => readAudit())
  const [bindings, setBindings] = useState<Record<string, string[]>>(() => readBindings())
  const [opening, setOpening] = useState<string | undefined>(undefined)
  const [pendingEphemeral, setPendingEphemeral] = useState<string | undefined>(undefined)
  const [configOpen, setConfigOpen] = useState(false)
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
        domains: current.domains.map(row => rows.find(next => next.domain.id === row.domain.id) ?? row),
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
      setSelected(current => current !== undefined && next.domains.some(row => row.domain.id === current)
        ? current
        : next.domains[0]?.domain.id)
      void inspectAll(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const open = (domainId: string): void => {
    const ephemeral = data?.warnings.some(warning => warning.code === 'ephemeral-path') === true
    if (ephemeral && pendingEphemeral !== domainId) { setPendingEphemeral(domainId); return }
    setPendingEphemeral(undefined)
    setOpening(domainId)
    void openDomain(domainId).then((value) => {
      writeBinding(domainId, value.sessionId)
      setBindings(readBindings())
      notify('ok', `${t('domainOpened')} · ${value.sessionId}`)
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setOpening(undefined) })
  }
  const runGit = (domainId: string, action: 'status' | 'log' | 'diff'): void => {
    setBusy(`git-${action}`)
    void git(domainId, action).then((value) => {
      setDetail({ kind: 'git', title: `git ${action}`, text: value.text })
      notify('ok', t('loaded'))
    }).catch((reason: unknown) => {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(undefined) })
  }
  const openAgents = (domainId: string): void => {
    setBusy('agents')
    void agents(domainId).then((value) => {
      setDetail({ kind: 'agents', title: value.path, text: value.text, domainId, hash: value.hash })
      setDraft(value.text)
      setAgentsOriginal(value.text)
      notify('ok', t('loaded'))
    }).catch((reason: unknown) => {
      notify('error', reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(undefined) })
  }
  const projects = new Map<string, DomainStatusView[]>()
  for (const row of data?.domains ?? []) projects.set(row.projectId, [...(projects.get(row.projectId) ?? []), row])
  const current = data?.domains.find(row => row.domain.id === selected)
  const bound = selected === undefined ? [] : bindings[selected] ?? []
  return (
    <div className={css.scrim} role="dialog" aria-label={t('domainsTitle')}>
      <section className={css.panel}>
        <header className={css.head}>
          <div>
            <h2 className={css.title}>{t('domainsTitle')}</h2>
            <p className={css.hint}>{t('domainsHint')}</p>
          </div>
          <div className={css.actions}>
            {data === undefined ? null : (
              <button type="button" className={css.button} onClick={() => {
                const overwrite = data.domains.length > 0
                if (overwrite && !window.confirm(t('regenerateConfirm'))) return
                void autoConfig(overwrite).then(() => { void load() }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : String(reason))
                })
              }}>{data.domains.length === 0 ? t('autoConfig') : t('regenerateConfig')}</button>
            )}
            <button type="button" className={css.button} onClick={() => { setConfigOpen(true) }}>{t('editConfig')}</button>
            <button type="button" className={css.button} disabled={inspecting} onClick={() => { void inspectAll(true) }}>{inspecting ? t('inspecting') : t('refresh')}</button>
            <button type="button" className={css.button} onClick={onClose}>{t('close')}</button>
          </div>
        </header>
        {error === undefined ? null : <p className={css.error}>{error}</p>}
        <div className={css.body}>
          <aside className={css.list} aria-label={t('domainsTitle')}>
            {loading ? <p className={css.muted}>{t('loading')}</p> : null}
            {[...projects.entries()].map(([projectId, rows]) => (
              <section key={projectId} className={css.project}>
                <h3 className={css.projectName}>{projectId}</h3>
                {rows.map(row => (
                  <button
                    key={row.domain.id}
                    type="button"
                    className={selected === row.domain.id ? `${css.domainRow} ${css.domainRowActive}` : css.domainRow}
                    onClick={() => { setSelected(row.domain.id); setDetail(undefined) }}
                  >
                    <span className={css.domainName}>{row.domain.name}</span>
                    {row.inspection === undefined
                      ? <span className={css.muted}>{t('loading')}</span>
                      : (
                        <span className={row.inspection.problems.length === 0 ? css.ok : css.fail}>
                          {row.inspection.problems.length === 0 ? t('domainOk') : t('domainBlocked')}
                        </span>
                      )}
                  </button>
                ))}
              </section>
            ))}
            {!loading && data?.domains.length === 0
              ? <p className={css.muted}>{t('noDomains')}</p>
              : null}
          </aside>
          <main className={css.detail}>
            {current === undefined
              ? <p className={css.muted}>{t('noDomains')}</p>
              : (
                <>
                  <div className={css.detailHead}>
                    <div>
                      <h3 className={css.detailTitle}>{current.domain.name}</h3>
                      <p className={css.hint}>{current.projectId} / {current.domain.id}</p>
                    </div>
                    {current.inspection === undefined
                      ? <span className={css.muted}>{t('loading')}</span>
                      : (
                        <span className={current.inspection.problems.length === 0 ? css.ok : css.fail}>
                          {current.inspection.problems.length === 0 ? t('domainOk') : t('domainBlocked')}
                        </span>
                      )}
                  </div>
                  <dl className={css.facts}>
                    <div><dt>{t('worktree')}</dt><dd>{current.inspection?.canonicalWorktree ?? current.domain.worktree}</dd></div>
                    <div><dt>{t('branch')}</dt><dd>{current.inspection === undefined ? '…' : `${current.inspection.branch ?? '—'} / ${current.domain.hooks.expectedBranch}`}</dd></div>
                    <div><dt>{t('toplevel')}</dt><dd>{current.inspection === undefined ? '…' : current.inspection.toplevel ?? '—'}</dd></div>
                  </dl>
                  {current.inspection === undefined
                    ? <p className={css.muted}>{t('inspecting')}</p>
                    : current.inspection.problems.map(problem => <p key={problem} className={css.fail}>{problem}</p>)}
                  <div className={css.actions}>
                    <button type="button" className={css.button} onClick={() => { runGit(current.domain.id, 'status') }} disabled={busy !== undefined}>{busy === 'git-status' ? '…' : 'Git status'}</button>
                    <button type="button" className={css.button} onClick={() => { runGit(current.domain.id, 'log') }} disabled={busy !== undefined}>{busy === 'git-log' ? '…' : 'Git log'}</button>
                    <button type="button" className={css.button} onClick={() => { runGit(current.domain.id, 'diff') }} disabled={busy !== undefined}>{busy === 'git-diff' ? '…' : 'Git diff'}</button>
                    <button type="button" className={css.button} onClick={() => { openAgents(current.domain.id) }} disabled={busy !== undefined}>{busy === 'agents' ? '…' : 'AGENTS'}</button>
                    <button
                      type="button"
                      className={css.button}
                      disabled={current.inspection === undefined || current.inspection.problems.length > 0 || opening !== undefined}
                      onClick={() => {
                        const sessionId = bound[0]
                        if (sessionId === undefined) { open(current.domain.id); return }
                        openSession(sessionId)
                      }}
                    >{opening === current.domain.id ? t('opening') : pendingEphemeral === current.domain.id ? t('confirmEphemeralOpen') : bound.length === 0 ? t('openDomain') : t('openBoundSession')}</button>
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
                              void saveAgents(target.domainId, draft, target.hash).then((value) => {
                                appendAudit({ at: Date.now(), path: target.title, baseHash: target.hash, newHash: value.hash })
                                setAudit(readAudit())
                                setAgentsOriginal(draft)
                                setDetail({ ...target, text: draft, hash: value.hash })
                                notify('ok', t('configSaved'))
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
