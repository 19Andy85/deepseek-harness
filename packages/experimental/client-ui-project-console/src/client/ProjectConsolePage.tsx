/** Workspace console page: live sessions and their running activity families. */
import { useState, useSyncExternalStore } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { QuestionAnswer } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { ConsoleState, ConsoleWorkspace } from './ProjectConsoleStore.ts'
import { runningCount, visibleSessions } from './sessions-view.ts'
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

function activityLabel(entry: ConsoleState['sessions'][number]['activity'][number]): string {
  const items = entry.items?.map(item => item.label ?? item.id).join(', ')
  return items === undefined || items === '' ? entry.kind : `${entry.kind} · ${items}`
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
  const [prompt, setPrompt] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const statuses = useSessionStatus(state => state)
  const state = useSyncExternalStore(
    listener => store.subscribe(listener),
    () => store.getSnapshot(),
  )
  const selected = selectedWorkspaceId()
  const workspaces = workspaceOptions()
  const rows = visibleSessions(state.sessions)
  const hasRows = rows.length > 0
  const running = runningCount(rows)

  return (
    <section className={css.page}>
      <header className={css.head}>
        <h1 className={css.title}>{t('title')}</h1>
        <p className={css.subtitle}>{t('description')}</p>
        {state.status === 'ready' && hasRows
          ? <p className={css.meta}>{t('summary', { total: rows.length, running })}</p>
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
        {state.focus === undefined
          ? null
          : (
            <article className={css.row}>
              <div className={css.rowHead}>
                <span className={css.sessionId} title={state.focus.sessionId}>
                  {state.focus.row === undefined ? t('untitled') : state.focus.row.title ?? t('untitled')}
                </span>
                {state.focus.row === undefined
                  ? null
                  : <span className={css.meta}>{state.focus.row.status === 'running' ? t('running') : t('idle')}</span>}
                {state.focus.row === undefined || state.focus.row.lastPromptAt === undefined
                  ? null
                  : <span className={css.meta}>{relativeTime(state.focus.row.lastPromptAt, t)}</span>}
                {state.focus.row === undefined || state.focus.row.cwd === undefined
                  ? null
                  : <span className={css.meta} title={state.focus.row.cwd}>{state.focus.row.cwd}</span>}
              </div>
              <div className={css.badges}>
                {state.focus.row === undefined || state.focus.row.activity.length === 0
                  ? <span className={css.chip}>{t('noActivity')}</span>
                  : state.focus.row.activity.map(entry => (
                    <span
                      key={entry.kind}
                      className={state.focus?.row?.status === 'running' ? `${css.chip} ${css.chipRunning}` : css.chip}
                    >
                      {activityLabel(entry)}
                    </span>
                  ))}
              </div>
              {state.focus.phase === 'ended' || state.focus.phase === 'failed'
                ? (
                  <div className={css.notice} role={state.focus.phase === 'failed' ? 'alert' : 'status'}>
                    <span className={css.noticeText}>
                      {state.focus.phase === 'failed' ? t('focusFailed') : t('focusEnded')}
                    </span>
                  </div>
                )
                : null}
              <div className={css.rowActions}>
                <button type="button" className={css.select} onClick={() => { closeFocus() }}>{t('focusBack')}</button>
                <button
                  type="button"
                  className={css.select}
                  onClick={() => { if (state.focus === undefined) return; openSession(state.focus.sessionId) }}
                >
                  {t('openSession')}
                </button>
                {state.focus.row?.status === 'running'
                  ? (
                    <button
                      type="button"
                      className={css.select}
                      disabled={state.busySessionId === state.focus.sessionId}
                      onClick={() => {
                        if (state.focus === undefined) return
                        void cancelSession(state.focus.sessionId)
                      }}
                    >
                      {t('interrupt')}
                    </button>
                  )
                  : null}
                <button
                  type="button"
                  className={css.select}
                  onClick={() => {
                    setReplyingTo(replyingTo === state.focus?.sessionId ? null : state.focus?.sessionId ?? null)
                    setReplyText('')
                  }}
                >
                  {t('sendPrompt')}
                </button>
              </div>
              {state.focus.phase === 'connecting' && state.focus.row === undefined
                ? <p className={css.meta}>{t('focusConnecting')}</p>
                : null}
              {replyingTo === state.focus.sessionId
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
                      disabled={replyText.trim() === '' || state.busySessionId === state.focus.sessionId}
                      onClick={() => {
                        if (state.focus === undefined) return
                        const sessionId = state.focus.sessionId
                        void sendToSession(sessionId, replyText, 'queue').then((accepted) => {
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
        {state.focus === undefined
          ? (
            <>
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
              {rows.map((session) => {
                const pending = [...statuses].find(([sessionId]) => sessionId === session.sessionId)?.[1].pendingInteraction
                const approval = pending?.kind === 'approval' ? pending : undefined
                const question = pending?.kind === 'question' || pending?.kind === 'plan-review' ? pending : undefined
                const firstQuestion = question?.questions[0]
                const simpleOptions = firstQuestion !== undefined
            && firstQuestion.multiSelect !== true
            && firstQuestion.options !== undefined
            && firstQuestion.options.length > 0
                  ? firstQuestion.options
                  : undefined
                return (
                  <article key={session.sessionId} className={css.row}>
                    <button
                      type="button"
                      className={css.rowMain}
                      aria-label={t('focusSession')}
                      onClick={() => { focusSession(session.sessionId) }}
                    >
                      <div className={css.rowHead}>
                        <span className={css.sessionId} title={session.sessionId}>{session.title ?? t('untitled')}</span>
                        <span className={css.meta}>{session.status === 'running' ? t('running') : t('idle')}</span>
                        {session.lastPromptAt === undefined
                          ? null
                          : <span className={css.meta}>{relativeTime(session.lastPromptAt, t)}</span>}
                        {session.cwd === undefined ? null : <span className={css.meta} title={session.cwd}>{session.cwd}</span>}
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
                            disabled={state.busySessionId === session.sessionId}
                            onClick={() => { void cancelSession(session.sessionId) }}
                          >
                            {t('interrupt')}
                          </button>
                        )
                        : null}
                    </div>
                    {approval === undefined
                      ? null
                      : (
                        <div className={css.rowActions}>
                          <span className={css.chip}>{t('pendingApproval')} · {approval.toolName}</span>
                          <button
                            type="button"
                            className={css.select}
                            disabled={state.busySessionId === session.sessionId || !approval.answerable}
                            onClick={() => { void answerApproval(session.sessionId, 'allowed-once') }}
                          >
                            {t('allowOnce')}
                          </button>
                          <button
                            type="button"
                            className={css.select}
                            disabled={state.busySessionId === session.sessionId || !approval.answerable}
                            onClick={() => { void answerApproval(session.sessionId, 'rejected') }}
                          >
                            {t('rejectApproval')}
                          </button>
                        </div>
                      )}
                    {question === undefined || firstQuestion === undefined
                      ? null
                      : (
                        <div className={css.rowActions}>
                          <span className={css.chip}>
                            {question.kind === 'plan-review' ? t('planReviewPending') : t('questionPending')}
                            {' · '}
                            {firstQuestion.question}
                          </span>
                          {simpleOptions === undefined
                            ? (
                              <button type="button" className={css.select} onClick={() => { openSession(session.sessionId) }}>
                                {t('goToConversation')}
                              </button>
                            )
                            : simpleOptions.map(option => (
                              <button
                                key={option.label}
                                type="button"
                                className={css.select}
                                disabled={state.busySessionId === session.sessionId}
                                onClick={() => {
                                  void answerQuestion(session.sessionId, {
                                    answers: [{ id: firstQuestion.id, selected: [option.label] }],
                                  })
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                        </div>
                      )}
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
                            disabled={replyText.trim() === '' || state.busySessionId === session.sessionId}
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
                          <button
                            type="button"
                            className={css.select}
                            disabled={replyText.trim() === '' || state.busySessionId === session.sessionId}
                            onClick={() => {
                              void sendToSession(session.sessionId, replyText, 'steer').then((accepted) => {
                                if (!accepted) return
                                setReplyingTo(null)
                                setReplyText('')
                              })
                            }}
                          >
                            {t('sendSteer')}
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
          : null}
      </div>
    </section>
  )
}
