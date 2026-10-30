/** Workspace console page: the attention inbox, the project state bar, and the session work surface. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { QuestionAnswer } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { ConsoleState, ConsoleWorkspace } from './ProjectConsoleStore.ts'
import { attentionItems, healthCounts, type AttentionDescriptor } from './attention.ts'
import { visibleSessions } from './sessions-view.ts'
import { HealthSegments, StatusDot, Timeline, type HealthFilter } from './visual/visual.tsx'
import type { ProjectConsoleKey } from './locales.ts'
import css from './ProjectConsolePage.module.css'
import visualCss from './visual/visual.module.css'

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
  /** Show one Session's Conversation. */
  readonly openSession: (sessionId: string) => void
  /** Follow one Session inside the console. */
  readonly focusSession: (sessionId: string) => void
  /** Leave the focused Session. */
  readonly closeFocus: () => void
  /** Start a new Session with its first prompt; resolves to whether it was created and accepted. */
  readonly dispatch: (prompt: string) => Promise<boolean>
  /** Send one prompt into an existing Session. */
  readonly sendToSession: (sessionId: string, prompt: string, mode: 'queue' | 'steer') => Promise<boolean>
  /** Cancel one Session's active turn. */
  readonly cancelSession: (sessionId: string) => Promise<boolean>
  /** Answer one Session's pending approval. */
  readonly answerApproval: (sessionId: string, decision: 'allowed-once' | 'rejected') => Promise<boolean>
  /** Submit one complete answer batch to a pending question or plan review. */
  readonly answerQuestion: (sessionId: string, answer: QuestionAnswer) => Promise<boolean>
  /** Live pending-interaction state per Session. */
  readonly hooks: { readonly sessionStatus: HostObservable<SessionStatusSnapshot> }
}

/** Framework props of the workspace console page. */
export type ProjectConsolePageProps = PropsRuntime<'main'> & PropsLocale<'projectConsole'> & InjectFace<ProjectConsoleInjected>

function relativeTime(at: number, t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string): string {
  const minutes = Math.floor((Date.now() - at) / 60_000)
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hoursAgo', { n: hours })
  return t('daysAgo', { n: Math.floor(hours / 24) })
}

function statusText(
  status: string | undefined,
  t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string,
): string {
  if (status === 'running') return t('running')
  if (status === 'idle') return t('idle')
  return t('unknown')
}

function activityText(
  entry: ConsoleState['sessions'][number]['activity'][number],
  t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string,
): string {
  const kind = entry.kind === 'turn' ? t('activityTurn')
    : entry.kind === 'job' ? t('activityJob')
      : entry.kind === 'subagent' ? t('activitySubagent')
        : entry.kind === 'schedule' ? t('activitySchedule')
          : entry.kind
  const items = entry.items?.map(item => item.label ?? item.id).join(', ')
  return items === undefined || items === '' ? kind : `${kind} · ${items}`
}

/**
 * Render the console page.
 * @param props - framework props, the page dictionary, and injected state/actions.
 * @returns the page body.
 */
