/** Task detail page: the durable task, its plan versions, and related messages. */
import { useEffect, useState } from 'react'
import type { ProjectConsoleKey } from './locales.ts'
import type { BriefView, MessageView, PlanView } from './MessageCenter.tsx'
import css from './TaskDetailView.module.css'

/** Data access needed by the task detail page. */
export interface TaskDetailInjected {
  readonly briefs: () => Promise<readonly BriefView[]>
  readonly plans: (briefId?: string) => Promise<readonly PlanView[]>
  readonly messages: (role: 'maintainer', box: 'inbox') => Promise<readonly MessageView[]>
  readonly approvePlan: (planId: string) => Promise<PlanView>
}

/** Props of the task detail page. */
export interface TaskDetailViewProps extends TaskDetailInjected {
  readonly t: (key: ProjectConsoleKey) => string
  readonly onOpenSession?: (() => void) | undefined
}

/**
 * Render the first task detail page over the durable task, plan, and message data.
 * @param props - data access, dictionary, and optional session shortcut.
 * @returns the task detail page.
 */
export function TaskDetailView(props: TaskDetailViewProps) {
  const { briefs, plans, messages, approvePlan, t } = props
  const [briefRows, setBriefRows] = useState<readonly BriefView[]>([])
  const [planRows, setPlanRows] = useState<readonly PlanView[]>([])
  const [messageRows, setMessageRows] = useState<readonly MessageView[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [tab, setTab] = useState<'task' | 'plan' | 'messages'>('task')
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    void briefs().then((rows) => {
      setBriefRows(rows)
      setSelectedId(previous => previous ?? rows[0]?.id)
    }).catch(() => { setError(t('actionFailed')) })
    void plans().then(setPlanRows).catch(() => { setError(t('actionFailed')) })
    void messages('maintainer', 'inbox').then(setMessageRows).catch(() => { setError(t('actionFailed')) })
  }, [briefs, plans, messages, t])

  const selected = briefRows.find(brief => brief.id === selectedId)
  const selectedPlans = planRows.filter(plan => plan.briefId === selectedId)
    .sort((left, right) => right.version - left.version)
  const current = selectedPlans[0]
  const relatedMessages = messageRows.filter(message => message.subject.includes(selected?.title ?? ''))

  return (
    <div className={css.page}>
      <aside className={css.master}>
        <div className={css.masterHead}>
          <h2>{t('todoTab')}</h2>
          <span className={css.count}>{briefRows.length}</span>
        </div>
        {briefRows.map(brief => (
          <button
            key={brief.id}
            type="button"
            className={brief.id === selectedId ? `${css.treeItem} ${css.treeSelected}` : css.treeItem}
            onClick={() => { setSelectedId(brief.id); setTab('task') }}
          >
            <span className={css.treeTitle}>{brief.title}</span>
            <span className={css.treeMeta}>{brief.status}</span>
          </button>
        ))}
        {briefRows.length === 0 ? <p className={css.empty}>{t('noPending')}</p> : null}
      </aside>

      <section className={css.detail}>
        {selected === undefined
          ? <p className={css.empty}>{t('noPending')}</p>
          : (
            <>
              <header className={css.detailHead}>
                <div>
                  <h1>{selected.title}</h1>
                  <p className={css.meta}>{selected.workspaceId} · {selected.status}</p>
                </div>
                {props.onOpenSession === undefined ? null : <button type="button" className={css.button} onClick={props.onOpenSession}>{t('openSession')}</button>}
              </header>
              <div className={css.tabs}>
                <button type="button" className={tab === 'task' ? css.tabActive : css.tab} onClick={() => { setTab('task') }}>{t('todoTab')}</button>
                <button type="button" className={tab === 'plan' ? css.tabActive : css.tab} onClick={() => { setTab('plan') }}>{t('plansTitle')}</button>
                <button type="button" className={tab === 'messages' ? css.tabActive : css.tab} onClick={() => { setTab('messages') }}>{t('messagesTitle')}</button>
              </div>
              {tab === 'task'
                ? (
                  <div className={css.section}>
                    <h3>{t('briefGoal')}</h3>
                    <p>{selected.goal}</p>
                    <h3>{t('briefAcceptance')}</h3>
                    <p>{selected.acceptance}</p>
                  </div>
                )
                : null}
              {tab === 'plan'
                ? (
                  <div className={css.section}>
                    {current === undefined ? <p className={css.empty}>{t('noPlan')}</p> : (
                      <>
                        <div className={css.planHead}>
                          <h3>{t('plansTitle')} v{current.version}</h3>
                          <span className={css.meta}>{current.status}</span>
                          {current.status === 'draft' ? (
                            <button type="button" className={css.button} onClick={() => {
                              void approvePlan(current.id).then((updated) => {
                                setPlanRows(rows => rows.map(plan => plan.id === updated.id ? updated : plan))
                              }).catch(() => { setError(t('actionFailed')) })
                            }}>{t('approvePlan')}</button>
                          ) : null}
                        </div>
                        <ol className={css.steps}>
                          {current.steps.map(step => (
                            <li key={step.id} className={step.status === 'done' ? css.stepDone : css.step}>
                              <span className={css.stepTitle}>{step.title}</span>
                              <span className={css.meta}>{step.outcome}</span>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>
                )
                : null}
              {tab === 'messages'
                ? (
                  <div className={css.section}>
                    {relatedMessages.length === 0 ? <p className={css.empty}>{t('noMessages')}</p> : relatedMessages.map(message => (
                      <article key={message.id} className={css.message}>
                        <strong>{message.subject}</strong>
                        <p>{message.body}</p>
                        <span className={css.meta}>{message.kind} · {message.status}</span>
                      </article>
                    ))}
                  </div>
                )
                : null}
              {error === undefined ? null : <p className={css.error}>{error}</p>}
            </>
          )}
      </section>
    </div>
  )
}
