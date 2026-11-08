/** Task detail page: the durable task, its plan versions, and related messages. */
import { useEffect, useState } from 'react'
import type { ProjectConsoleKey } from './locales.ts'
import type { BriefView, MessageView, MessageCenterInjected, PlanView } from './message-types.ts'
import type { ActionItem } from './action-items.ts'
import { WorkflowGuide } from './WorkflowGuide.tsx'
import css from './TaskDetailView.module.css'

/** Data access needed by the task detail page. */

const BRIEF_STATUS_KEYS: Record<BriefView['status'], ProjectConsoleKey> = {
  draft: 'briefDraft', ready: 'briefReady', assigned: 'briefAssigned', in_review: 'briefInReview',
  accepted: 'briefAccepted', changes_requested: 'briefChangesRequested', closed: 'briefClosed',
}
const PLAN_STATUS_KEYS: Record<PlanView['status'], ProjectConsoleKey> = {
  draft: 'planDraft', approved: 'planApproved', superseded: 'planSuperseded', completed: 'planCompleted',
}
const MESSAGE_STATUS_KEYS: Record<string, ProjectConsoleKey> = {
  unread: 'messageUnread', acknowledged: 'messageAcknowledged', resolved: 'messageResolved', stale: 'messageStale',
}
const MESSAGE_KIND_KEYS: Record<MessageView['kind'], ProjectConsoleKey> = {
  note: 'kindNote', request: 'kindRequest', decision: 'kindDecision', handoff: 'kindHandoff', report: 'kindReport',
}

export interface TaskDetailInjected {
  readonly briefs: () => Promise<readonly BriefView[]>
  readonly plans: (briefId?: string) => Promise<readonly PlanView[]>
  readonly messages: (role: 'maintainer', box: 'inbox') => Promise<readonly MessageView[]>
  readonly approvePlan: (planId: string) => Promise<PlanView>
  readonly sendMessage: MessageCenterInjected['sendMessage']
  readonly messageAction: MessageCenterInjected['messageAction']
  readonly transitionBrief: MessageCenterInjected['transitionBrief']
}

/** Props of the task detail page. */
export interface TaskDetailViewProps extends TaskDetailInjected {
  readonly t: (key: ProjectConsoleKey) => string
  readonly onOpenSession?: ((sessionId: string) => void) | undefined
  readonly actionItems?: readonly ActionItem[] | undefined
  readonly onOpenAction?: ((item: ActionItem) => void) | undefined
  readonly sessionTitle?: ((sessionId: string) => string | undefined) | undefined
  readonly compact?: boolean | undefined
  readonly sessionId?: string | undefined
  readonly sessionRunning?: boolean | undefined
  readonly refreshKey?: number | undefined
  readonly onPropose?: (() => Promise<boolean>) | undefined
  readonly sessionLive?: boolean | undefined
}

/**
 * Render the first task detail page over the durable task, plan, and message data.
 * @param props - data access, dictionary, and optional session shortcut.
 * @returns the task detail page.
 */