export function ProjectConsolePage({
  t, store, workspaceOptions, selectedWorkspaceId, selectWorkspace, refresh, openSession, focusSession,
  closeFocus, dispatch, sendToSession, cancelSession, answerApproval, answerQuestion, useSessionStatus,
}: ProjectConsolePageProps) {
  const [now, setNow] = useState(() => Date.now())
  const [prompt, setPrompt] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [filter, setFilter] = useState<HealthFilter>(undefined)
  const statuses = useSessionStatus(state => state)
  const state = useSyncExternalStore(
    listener => store.subscribe(listener),
    () => store.getSnapshot(),
  )
  const selected = selectedWorkspaceId()
  const workspaces = workspaceOptions()
  const rows = visibleSessions(state.sessions)
  const statusFacts = new Map([...statuses].map(([id, status]) => [String(id), status]))
  const pendingOf = (sessionId: string) => statusFacts.get(sessionId)?.pendingInteraction
  const descriptorOf = (sessionId: string): AttentionDescriptor | undefined => {
    const pending = pendingOf(sessionId)
    if (pending === undefined) return undefined
    if (pending.kind === 'approval') {
      return { kind: 'approval', toolName: pending.toolName, answerable: pending.answerable }
    }
    const first = pending.questions[0]
    if (first === undefined) return undefined
    return {
      kind: pending.kind === 'plan-review' ? 'plan-review' : 'question',
      firstQuestion: {
        id: first.id,
        question: first.question,
        ...first.multiSelect === undefined ? {} : { multiSelect: first.multiSelect },
        ...first.options === undefined ? {} : { options: first.options },
      },
    }
  }
  const attention = attentionItems(rows, statusFacts, descriptorOf)
  const health = healthCounts(rows, statusFacts, descriptorOf)
  const attentionIds = new Set(attention.map(item => item.sessionId))
  const pendingItems = attention.filter(item => item.pending !== undefined)
  const completedItems = attention.filter(item => item.pending === undefined)
  const workingRows = rows.filter(row => !attentionIds.has(row.sessionId)).filter((row) => {
    const status = statusFacts.get(row.sessionId)
    if (filter === 'running') return row.status === 'running'
    if (filter === 'needs') return descriptorOf(row.sessionId) !== undefined
    if (filter === 'completed') return status?.completionUnread === true
    if (filter === 'idle') return row.status === 'idle' && status?.completionUnread !== true
    return true
  })
  const hasRows = rows.length > 0
  const focus = state.focus
  useEffect(() => {
    if (focus === undefined) return
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [focus?.sessionId])
  const focusPending = focus === undefined ? 0 : pendingItems.filter(item => item.sessionId === focus.sessionId).length
  const actionBusy = state.busySessionId

  return (
    <section className={css.page}>
      <header className={css.head}>
        <h1 className={css.title}>{t('title')}</h1>
        <p className={css.subtitle}>{t('description')}</p>
        {state.status === 'ready' && hasRows
          ? <HealthSegments counts={health} filter={filter} t={t} onFilter={setFilter} />
          : null}
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
        <form className={css.compose} onSubmit={(event) => {
          event.preventDefault()
          void dispatch(prompt).then((accepted) => { if (accepted) setPrompt('') })
        }}>
          <textarea
            className={css.prompt}
            value={prompt}
            rows={2}
            placeholder={t('newSessionPrompt')}
            onChange={(event) => { setPrompt(event.currentTarget.value) }}
          />
          <button type="submit" className={css.select} disabled={state.dispatch === 'sending' || prompt.trim() === ''}>
            {state.dispatch === 'sending' ? t('newSessionSending') : t('newSessionSend')}
          </button>
        </form>
        {state.dispatchFailed === true
          ? <div className={css.notice} role="alert"><span className={css.noticeText}>{t('newSessionFailed')}</span></div>
          : null}
        {state.actionFailed === true
          ? <div className={css.notice} role="alert"><span className={css.noticeText}>{t('actionFailed')}</span></div>
          : null}
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

        {state.status === 'ready' && hasRows
          ? (
            <section className={css.section} aria-label={t('needsYou')}>
              <h2 className={css.sectionTitle}>
                {t('needsYou')}
                {attention.length === 0 ? null : ` (${String(attention.length)})`}
              </h2>
              {attention.length === 0
                ? <div className={visualCss.emptyAttention}>{t('noPending')}</div>
                : (
                  <>
                    {pendingItems.length === 0 ? null : <h3 className={visualCss.bucketTitle}>{t('waitingGroup')}</h3>}
                    {pendingItems.map(item => (
                      <article key={item.sessionId} className={css.row}>
                        <div className={css.rowHead}>
                          <StatusDot state="attention" />
                          <span className={css.sessionId} title={item.sessionId}>{item.row.title ?? t('untitled')}</span>
                          <span className={css.meta}>{statusText(item.row.status, t)}</span>
                          {item.row.lastPromptAt === undefined
                            ? null
                            : <span className={css.meta}>{relativeTime(item.row.lastPromptAt, t)}</span>}
                        </div>
                        <div className={css.rowActions}>
                          {item.pending?.kind === 'approval'
                            ? (
                              <>
                                <span className={css.chip}>{t('pendingApproval')} · {item.pending.toolName}</span>
                                <button
                                  type="button"
                                  className={css.select}
                                  disabled={actionBusy === item.sessionId || !item.pending.answerable}
                                  onClick={() => { void answerApproval(item.sessionId, 'allowed-once') }}
                                >
                                  {t('allowOnce')}
                                </button>
                                <button
                                  type="button"
                                  className={css.select}
                                  disabled={actionBusy === item.sessionId || !item.pending.answerable}
                                  onClick={() => { void answerApproval(item.sessionId, 'rejected') }}
                                >
                                  {t('rejectApproval')}
                                </button>
                              </>
                            )
                            : item.pending === undefined
                              ? <button type="button" className={css.select} onClick={() => { openSession(item.sessionId) }}>{t('view')}</button>
                              : (() => {
                                const first = item.pending.firstQuestion
                                const options = item.pending.kind === 'plan-review' || first.multiSelect !== true
                                  ? first.options : undefined
                                return (
                                  <>
                                    <span className={css.chip}>
                                      {item.pending.kind === 'plan-review' ? t('planReviewPending') : t('questionPending')}
                                      {' · '}
                                      {first.question}
                                    </span>
                                    {options === undefined || options.length === 0
                                      ? <button type="button" className={css.select} onClick={() => { openSession(item.sessionId) }}>{t('goToConversation')}</button>
                                      : options.map(option => (
                                        <button
                                          key={option.label}
                                          type="button"
                                          className={css.select}
                                          disabled={actionBusy === item.sessionId}
                                          onClick={() => {
                                            void answerQuestion(item.sessionId, {
                                              answers: [{ id: first.id, selected: [option.label] }],
                                            })
                                          }}
                                        >
                                          {option.label}
                                        </button>
                                      ))}
                                  </>
                                )
                              })()}
                        </div>
                      </article>
                    ))}
                    {completedItems.length === 0 ? null : <h3 className={visualCss.bucketTitle}>{t('completedGroup')}</h3>}
                    {completedItems.map(item => (
                      <article key={item.sessionId} className={css.row}>
                        <div className={css.rowHead}>
                          <StatusDot state="success" />
                          <span className={css.sessionId} title={item.sessionId}>{item.row.title ?? t('untitled')}</span>
                          <span className={css.meta}>{statusText(item.row.status, t)}</span>
                          {item.row.lastPromptAt === undefined
                            ? null
                            : <span className={css.meta}>{relativeTime(item.row.lastPromptAt, t)}</span>}
                          <span className={css.chip}>{t('completedUnread')}</span>
                        </div>
                        <div className={css.rowActions}>
                          <button type="button" className={css.select} onClick={() => { openSession(item.sessionId) }}>{t('view')}</button>
                          <button type="button" className={css.select} onClick={() => { focusSession(item.sessionId) }}>{t('focusSession')}</button>
                        </div>
                      </article>
                    ))}
                  </>
                )}
            </section>
          )
          : null}

        {focus === undefined
          ? (
            <>
              {workingRows.length === 0 || (state.status !== 'ready' || !hasRows)
                ? null
                : <h2 className={css.sectionTitle}>{t('working')}</h2>}
              {workingRows.map((session) => {
                const status = statusFacts.get(session.sessionId)
                return (
                  <article key={session.sessionId} className={css.row}>
                    <button
                      type="button"
                      className={css.rowMain}
                      aria-label={t('focusSession')}
                      onClick={() => { focusSession(session.sessionId) }}
                    >
                      <div className={css.rowHead}>
                        <StatusDot state={status?.completionUnread === true ? 'success' : session.status === 'running' ? 'running' : 'idle'} />
                        <span className={css.sessionId} title={session.sessionId}>{session.title ?? t('untitled')}</span>
                        <span className={css.meta}>{statusText(session.status, t)}</span>
                        {session.lastPromptAt === undefined
                          ? null
                          : <span className={css.meta}>{relativeTime(session.lastPromptAt, t)}</span>}
                        {session.cwd === undefined ? null : <span className={css.meta} title={session.cwd}>{session.cwd}</span>}
                        {state.changes?.has(session.sessionId) === true ? <span className={css.chip}>{t('newBadge')}</span> : null}
                      </div>
                      <div className={css.badges}>
                        {session.activity.length === 0
                          ? <span className={css.chip}>{t('noActivity')}</span>
                          : session.activity.map(entry => (
                            <span
                              key={entry.kind}
                              className={session.status === 'running' ? `${css.chip} ${css.chipRunning}` : css.chip}
                            >
                              {activityText(entry, t)}
                            </span>
                          ))}
                      </div>
                    </button>
                    <div className={css.rowActions}>
                      <button
                        type="button"
                        className={css.select}
                        onClick={() => {
                          setReplyingTo(replyingTo === session.sessionId ? null : session.sessionId)
                          setReplyText('')
                        }}
                      >
                        {t('sendPrompt')}
                      </button>
                      {session.status === 'running'
                        ? (
                          <button
                            type="button"
                            className={css.select}
                            disabled={actionBusy === session.sessionId}
                            onClick={() => { void cancelSession(session.sessionId) }}
                          >
                            {t('interrupt')}
                          </button>
                        )
                        : null}
                    </div>
                    {replyingTo === session.sessionId
                      ? (
                        <div className={css.compose}>
                          <textarea
                            className={css.prompt}
                            rows={2}
                            value={replyText}
                            placeholder={t('replyPlaceholder')}
                            onChange={(event) => { setReplyText(event.currentTarget.value) }}
                          />
                          <button
                            type="button"
                            className={css.select}
                            disabled={replyText.trim() === '' || actionBusy === session.sessionId}
                            onClick={() => {
                              void sendToSession(session.sessionId, replyText, 'queue').then((accepted) => {
                                if (!accepted) return
                                setReplyingTo(null)
                                setReplyText('')
                              })
                            }}
                          >
                            {t('sendQueue')}
                          </button>
                          <button type="button" className={css.select} onClick={() => { setReplyingTo(null); setReplyText('') }}>
                            {t('cancel')}
                          </button>
                        </div>
                      )
                      : null}
                  </article>
                )
              })}
            </>
          )
          : (
            <article className={css.row}>
              <div className={css.rowHead}>
                <StatusDot state={focus.row === undefined ? 'unknown' : focus.row.status === 'running' ? 'running' : 'idle'} />
                <span className={css.sessionId} title={focus.sessionId}>
                  {focus.row === undefined ? t('untitled') : focus.row.title ?? t('untitled')}
                </span>
                {focus.row === undefined
                  ? null
                  : <span className={css.meta}>{statusText(focus.row.status, t)}</span>}
                {focus.row === undefined || focus.row.lastPromptAt === undefined
                  ? null
                  : <span className={css.meta}>{relativeTime(focus.row.lastPromptAt, t)}</span>}
                {focus.row === undefined || focus.row.cwd === undefined
                  ? null
                  : <span className={css.meta} title={focus.row.cwd}>{focus.row.cwd}</span>}
                {focusPending === 0
                  ? null
                  : <span className={css.chip}>{t('needsYou')} {focusPending}</span>}
              </div>
              <div className={css.badges}>
                {focus.row === undefined || focus.row.activity.length === 0
                  ? <span className={css.chip}>{t('noActivity')}</span>
                  : focus.row.activity.map(entry => (
                    <span
                      key={entry.kind}
                      className={focus.row?.status === 'running' ? `${css.chip} ${css.chipRunning}` : css.chip}
                    >
                      {activityText(entry, t)}
                    </span>
                  ))}
              </div>
              {focus.row === undefined ? null : (
                <h2 className={css.sectionTitle}>{t('timeline')}</h2>
              )}
              <Timeline
                entries={focus.timeline}
                startedAt={focus.startedAt}
                now={now}
                t={t}
              />
              {focus.phase === 'ended' || focus.phase === 'failed'
                ? (
                  <div className={css.notice} role={focus.phase === 'failed' ? 'alert' : 'status'}>
                    <span className={css.noticeText}>
                      {focus.phase === 'failed' ? t('focusFailed') : t('focusEnded')}
                    </span>
                  </div>
                )
                : null}
              <div className={css.rowActions}>
                <button type="button" className={css.select} onClick={() => { closeFocus() }}>{t('focusBack')}</button>
                <button type="button" className={css.select} onClick={() => { openSession(focus.sessionId) }}>{t('openSession')}</button>
                {focus.row?.status === 'running'
                  ? (
                    <button
                      type="button"
                      className={css.select}
                      disabled={actionBusy === focus.sessionId}
                      onClick={() => { void cancelSession(focus.sessionId) }}
                    >
                      {t('interrupt')}
                    </button>
                  )
                  : null}
                <button
                  type="button"
                  className={css.select}
                  onClick={() => {
                    setReplyingTo(replyingTo === focus.sessionId ? null : focus.sessionId)
                    setReplyText('')
                  }}
                >
                  {t('sendPrompt')}
                </button>
              </div>
              {focus.phase === 'connecting' && focus.row === undefined
                ? <p className={css.meta}>{t('focusConnecting')}</p>
                : null}
              {replyingTo === focus.sessionId
                ? (
                  <div className={css.compose}>
                    <textarea
                      className={css.prompt}
                      rows={2}
                      value={replyText}
                      placeholder={t('replyPlaceholder')}
                      onChange={(event) => { setReplyText(event.currentTarget.value) }}
                    />
                    <button
                      type="button"
                      className={css.select}
                      disabled={replyText.trim() === '' || actionBusy === focus.sessionId}
                      onClick={() => {
                        void sendToSession(focus.sessionId, replyText, 'queue').then((accepted) => {
                          if (!accepted) return
                          setReplyingTo(null)
                          setReplyText('')
                        })
                      }}
                    >
                      {t('sendQueue')}
                    </button>
                    <button type="button" className={css.select} onClick={() => { setReplyingTo(null); setReplyText('') }}>
                      {t('cancel')}
                    </button>
                  </div>
                )
                : null}
            </article>
          )}
      </div>
    </section>
  )
}
