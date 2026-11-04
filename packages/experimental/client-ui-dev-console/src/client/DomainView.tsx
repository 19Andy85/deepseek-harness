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
export function DomainView({ snapshot, openDomain, openSession, t, onClose }: DomainViewProps) {
  const [data, setData] = useState<DomainSnapshotView | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [opening, setOpening] = useState<string | undefined>(undefined)
  const [opened, setOpened] = useState<DomainOpenView | undefined>(undefined)
  const load = async (): Promise<void> => {
    setLoading(true)
    try { setData(await snapshot()); setError(undefined) } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
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
          {data?.domains.map(({ projectId, domain, inspection }) => (
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
              <div className={css.actions}>
                <button
                  type="button"
                  className={css.button}
                  disabled={inspection.problems.length > 0 || opening !== undefined}
                  onClick={() => {
                    setOpening(domain.id)
                    void openDomain(domain.id).then(setOpened).catch((reason: unknown) => {
                      setError(reason instanceof Error ? reason.message : String(reason))
                    }).finally(() => { setOpening(undefined) })
                  }}
                >
                  {t('openDomain')}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
