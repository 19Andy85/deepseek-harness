/** Dev Console domain registry panel: config, git/cwd checks, and open-domain. */
import { useEffect, useState } from 'react'
import type { ProjectConsoleKey } from './locales.ts'
import css from './DomainView.module.css'

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
  readonly inspection: DomainInspectionView
  readonly sessions: readonly { readonly sessionId: string; readonly cwd: string; readonly live: boolean }[]
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
  /** Read config and inspect every domain. */
  readonly snapshot: () => Promise<DomainSnapshotView>
  /** Open one domain in a cwd session. */
  readonly openDomain: (domainId: string) => Promise<DomainOpenView>
  /** Read git output. */
  readonly git: (domainId: string, action: 'status' | 'log' | 'diff') => Promise<{ readonly text: string }>
  /** Read the domain AGENTS.md. */
  readonly agents: (domainId: string) => Promise<{ readonly path: string; readonly text: string; readonly hash: string }>
  /** Save the domain AGENTS.md with hash protection. */
  readonly saveAgents: (domainId: string, text: string, baseHash: string) => Promise<{ readonly hash: string }>
  /** Open a created Session's conversation. */
  readonly openSession: (sessionId: string) => void
}

/** Props of the domain panel. */
export interface DomainViewProps extends DomainViewInjected {
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onClose: () => void
}

/**
 * Render the configured projects/domains and their live checks.
 * @param props - snapshot/open actions, dictionary, and close handler.
 * @returns the domain panel.
 */
export function DomainView({ snapshot, openDomain, git, agents, saveAgents, openSession, t, onClose }: DomainViewProps) {
  const [data, setData] = useState<DomainSnapshotView | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [opening, setOpening] = useState<string | undefined>(undefined)
  const [opened, setOpened] = useState<DomainOpenView | undefined>(undefined)
  const [detail, setDetail] = useState<{ title: string; text: string; domainId?: string; hash?: string } | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [pendingEphemeral, setPendingEphemeral] = useState<string | undefined>(undefined)
  const load = async (): Promise<void> => {
    setLoading(true)
    try { setData(await snapshot()); setError(undefined) } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const open = (domainId: string): void => {
    const ephemeral = data?.warnings.some(warning => warning.code === 'ephemeral-path') === true
    if (ephemeral && pendingEphemeral !== domainId) { setPendingEphemeral(domainId); return }
    setPendingEphemeral(undefined)
    setOpening(domainId)
    void openDomain(domainId).then(setOpened).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setOpening(undefined) })
  }
  return (
    <div className={css.scrim} role="dialog" aria-label={t('domainsTitle')}>
      <section className={css.panel}>
        <header className={css.head}>
          <div>
            <h2 className={css.title}>{t('domainsTitle')}</h2>
            <p className={css.hint}>{t('domainsHint')}</p>
          </div>
          <div className={css.actions}>
            <button type="button" className={css.button} onClick={() => { void load() }}>{t('refresh')}</button>
            <button type="button" className={css.button} onClick={onClose}>{t('close')}</button>
          </div>
        </header>
        {loading ? <p className={css.muted}>{t('loading')}</p> : null}
        {error === undefined ? null : <p className={css.error}>{error}</p>}
        {data?.problems.map(problem => <p key={`${problem.code}:${problem.path}`} className={css.error}>{problem.path} · {problem.message}</p>)}
        {data?.warnings.map(warning => <p key={`${warning.code}:${warning.path}`} className={css.warning}>{warning.path} · {warning.message}</p>)}
        {opened === undefined ? null : (
          <p className={css.opened}>
            {t('domainOpened')} · {opened.cwd}
            <button type="button" className={css.linkButton} onClick={() => { openSession(opened.sessionId) }}>{t('openSession')}</button>
          </p>
        )}
        <div className={css.list}>
          {data?.domains.length === 0 ? <p className={css.muted}>{t('noDomains')}</p> : null}
          {data?.domains.map(({ projectId, domain, inspection, sessions }) => (
            <article key={`${projectId}:${domain.id}`} className={inspection.problems.length === 0 ? css.card : `${css.card} ${css.bad}`}>
              <div className={css.cardHead}>
                <strong>{domain.name}</strong>
                <span className={css.muted}>{projectId} / {domain.id}</span>
                <span className={inspection.problems.length === 0 ? css.ok : css.fail}>{inspection.problems.length === 0 ? t('domainOk') : t('domainBlocked')}</span>
              </div>
              <div className={css.row}><span>{t('worktree')}</span><code>{inspection.canonicalWorktree ?? domain.worktree}</code></div>
              <div className={css.row}><span>{t('branch')}</span><code>{inspection.branch ?? '—'} / {domain.hooks.expectedBranch}</code></div>
              <div className={css.row}><span>{t('toplevel')}</span><code>{inspection.toplevel ?? '—'}</code></div>
              {inspection.problems.map(problem => <p key={problem} className={css.fail}>{problem}</p>)}
              <div className={css.row}><span>{t('sessions')}</span><code>{sessions.length === 0 ? '—' : sessions.map(session => session.sessionId).join(', ')}</code></div>
              <div className={css.actions}>
                <button type="button" className={css.button} onClick={() => { void git(domain.id, 'status').then((value) => { setDetail({ title: 'git status', text: value.text }) }).catch((reason: unknown) => { setError(String(reason)) }) }}>Git status</button>
                <button type="button" className={css.button} onClick={() => { void git(domain.id, 'log').then((value) => { setDetail({ title: 'git log', text: value.text }) }).catch((reason: unknown) => { setError(String(reason)) }) }}>Git log</button>
                <button
                  type="button"
                  className={css.button}
                  onClick={() => {
                    void agents(domain.id).then((value) => {
                      setDetail({ title: value.path, text: value.text, domainId: domain.id, hash: value.hash })
                      setDraft(value.text)
                    }).catch((reason: unknown) => { setError(String(reason)) })
                  }}
                >AGENTS</button>
                <button
                  type="button"
                  className={css.button}
                  disabled={inspection.problems.length > 0 || opening !== undefined}
                  onClick={() => { open(domain.id) }}
                >
                  {pendingEphemeral === domain.id ? t('confirmEphemeralOpen') : t('openDomain')}
                </button>
                {pendingEphemeral === domain.id ? <span className={css.warning}>{t('ephemeralConfirmHint')}</span> : null}
              </div>
            </article>
          ))}
        </div>
        {detail === undefined ? null : (
          <div className={css.detailBox}>
            <div className={css.detailHead}>{detail.title}
              {detail.domainId === undefined ? null : (
                <button
                  type="button"
                  className={css.button}
                  onClick={() => {
                    const domainId = detail.domainId
                    const hash = detail.hash
                    if (domainId === undefined || hash === undefined) return
                    void saveAgents(domainId, draft, hash).then((value) => {
                      setDetail({ ...detail, text: draft, hash: value.hash })
                    }).catch((reason: unknown) => { setError(String(reason)) })
                  }}
                >{t('saveAgents')}</button>
              )}
            </div>
            {detail.domainId === undefined
              ? <pre className={css.detail}>{detail.text}</pre>
              : <textarea className={css.agentsEditor} value={draft} onChange={(event) => { setDraft(event.currentTarget.value) }} />}
          </div>
        )}
      </section>
    </div>
  )
}