export function TaskDetailView(props: TaskDetailViewProps) {
  const {
    briefs, plans, messages, approvePlan, sendMessage, messageAction, transitionBrief,
    actionItems = [], onOpenAction, compact = false, sessionId, sessionRunning = false, sessionTitle,
    sessionLive = true, refreshKey, onPropose, t,
  } = props
  const [briefRows, setBriefRows] = useState<readonly BriefView[]>([])
  const [planRows, setPlanRows] = useState<readonly PlanView[]>([])
  const [messageRows, setMessageRows] = useState<readonly MessageView[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [tab, setTab] = useState<'task' | 'plan' | 'messages'>('task')
  const [error, setError] = useState<string | undefined>(undefined)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [versionId, setVersionId] = useState<string | undefined>(undefined)
  const [proposing, setProposing] = useState(false)

  useEffect(() => {
    void briefs().then((rows) => {
      setBriefRows(rows)
      const first = sessionId === undefined
        ? rows[0]?.id
        : rows.find(brief => brief.sourceSessionRef?.sessionId === sessionId)?.id
      setSelectedId(previous => previous ?? first)
    }).catch(() => { setError(t('actionFailed')) })
    void plans().then(setPlanRows).catch(() => { setError(t('actionFailed')) })
    void messages('maintainer', 'inbox').then(setMessageRows).catch(() => { setError(t('actionFailed')) })
  }, [briefs, plans, messages, refreshKey, sessionId, t])

  const visibleBriefs = sessionId === undefined ? briefRows : briefRows.filter(brief => brief.sourceSessionRef?.sessionId === sessionId)
  const visibleActions = sessionId === undefined ? actionItems : actionItems.filter(item => item.sessionId === sessionId)
  const selected = visibleBriefs.find(brief => brief.id === selectedId)
  const selectedPlans = planRows.filter(plan => plan.briefId === selectedId)
    .sort((left, right) => right.version - left.version)
  const current = selectedPlans.find(plan => plan.id === versionId) ?? selectedPlans[0]
  const previous = current === undefined ? undefined : selectedPlans.find(plan => plan.version < current.version)
  const relatedMessages = messageRows.filter(message => (message.briefId !== undefined && message.briefId === selected?.id) || message.subject.includes(selected?.title ?? ''))
  const handoffs = relatedMessages.filter(message => message.kind === 'handoff')
  const changed = current === undefined || previous === undefined
    ? undefined
    : {
      added: current.steps.filter(step => !previous.steps.some(old => old.title === step.title)).map(step => step.title),
      removed: previous.steps.filter(old => !current.steps.some(step => step.title === old.title)).map(old => old.title),
      modified: current.steps.filter(step => previous.steps.some(old => (
        old.title === step.title && old.outcome !== step.outcome
      ))).map(step => step.title),
    }

  const transition = (to: BriefView['status']): void => {
    if (selected === undefined) return
    void transitionBrief(selected.id, to).then((updated) => {
      setBriefRows(rows => rows.map(brief => brief.id === updated.id ? updated : brief))
    }).catch(() => { setError(t('actionFailed')) })
  }

  if (visibleBriefs.length === 0 && visibleActions.length === 0) {
    return (
      <div className={compact ? `${css.page} ${css.pageCompact} ${css.emptyOnly}` : `${css.page} ${css.emptyOnly}`}>
        <div className={css.emptyPage}>
          <div className={css.emptyArt} aria-hidden="true">
            <span className={css.emptySheet} />
            <span className={css.emptyLine} />
            <span className={css.emptyLineShort} />
            <span className={css.emptyCheck}>✓</span>
          </div>
          <h2>{sessionId === undefined ? t('emptyTasksTitle') : t('sessionTaskEmptyTitle')}</h2>
          <p>{sessionId === undefined ? t('emptyTasksHint') : sessionRunning ? t('sessionTaskEmptyRunningHint') : t('sessionTaskEmptyHint')}</p>
          <WorkflowGuide t={t} compact={compact} />
          {onPropose === undefined || !sessionLive ? <p className={css.meta}>{t('sessionStoppedHint')}</p> : (
            <button type="button" className={css.button} disabled={proposing} onClick={() => {
              setProposing(true)
              void onPropose().then((ok) => { if (!ok) setError(t('proposeTaskFailed')) }).finally(() => { setProposing(false) })
            }}>{proposing ? t('proposeTaskSending') : t('proposeTask')}</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={compact ? `${css.page} ${css.pageCompact}` : css.page}>
      <aside className={css.master}>
        <div className={css.masterHead}>
          <h2>{t('todoTab')}</h2>
          <span className={css.count}>{briefRows.length}</span>
        </div>
        {visibleActions.length === 0 ? null : (
          <div className={css.actionGroup}>
            <div className={css.masterHead}><h3>{t('globalInbox')}</h3><span className={css.count}>{actionItems.length}</span></div>
            {visibleActions.slice(0, 5).map(item => (
              <button key={item.id} type="button" className={css.treeItem} onClick={() => { onOpenAction?.(item) }}>
                <span className={css.treeTitle}>{item.title}</span>
                <span className={css.treeMeta}>{item.detail}</span>
              </button>
            ))}
          </div>
        )}
        {visibleBriefs.map(brief => (
          <button
            key={brief.id}
            type="button"
            className={brief.id === selectedId ? `${css.treeItem} ${css.treeSelected}` : css.treeItem}
            onClick={() => { setSelectedId(brief.id); setTab('task') }}
          >
            <span className={css.treeTitle}>{brief.title}</span>
            <span className={css.treeMeta}>{t(BRIEF_STATUS_KEYS[brief.status])}</span>
          </button>
        ))}
      </aside>

      <section className={css.detail}>
        {compact && visibleBriefs.length > 1
          ? (
            <select className={css.taskSelect} value={selectedId ?? ''} aria-label={t('todoTab')} onChange={(event) => { setSelectedId(event.currentTarget.value); setTab('task') }}>
              {visibleBriefs.map(brief => (
                <option key={brief.id} value={brief.id}>{brief.title} · {t(BRIEF_STATUS_KEYS[brief.status])}</option>
              ))}
            </select>
          )
          : null}
        {selected === undefined
          ? (
            <div className={css.emptyPage}>
              <div className={css.emptyArt} aria-hidden="true">
                <span className={css.emptySheet} />
                <span className={css.emptyLine} />
                <span className={css.emptyLineShort} />
                <span className={css.emptyCheck}>✓</span>
              </div>
              <h2>{t('emptyTasksTitle')}</h2>
              <p>{t('emptyTasksHint')}</p>
            </div>
          )
          : (
            <>
              <header className={css.detailHead}>
                <div>
                  <h1>{selected.title}</h1>
                  <p className={css.meta}>{selected.workspaceId} · {t(BRIEF_STATUS_KEYS[selected.status])}</p>
                </div>
                <div className={css.headActions}>
                  {selected.sourceSessionRef === undefined ? null : (
                    <span className={css.meta}>
                      {sessionTitle?.(selected.sourceSessionRef.sessionId) ?? selected.sourceSessionRef.sessionId}
                    </span>
                  )}
                  {props.onOpenSession === undefined || selected.sourceSessionRef === undefined ? null : (
                    <button type="button" className={css.button} onClick={() => { props.onOpenSession?.(selected.sourceSessionRef?.sessionId ?? '') }}>{t('openSession')}</button>
                  )}
                </div>
              </header>
              <div className={css.statusActions}>
                {selected.status === 'draft' ? <button type="button" className={css.button} onClick={() => { transition('ready') }}>{t('briefReady')}</button> : null}
                {selected.status === 'ready' ? <button type="button" className={css.button} onClick={() => { transition('assigned') }}>{t('briefAssigned')}</button> : null}
                {selected.status === 'assigned' ? <button type="button" className={css.button} onClick={() => { transition('in_review') }}>{t('briefInReview')}</button> : null}
                {selected.status === 'in_review' ? (
                  <>
                    <button type="button" className={css.button} onClick={() => { transition('accepted') }}>{t('briefAccepted')}</button>
                    <button type="button" className={css.button} onClick={() => { transition('changes_requested') }}>{t('briefChangesRequested')}</button>
                  </>
                ) : null}
                {selected.status === 'changes_requested' ? <button type="button" className={css.button} onClick={() => { transition('assigned') }}>{t('briefAssigned')}</button> : null}
                {selected.status !== 'closed' ? <button type="button" className={css.button} onClick={() => { transition('closed') }}>{t('briefClosed')}</button> : null}
              </div>
              <div className={css.tabs}>
                <button type="button" className={tab === 'task' ? css.tabActive : css.tab} onClick={() => { setTab('task') }}>{t('todoTab')}</button>
                <button type="button" className={tab === 'plan' ? css.tabActive : css.tab} onClick={() => { setTab('plan') }}>{t('plansTitle')}</button>
                <button type="button" className={tab === 'messages' ? css.tabActive : css.tab} onClick={() => { setTab('messages') }}>{t('messageTab')}</button>
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
                          <span className={css.meta}>{t(PLAN_STATUS_KEYS[current.status])}</span>
                          {current.status === 'draft' ? (
                            <button type="button" className={css.button} onClick={() => {
                              void approvePlan(current.id).then((updated) => {
                                setPlanRows(rows => rows.map(plan => plan.id === updated.id ? updated : plan))
                              }).catch(() => { setError(t('actionFailed')) })
                            }}>{t('approvePlan')}</button>
                          ) : null}
                        </div>
                        {selectedPlans.length > 1 ? (
                          <div className={css.history}>
                            {selectedPlans.map(plan => (
                              <button key={plan.id} type="button" className={plan.id === current.id ? css.historyActive : css.historyItem} onClick={() => { setVersionId(plan.id) }}>
                                v{plan.version} · {t(PLAN_STATUS_KEYS[plan.status])}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {changed === undefined ? null : (
                          <p className={css.diff}>
                            {changed.added.length === 0 && changed.removed.length === 0 && changed.modified.length === 0
                              ? t('noPlan')
                              : [...changed.added.map(title => `+ ${title}`), ...changed.removed.map(title => `- ${title}`), ...changed.modified.map(title => `~ ${title}`)].join('  ')}
                          </p>
                        )}
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
                    <form className={css.compose} onSubmit={(event) => {
                      event.preventDefault()
                      if (subject.trim() === '' || body.trim() === '') return
                      void sendMessage({ fromRole: 'maintainer', toRole: 'implementer', kind: 'request', subject, body, briefId: selected?.id })
                        .then((message) => { setMessageRows(rows => [message, ...rows]); setSubject(''); setBody('') })
                        .catch(() => { setError(t('actionFailed')) })
                    }}>
                      <input value={subject} onChange={(event) => { setSubject(event.currentTarget.value) }} placeholder={t('messageSubject')} />
                      <textarea value={body} onChange={(event) => { setBody(event.currentTarget.value) }} placeholder={t('messageBody')} />
                      <button type="submit" className={css.button}>{t('sendMessage')}</button>
                    </form>
                    {handoffs.length === 0 ? null : (
                      <div className={css.handoff}>
                        <h3>{t('handoff')}</h3>
                        {handoffs.map(message => (
                          <article key={message.id} className={css.message}>
                            <strong>{message.subject}</strong>
                            <p>{message.body}</p>
                            <div className={css.handoffActions}>
                              <button type="button" className={css.button} onClick={() => {
                                void messageAction(message.id, 'resolve', 'maintainer').then((updated) => {
                                  setMessageRows(rows => rows.map(row => row.id === updated.id ? updated : row))
                                }).catch(() => { setError(t('actionFailed')) })
                              }}>{t('acceptHandoff')}</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                    {relatedMessages.length === 0 ? <p className={css.empty}>{t('noMessages')}</p> : relatedMessages.map(message => (
                      <article key={message.id} className={css.message}>
                        <strong>{message.subject}</strong>
                        <p>{message.body}</p>
                        <span className={css.meta}>{t(MESSAGE_KIND_KEYS[message.kind])} · {t(MESSAGE_STATUS_KEYS[message.status] ?? 'messageUnread')}</span>
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
