/** Workspace console page: the attention inbox, the project state bar, and the session work surface. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { QuestionAnswer } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { ConsoleState, ConsoleWorkspace } from './ProjectConsoleStore.ts'
import { attentionItems, healthCounts, type AttentionDescriptor } from './attention.ts'
import { visibleSessions } from './sessions-view.ts'
import { relationHints } from './relations.ts'
import { relationGroups } from './relation-tree.ts'
import { otherWorkspaceAttention, type WorkspaceSessions } from './cross-workspace.ts'
import { RelationGraph } from './RelationGraph.tsx'
import { AttentionInbox } from './AttentionInbox.tsx'
import { StudioView } from './StudioView.tsx'
import { readViewPreference, writeViewPreference, type ConsoleView } from './view-preference.ts'
import { ActivityTrack, HealthSegments, StatusDot, Timeline, type HealthFilter } from './visual/visual.tsx'
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
  /** @returns every Workspace with its member Session ids. */
  readonly workspaceSessions: () => readonly WorkspaceSessions[]
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
  /** Clear today's observed counters. */
  readonly resetShift: () => void
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

/**
 * Render the console page.
 * @param props - framework props, the page dictionary, and injected state/actions.
 * @returns the page body.
 */
export function ProjectConsolePage({
  t, store, workspaceOptions, workspaceSessions, selectedWorkspaceId, selectWorkspace, refresh, openSession, focusSession,
  closeFocus, resetShift, dispatch, sendToSession, cancelSession, answerApproval, answerQuestion, useSessionStatus,
}: ProjectConsolePageProps) {
  const [now, setNow] = useState(() => Date.now())
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [prompt, setPrompt] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [filter, setFilter] = useState<HealthFilter>(undefined)
  const [view, setView] = useState<ConsoleView>(() => readViewPreference())
  const statuses = useSessionStatus(state => state)
  const state = useSyncExternalStore(
    listener => store.subscribe(listener),
    () => store.getSnapshot(),
  )
  const selected = selectedWorkspaceId()
  const workspaces = workspaceOptions()
  const elsewhere = otherWorkspaceAttention(
    new Map([...statuses].map(([id, status]) => [String(id), status])),
    workspaceSessions(),
    selected,
  )
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
  const failureOf = (sessionId: string): string | undefined => {
    const row = rows.find(candidate => candidate.sessionId === sessionId)
    return row?.outcome === 'failed' ? row.outcomeReason ?? t('failed') : undefined
  }
  const attention = attentionItems(rows, statusFacts, descriptorOf, failureOf)
  const health = healthCounts(rows, statusFacts, descriptorOf, failureOf)
  const relations = relationHints(rows)
  const graphGroups = relationGroups(rows)
  const parentTitle = (sessionId: string): string | undefined => {
    const parentId = relations.parentOf.get(sessionId)
    return parentId === undefined ? undefined : rows.find(row => row.sessionId === parentId)?.title ?? parentId
  }
  const attentionIds = new Set(attention.map(item => item.sessionId))
  const pendingItems = attention.filter(item => item.pending !== undefined)
  const workingRows = rows.filter(row => !attentionIds.has(row.sessionId)).filter((row) => {
    const status = statusFacts.get(row.sessionId)
    if (filter === 'running') return row.status === 'running'
    if (filter === 'needs') return descriptorOf(row.sessionId) !== undefined
    if (filter === 'failed') return failureOf(row.sessionId) !== undefined
    if (filter === 'completed') return status?.completionUnread === true
    if (filter === 'idle') return row.status === 'idle' && status?.completionUnread !== true
    return true
  })
  const hasRows = rows.length > 0
  const keyboardIds = [...attention.map(item => item.sessionId), ...workingRows.map(row => row.sessionId)]
  const active = activeId !== undefined && keyboardIds.includes(activeId) ? activeId : undefined
  useEffect(() => {
    const editable = (target: EventTarget | null): boolean => target instanceof HTMLElement
      && (target.isContentEditable || target.closest('input, textarea, [contenteditable="true"]') !== null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || editable(event.target)) return
      const index = active === undefined ? -1 : keyboardIds.indexOf(active)
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        const next = keyboardIds[Math.min(keyboardIds.length - 1, index + 1)]
        if (next !== undefined) setActiveId(next)
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = keyboardIds[Math.max(0, index - 1)]
        if (next !== undefined) setActiveId(next)
      } else if (event.key === 'Enter') {
        const target = active ?? keyboardIds[0]
        if (target !== undefined) {
          event.preventDefault()
          focusSession(target)
        }
      } else if (event.key === 'Escape') {
        if (state.focus !== undefined) closeFocus()
        else { setActiveId(undefined); setReplyingTo(null); setReplyText('') }
      } else if (active !== undefined && event.key === 'a') {
        const pending = pendingOf(active)
        if (pending?.kind === 'approval') void answerApproval(active, 'allowed-once')
      } else if (active !== undefined && event.key === 'r') {
        setReplyingTo(active)
        setReplyText('')
      } else if (active !== undefined && event.key === 'i') {
        const row = rows.find(candidate => candidate.sessionId === active)
        if (row?.status === 'running') void cancelSession(active)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [active, keyboardIds.join(','), state.focus, rows, attention, pendingOf, focusSession, closeFocus, answerApproval, cancelSession])
  const focus = state.focus
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [])
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
          <div className={css.viewToggle} role="group" aria-label={t('viewCanvas')}>
            <button
              type="button"
              className={view === 'canvas' ? `${css.viewButton} ${css.viewButtonActive}` : css.viewButton}
              onClick={() => { setView('canvas'); writeViewPreference('canvas') }}
            >
              {t('viewCanvas')}
            </button>
            <button
              type="button"
              className={view === 'studio' ? `${css.viewButton} ${css.viewButtonActive}` : css.viewButton}
              onClick={() => { setView('studio'); writeViewPreference('studio') }}
            >
              {t('viewStudio')}
            </button>
          </div>
          <span className={css.keyboardHint}>{t('keyboardHint')}</span>
        </div>
        {focus !== undefined
          ? null
          : (
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
          )}
        {state.dispatchFailed === true
          ? <div className={css.notice} role="alert"><span className={css.noticeText}>{t('newSessionFailed')}</span></div>
          : null}
        {state.actionFailed === true
          ? <div className={css.notice} role="alert"><span className={css.noticeText}>{t('actionFailed')}</span></div>
          : null}
      </header>
      <div className={rows.length > 12 ? `${css.body} ${css.compact}` : css.body}>
        {elsewhere.length === 0
          ? null
          : (
            <div className={css.notice} role="status">
              <span className={css.noticeText}>
                {t('attentionElsewhere', { n: elsewhere.reduce((sum, workspace) => sum + workspace.count, 0) })}
              </span>
              {elsewhere.map(workspace => (
                <button
                  key={workspace.workspaceId}
                  type="button"
                  className={css.select}
                  onClick={() => { selectWorkspace(workspace.workspaceId) }}
                >
                  {workspace.title} · {workspace.count}
                </button>
              ))}
            </div>
          )}
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
          ? (
            <div className={css.empty}>
              <span className={css.emptyGlyph} aria-hidden="true">◇</span>
              <p className={css.emptyTitle}>{t('emptyTitle')}</p>
              <p className={css.emptyHint}>{t('emptyHint')}</p>
            </div>
          )
          : null}

        {state.status === 'ready' && hasRows
          ? (
            <AttentionInbox
              attention={attention}
              busySessionId={actionBusy}
              active={active}
              t={t}
              actions={{
                open: openSession,
                focus: focusSession,
                approve: (sessionId, decision) => { void answerApproval(sessionId, decision) },
                answer: (sessionId, answer) => { void answerQuestion(sessionId, answer) },
              }}
            />
          )
          : null}

        <RelationGraph groups={graphGroups} t={t} onOpen={openSession} />

        {focus === undefined
          ? (view === 'canvas'
            ? (
              <>
                {workingRows.length === 0 || (state.status !== 'ready' || !hasRows)
                  ? null
                  : <h2 className={css.sectionTitle}>{t('working')}</h2>}
                {workingRows.map((session) => {
                  const status = statusFacts.get(session.sessionId)
                  const lane = status?.completionUnread === true ? css.rowSuccess
                    : session.status === 'running' ? css.rowRunning : css.rowIdle
                  return (
                    <article key={session.sessionId} className={`${css.row} ${lane} ${active === session.sessionId ? css.rowActive : ''}`}>
                      <button
                        type="button"
                        className={css.rowMain}
                        aria-label={t('focusSession')}
                        onClick={() => { focusSession(session.sessionId) }}
                      >
                        <div className={css.rowHead}>
                          <StatusDot state={session.stalled === true || session.outcome === 'failed' ? 'error' : status?.completionUnread === true ? 'success' : session.status === 'running' ? 'running' : 'idle'} />
                          <span className={css.sessionId} title={session.sessionId}>{session.title ?? t('untitled')}</span>
                          <span className={css.meta}>{statusText(session.status, t)}</span>
                          {session.lastPromptAt === undefined
                            ? null
                            : <span className={css.meta}>{relativeTime(session.lastPromptAt, t)}</span>}
                          {session.cwd === undefined ? null : <span className={`${css.meta} ${css.path}`} title={session.cwd}>{session.cwd}</span>}
                          {parentTitle(session.sessionId) === undefined
                            ? null
                            : <span className={css.chip}>↳ {t('derivedFrom', { title: parentTitle(session.sessionId) })}</span>}
                          {session.outcome === 'failed'
                            ? <span className={css.chip} title={session.outcomeReason}>{t('failed')}{session.outcomeReason === undefined ? '' : ` · ${session.outcomeReason}`}</span>
                            : null}
                          {session.changes === undefined
                            ? null
                            : (
                              <>
                                <span className={css.chip}>{t('changesSummary', { n: session.changes.total, added: session.changes.added, deleted: session.changes.deleted })}</span>
                                <button type="button" className={css.select} onClick={() => { openSession(session.sessionId) }}>{t('viewChanges')}</button>
                              </>
                            )}
                          {session.stalled === true ? <span className={css.chip}>{t('stalled')}</span> : null}
                          {state.changes?.has(session.sessionId) === true ? <span className={css.chip}>{t('newBadge')}</span> : null}
                        </div>
                        <ActivityTrack
                          activity={session.activity}
                          t={t}
                          running={session.status === 'running'}
                        />
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
              <StudioView
                rows={rows}
                statusFacts={statusFacts}
                descriptorOf={descriptorOf}
                shift={state.shift}
                now={now}
                t={t}
                onFocus={focusSession}
                onResetShift={resetShift}
              />
            ))
          : (
            <article className={`${css.row} ${focus.row === undefined ? css.rowIdle : focus.row.status === 'running' ? css.rowRunning : css.rowIdle}`}>
              <div className={css.rowHead}>
                <StatusDot state={focus.row === undefined ? 'unknown' : focus.row.outcome === 'failed' ? 'error' : focus.row.status === 'running' ? 'running' : 'idle'} />
                <span className={css.sessionId} title={focus.sessionId}>
                  {focus.row === undefined ? t('untitled') : focus.row.title ?? t('untitled')}
                </span>
                <span className={css.chip}>{t('focusActive')}</span>
                {focus.row === undefined
                  ? null
                  : <span className={css.meta}>{statusText(focus.row.status, t)}</span>}
                {focus.row === undefined || focus.row.lastPromptAt === undefined
                  ? null
                  : <span className={css.meta}>{relativeTime(focus.row.lastPromptAt, t)}</span>}
                {focus.row === undefined || focus.row.cwd === undefined
                  ? null
                  : <span className={`${css.meta} ${css.path}`} title={focus.row.cwd}>{focus.row.cwd}</span>}
                {focus.row?.outcome === 'failed'
                  ? <span className={css.chip} title={focus.row.outcomeReason}>{t('failed')}</span>
                  : null}
                {focus.row?.changes === undefined
                  ? null
                  : (
                    <>
                      <span className={css.chip}>{t('changesSummary', { n: focus.row.changes.total, added: focus.row.changes.added, deleted: focus.row.changes.deleted })}</span>
                      <button type="button" className={css.select} onClick={() => { openSession(focus.sessionId) }}>{t('viewChanges')}</button>
                    </>
                  )}
                {focusPending === 0
                  ? null
                  : <span className={css.chip}>{t('needsYou')} {focusPending}</span>}
              </div>
              <ActivityTrack
                activity={focus.row === undefined ? [] : focus.row.activity}
                t={t}
                running={focus.row?.status === 'running'}
                now={now}
              />
              {focus.row === undefined ? null : (
                <h2 className={css.sectionTitle}>{t('timeline')}</h2>
              )}
              {focus.row?.relations?.children === undefined || focus.row.relations.children.length === 0
                ? null
                : (
                  <div className={css.section}>
                    <h2 className={css.sectionTitle}>{t('subagentsTitle')}</h2>
                    {focus.row.relations.children.map(child => (
                      <div key={child.sessionId} className={css.rowActions}>
                        <span className={css.chip}>{child.sessionId.slice(0, 8)}{child.live === true ? ` · ${t('running')}` : ''}</span>
                        <button type="button" className={css.select} onClick={() => { openSession(child.sessionId) }}>{t('openSession')}</button>
                      </div>
                    ))}
                  </div>
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
