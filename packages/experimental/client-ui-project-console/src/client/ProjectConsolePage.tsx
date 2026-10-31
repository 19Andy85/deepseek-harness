/** Workspace console page: the attention inbox, the project state bar, and the session work surface. */
import { Fragment, useEffect, useState, useSyncExternalStore } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionStatus, SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { QuestionAnswer } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { ConsoleState, ConsoleWorkspace } from './ProjectConsoleStore.ts'
import { attentionItems, healthCounts, type AttentionDescriptor } from './attention.ts'
import { visibleSessions } from './sessions-view.ts'
import { relationHints } from './relations.ts'
import { relationGroups } from './relation-tree.ts'
import { identityOf, partnerName, type PartnerRole } from './partner-identity.ts'
import { readPartnerAliases, writePartnerAlias } from './partner-aliases.ts'
import { PartnerAvatar } from './PartnerAvatar.tsx'
import { otherWorkspaceAttention, type WorkspaceSessions } from './cross-workspace.ts'
import { globalInboxCount, globalInboxGroups } from './global-inbox.ts'
import { GlobalInbox } from './GlobalInbox.tsx'
import { RelationGraph } from './RelationGraph.tsx'
import { AttentionInbox } from './AttentionInbox.tsx'
import { StudioView } from './StudioView.tsx'
import { readViewPreference, writeViewPreference, type ConsoleView } from './view-preference.ts'
import { ActivityTrack, formatDuration, HealthSegments, StatusDot, Timeline, type HealthFilter } from './visual/visual.tsx'
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
  const [inboxOpen, setInboxOpen] = useState(false)
  const [relationView, setRelationView] = useState<'inline' | 'canvas'>('inline')
  const [aliases, setAliases] = useState<Record<string, string>>(() => readPartnerAliases())
  const [renaming, setRenaming] = useState<string | undefined>(undefined)
  const [renameText, setRenameText] = useState('')
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
  const statusFacts: ReadonlyMap<string, SessionStatus> = new Map(
    [...statuses].map(([id, status]): [string, SessionStatus] => [String(id), status]),
  )
  const inboxGroups = globalInboxGroups(statusFacts, workspaceSessions())
  const inboxTotal = globalInboxCount(inboxGroups)
  const elsewhere = otherWorkspaceAttention(statusFacts, workspaceSessions(), selected)
  const aliasesMap = new Map(Object.entries(aliases))
  const rows = visibleSessions(state.sessions)
  const ROLE_KEYS: Record<PartnerRole, ProjectConsoleKey> = {
    analysis: 'roleAnalysis',
    implementation: 'roleImplementation',
    research: 'roleResearch',
    operation: 'roleOperation',
    guard: 'roleGuard',
    general: 'roleGeneral',
  }
  const saveAlias = (sessionId: string) => {
    setAliases(writePartnerAlias(sessionId, renameText))
    setRenaming(undefined)
    setRenameText('')
  }
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
  const visibleById = new Map(workingRows.map(row => [row.sessionId, row]))
  const nestedChildren = new Map<string, SessionTaskView[]>()
  const nestedIds = new Set<string>()
  for (const row of workingRows) {
    for (const child of row.relations?.children ?? []) {
      const visibleChild = visibleById.get(child.sessionId)
      if (visibleChild === undefined) continue
      const children = nestedChildren.get(row.sessionId) ?? []
      children.push(visibleChild)
      nestedChildren.set(row.sessionId, children)
      nestedIds.add(visibleChild.sessionId)
    }
  }
  const families = workingRows
    .filter(row => !nestedIds.has(row.sessionId))
    .map(row => [row, ...(nestedChildren.get(row.sessionId) ?? [])])
  const familySection = (family: readonly SessionTaskView[]): 'working' | 'completed' | 'idle' => {
    if (family.some(row => row.status === 'running')) return 'working'
    if (family.some(row => statusFacts.get(row.sessionId)?.completionUnread === true)) return 'completed'
    return 'idle'
  }
  const sections: { title: string; families: readonly (readonly SessionTaskView[])[] }[] = [
    { title: t('inProgress'), families: families.filter(family => familySection(family) === 'working') },
    { title: t('completedUnread'), families: families.filter(family => familySection(family) === 'completed') },
    { title: t('idle'), families: families.filter(family => familySection(family) === 'idle') },
  ]
  const orderedLanes: { session: SessionTaskView; section: string; total: number; nested: boolean }[] = []
  for (const section of sections) {
    for (const family of section.families) {
      const familyLaneCount = section.families.reduce((sum, members) => sum + members.length, 0)
      for (const [index, row] of family.entries()) {
        orderedLanes.push({ session: row, section: section.title, total: familyLaneCount, nested: index > 0 })
      }
    }
  }
  const changedRows = workingRows.filter(row => state.changes?.has(row.sessionId) === true)
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
      } else if (event.key === 'g') {
        event.preventDefault()
        setInboxOpen(open => !open)
      } else if (event.key === 'Escape') {
        if (inboxOpen) { setInboxOpen(false); return }
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
  }, [active, keyboardIds.join(','), state.focus, rows, attention, inboxOpen, pendingOf, focusSession, closeFocus, answerApproval, cancelSession])
  const focus = state.focus
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [])
  const actionBusy = state.busySessionId
  const inboxNode = state.status === 'ready' && hasRows
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
    : null
  const focusPending = focus === undefined ? 0 : pendingItems.filter(item => item.sessionId === focus.sessionId).length
  const focusIdentity = focus?.row === undefined ? undefined : identityOf(focus.row, aliasesMap)

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
          <button type="button" className={css.select} onClick={() => { window.location.reload() }}>{t('refreshPage')}</button>
          {state.updatedAt === undefined
            ? null
            : (
              <span className={css.meta}>
                {t('updatedAt', { time: new Date(state.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) })}
              </span>
            )}
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
          <button
            type="button"
            className={css.select}
            onClick={() => { setRelationView(view => (view === 'inline' ? 'canvas' : 'inline')) }}
          >
            {relationView === 'inline' ? t('relationInline') : t('relationCanvas')}
          </button>
          <button
            type="button"
            className={css.select}
            aria-expanded={inboxOpen}
            onClick={() => { setInboxOpen(open => !open) }}
          >
            {t('globalInbox')}{inboxTotal === 0 ? '' : ` ${String(inboxTotal)}`}
          </button>
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
        {inboxOpen
          ? (
            <GlobalInbox
              groups={inboxGroups}
              statuses={statusFacts}
              t={t}
              aliases={aliasesMap}
              onOpen={(sessionId) => { openSession(sessionId) }}
              onSwitch={(workspaceId) => { selectWorkspace(workspaceId) }}
              onApprove={(sessionId) => { void answerApproval(sessionId, 'allowed-once') }}
              onReject={(sessionId) => { void answerApproval(sessionId, 'rejected') }}
              onAnswer={(sessionId, questionId, label) => {
                void answerQuestion(sessionId, { answers: [{ id: questionId, selected: [label] }] })
              }}
            />
          )
          : null}
        {inboxOpen || elsewhere.length === 0
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

        {!inboxOpen && view === 'canvas' ? inboxNode : null}

        {relationView === 'canvas' && focus === undefined
          ? <RelationGraph groups={graphGroups} aliases={aliasesMap} t={t} onOpen={openSession} />
          : null}

        {focus === undefined
          ? (view === 'canvas'
            ? (
              <>
                {state.lastSeenAt === undefined
                  ? null
                  : (
                    <div className={css.changeBar}>
                      <span className={css.changeLabel}>
                        {t('sinceLastVisit', { time: new Date(state.lastSeenAt).toLocaleTimeString(undefined, { hour12: false }) })}
                      </span>
                      {changedRows.length === 0
                        ? <span className={css.meta}>{t('noChangesSince')}</span>
                        : (
                          <>
                            <span className={css.meta}>{t('changesSince', { n: changedRows.length })}</span>
                            {changedRows.slice(0, 4).map(row => (
                              <button
                                key={row.sessionId}
                                type="button"
                                className={css.chipButton}
                                onClick={() => { focusSession(row.sessionId) }}
                              >
                                {partnerName(row.sessionId, row.title, aliasesMap.get(row.sessionId))}
                              </button>
                            ))}
                          </>
                        )}
                    </div>
                  )}
                {(() => {
                  let lastSection = ''
                  return orderedLanes.map(({ session, section, total, nested }) => {
                    const identity = identityOf(session, aliasesMap)
                    const status = statusFacts.get(session.sessionId)
                    const lane = status?.completionUnread === true ? css.rowSuccess
                      : session.status === 'running' ? css.rowRunning : css.rowIdle
                    const startedAt = session.activity
                      .flatMap(entry => entry.startedAt === undefined ? [] : [entry.startedAt])
                      .reduce<number | undefined>((min, at) => (min === undefined || at < min ? at : min), session.lastPromptAt)
                    const elapsed = startedAt === undefined || now - startedAt > 86_400_000
                      ? undefined
                      : formatDuration(Math.max(0, now - startedAt), t)
                    const newSection = section !== lastSection
                    lastSection = section
                    return (
                      <Fragment key={session.sessionId}>
                        {newSection
                          ? <h2 className={css.sectionTitle}>{section} <span className={css.sectionCount}>{total}</span></h2>
                          : null}
                        <article className={`${css.lane} ${lane} ${nested ? css.nestedLane : ''} ${active === session.sessionId ? css.rowActive : ''}`}>
                          <button
                            type="button"
                            className={css.laneMain}
                            aria-label={`${identity.name} · ${statusText(session.status, t)}`}
                            onClick={() => { focusSession(session.sessionId) }}
                            onDoubleClick={() => { openSession(session.sessionId) }}
                          >
                            <div className={css.laneIdentity}>
                              <div className={css.identityTop}>
                                <StatusDot state={session.stalled === true || session.outcome === 'failed' ? 'error' : status?.completionUnread === true ? 'success' : session.status === 'running' ? 'running' : 'idle'} />
                                <PartnerAvatar name={identity.name} initial={identity.initial} role={identity.role} />
                                <span className={css.sessionId} title={session.sessionId}>{identity.name}</span>
                                {state.changes?.has(session.sessionId) === true ? <span className={css.chip}>{t('newBadge')}</span> : null}
                              </div>
                              <span className={`${css.meta} ${css.taskTitle}`} title={session.title ?? ''}>{session.title ?? t('untitled')}</span>
                              <span className={css.meta}>{statusText(session.status, t)}</span>
                            </div>
                            <div className={css.laneActivity}>
                              <ActivityTrack
                                activity={session.activity}
                                t={t}
                                running={session.status === 'running'}
                              />
                              <div className={css.laneChips}>
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
                              </div>
                            </div>
                            <div className={css.laneTime}>
                              {session.status === 'running' && elapsed !== undefined
                                ? <span className={css.elapsed}>{t('activityAge', { duration: elapsed })}</span>
                                : null}
                              {session.lastPromptAt === undefined
                                ? null
                                : <span className={css.meta}>{relativeTime(session.lastPromptAt, t)}</span>}
                            </div>
                          </button>
                          <div className={css.laneActions}>
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
                          <div className={css.laneHover} aria-hidden="true">
                            <span className={css.hoverTitle}>{session.title ?? t('untitled')}</span>
                            <span className={css.meta}>
                              {statusText(session.status, t)}
                              {session.lastPromptAt === undefined ? '' : ` · ${relativeTime(session.lastPromptAt, t)}`}
                              {session.relations?.children === undefined ? '' : ` · ${t('subagentsTitle')} ${String(session.relations.children.length)}`}
                            </span>
                          </div>
                        </article>
                      </Fragment>
                    )
                  })
                })()}
              </>
            )
            : (
              <div className={css.studioShell}>
                <aside className={css.studioSide}>{inboxOpen ? null : inboxNode}</aside>
                <StudioView
                  rows={rows}
                  aliases={aliasesMap}
                  statusFacts={statusFacts}
                  descriptorOf={descriptorOf}
                  shift={state.shift}
                  now={now}
                  t={t}
                  onFocus={focusSession}
                  onResetShift={resetShift}
                  onOpen={openSession}
                />
              </div>
            ))
          : (
            <article className={`${css.row} ${focus.row === undefined ? css.rowIdle : focus.row.status === 'running' ? css.rowRunning : css.rowIdle}`}>
              <div className={css.rowHead}>
                <StatusDot state={focus.row === undefined ? 'unknown' : focus.row.outcome === 'failed' ? 'error' : focus.row.status === 'running' ? 'running' : 'idle'} />
                {focus.row === undefined
                  ? null
                  : (
                    <>
                      <PartnerAvatar
                        name={focusIdentity?.name ?? ''}
                        initial={focusIdentity?.initial ?? '·'}
                        role={focusIdentity?.role ?? 'general'}
                        size={30}
                      />
                      <span className={css.sessionId} title={focus.sessionId}>{focusIdentity?.name}</span>
                      <span className={css.chip}>{t(ROLE_KEYS[focusIdentity?.role ?? 'general'])}</span>
                    </>
                  )}
                <span className={css.chip}>{t('focusActive')}</span>
                {renaming === focus.sessionId
                  ? (
                    <>
                      <input
                        className={css.renameInput}
                        value={renameText}
                        placeholder={t('renamePlaceholder')}
                        onChange={(event) => { setRenameText(event.currentTarget.value) }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveAlias(focus.sessionId)
                          if (event.key === 'Escape') { setRenaming(undefined); setRenameText('') }
                        }}
                      />
                      <button type="button" className={css.select} onClick={() => { saveAlias(focus.sessionId) }}>{t('save')}</button>
                      <button type="button" className={css.select} onClick={() => { setRenaming(undefined); setRenameText('') }}>{t('cancel')}</button>
                    </>
                  )
                  : (
                    <button
                      type="button"
                      className={css.select}
                      onClick={() => {
                        setRenaming(focus.sessionId)
                        setRenameText(partnerName(
                          focus.sessionId, focus.row?.title, aliasesMap.get(focus.sessionId),
                        ))
                      }}
                    >
                      {t('renamePartner')}
                    </button>
                  )}
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
                  <button
                    type="button"
                    className={css.chipButton}
                    onClick={() => { setRelationView('canvas') }}
                  >
                    {t('subagentsTitle')} {focus.row.relations.children.length}
                  </button>
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
