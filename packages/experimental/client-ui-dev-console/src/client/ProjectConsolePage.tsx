/** Workspace console page: the attention inbox, the project state bar, and the session work surface. */
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionStatus, SessionStatusSnapshot, UseSessionStatus } from '@deepseek-ai/dsh-client-ui-session/client'
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
import { createTaskCard, parseTaskCard, readTaskCards, writeTaskCards, type TaskCard } from './task-cards.ts'
import { readUiState, writeUiState, type ConsoleUiState } from './ui-state.ts'
import {
  CONSOLE_CHANNEL, readActions, readDraft, readReplyDraft, readStudioMode, writeActions, writeDraft, writeReplyDraft, writeStudioMode,
  type ConsoleAction, type ConsoleMessage,
} from './durable.ts'
import {
  displayFacts, readReadingMode, resolveReadingLevel, writeReadingMode, type ReadingMode, type ReadingLevel,
} from './reading-scale.ts'
import { PartnerAvatar } from './PartnerAvatar.tsx'
import { otherWorkspaceAttention, type WorkspaceSessions } from './cross-workspace.ts'
import { globalInboxCount, globalInboxGroups } from './global-inbox.ts'
import { GlobalInbox } from './GlobalInbox.tsx'
import { RelationGraph } from './RelationGraph.tsx'
import { AttentionInbox } from './AttentionInbox.tsx'
import { StudioView } from './StudioView.tsx'
import { IsoStudioView } from './IsoStudioView.tsx'
import { DomainView, type DomainOpenView, type DomainSnapshotView } from './DomainView.tsx'
import { readViewPreference, writeViewPreference, type ConsoleView } from './view-preference.ts'
import { ActivityTrack, formatDuration, formatTokens, HealthSegments, StatusDot, Timeline, type HealthFilter } from './visual/visual.tsx'
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
  /** Open the console for the current project in the right rail. */
  readonly openInSidebar: () => void
  /** Read the Dev Console domain registry. */
  readonly devConsoleSnapshot: () => Promise<DomainSnapshotView>
  /** Open one configured domain in a cwd Session. */
  readonly devConsoleOpenDomain: (domainId: string) => Promise<DomainOpenView>
  /** Read git output for a domain. */
  readonly devConsoleGit: (domainId: string, action: 'status' | 'log' | 'diff') => Promise<{ readonly text: string }>
  /** Read the domain AGENTS.md. */
  readonly devConsoleAgents: (domainId: string) => Promise<{ readonly path: string; readonly text: string; readonly hash: string }>
  /** Save the domain AGENTS.md. */
  readonly devConsoleSaveAgents: (domainId: string, text: string, baseHash: string) => Promise<{ readonly hash: string }>
  /** Generate a registry from connected workspaces. */
  readonly devConsoleAutoConfig: () => Promise<{ readonly path: string; readonly projects: number }>
}

/** Framework props of the workspace console page. */
export type ProjectConsolePageProps = PropsLocale<'projectConsole'> & InjectFace<ProjectConsoleInjected> & {
  /** Live pending-interaction hook supplied by the surface wrapper. */
  readonly useSessionStatus: UseSessionStatus
  /** Narrow rail surface: hide side columns and keep the board compact. */
  readonly compact?: boolean
  /** Which surface renders the page. */
  readonly surface?: 'main' | 'rail'
  /** Session the rail console follows. */
  readonly railSessionId?: string
  /** Float the rail console into a floating panel. */
  readonly onFloat?: () => void
  /** Return a floating rail console to the docked column. */
  readonly onDock?: () => void
}

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
  closeFocus, resetShift, dispatch, sendToSession, cancelSession, answerApproval, answerQuestion, useSessionStatus, openInSidebar,
  devConsoleSnapshot, devConsoleOpenDomain, devConsoleGit, devConsoleAgents, devConsoleSaveAgents, devConsoleAutoConfig,
  compact = false, surface = 'main', railSessionId, onFloat, onDock,
}: ProjectConsolePageProps) {
  const [now, setNow] = useState(() => Date.now())
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [workspaceBack, setWorkspaceBack] = useState<string | undefined>(undefined)
  const [reloadNotice, setReloadNotice] = useState(false)
  const [domainsOpen, setDomainsOpen] = useState(false)
  const [actions, setActions] = useState<readonly ConsoleAction[]>([])
  const channel = useRef<BroadcastChannel | undefined>(undefined)
  const workspaceRef = useRef<string | undefined>(undefined)
  const replyRef = useRef<string | null>(null)
  const [relationView, setRelationView] = useState<'inline' | 'canvas'>('inline')
  const [relationExpanded, setRelationExpanded] = useState(false)
  const [aliases, setAliases] = useState<Record<string, string>>(() => readPartnerAliases())
  const [cards, setCards] = useState<TaskCard[]>(() => readTaskCards())
  const [cardText, setCardText] = useState('')
  const [cardBoardOpen, setCardBoardOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [readingMode, setReadingMode] = useState<ReadingMode>(() => readReadingMode())
  const [facts, setFacts] = useState(() => displayFacts())
  const readingLevel: ReadingLevel = resolveReadingLevel(readingMode, facts)
  const [renaming, setRenaming] = useState<string | undefined>(undefined)
  const [renameText, setRenameText] = useState('')
  const [prompt, setPrompt] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [filter, setFilter] = useState<HealthFilter>(undefined)
  const [view, setView] = useState<ConsoleView>(() => (compact ? 'studio' : readViewPreference()))
  const [studioMode, setStudioMode] = useState(() => (compact ? 'board' : readStudioMode()))
  const statuses = useSessionStatus(state => state)
  const state = useSyncExternalStore(
    listener => store.subscribe(listener),
    () => store.getSnapshot(),
  )
  const selected = state.workspaceId ?? selectedWorkspaceId()
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
  const logAction = (label: string) => {
    setActions((previous) => {
      const next = [{ id: Date.now(), label, at: Date.now() }, ...previous].slice(0, 50)
      writeActions(selected, next)
      if (selected !== undefined) channel.current?.postMessage({ kind: 'actions', workspace: selected, actions: next } satisfies ConsoleMessage)
      return next
    })
  }
  const approve = (sessionId: string, decision: 'allowed-once' | 'rejected') => {
    void answerApproval(sessionId, decision).then((accepted) => {
      if (accepted) logAction(`${decision === 'allowed-once' ? t('allowOnce') : t('rejectApproval')} · ${partnerName(sessionId, rows.find(row => row.sessionId === sessionId)?.title, aliasesMap.get(sessionId))}`)
    })
  }
  const answer = (sessionId: string, answerValue: Parameters<typeof answerQuestion>[1]) => {
    void answerQuestion(sessionId, answerValue).then((accepted) => {
      if (accepted) logAction(`${t('answerQuestion')} · ${partnerName(sessionId, rows.find(row => row.sessionId === sessionId)?.title, aliasesMap.get(sessionId))}`)
    })
  }
  const interrupt = (sessionId: string) => {
    void cancelSession(sessionId).then((accepted) => {
      if (accepted) logAction(`${t('interrupt')} · ${partnerName(sessionId, rows.find(row => row.sessionId === sessionId)?.title, aliasesMap.get(sessionId))}`)
    })
  }
  const persistCards = (next: readonly TaskCard[]) => {
    setCards(writeTaskCards(next))
  }
  const addCard = () => {
    const card = createTaskCard(cardText)
    if (card === undefined) return
    persistCards([...cards, card])
    setCardText('')
    writeDraft(selected, 'card', '')
    if (selected !== undefined) channel.current?.postMessage({ kind: 'card', workspace: selected, value: '' } satisfies ConsoleMessage)
  }
  const removeCard = (id: string) => {
    persistCards(cards.filter(card => card.id !== id))
  }
  const dispatchCard = (sessionId: string, raw: string) => {
    const card = parseTaskCard(raw)
    if (card === undefined) return
    void sendToSession(sessionId, card.text, 'queue').then((accepted) => {
      if (!accepted) return
      removeCard(card.id)
      logAction(`${t('dispatchToSelected')} · ${partnerName(sessionId, rows.find(row => row.sessionId === sessionId)?.title, aliasesMap.get(sessionId))}`)
    })
  }
  const saveAlias = (sessionId: string) => {
    if (renameText.trim() !== '') logAction(`${t('renamePartner')} · ${renameText.trim()}`)
    setAliases(writePartnerAlias(sessionId, renameText))
    setRenaming(undefined)
    setRenameText('')
  }
  const pendingOf = (sessionId: string) => statusFacts.get(sessionId)?.pendingInteraction
  const descriptorOf = (sessionId: string): AttentionDescriptor | undefined => {
    const pending = pendingOf(sessionId)
    if (pending === undefined) return undefined
    if (pending.kind === 'approval') {
      return {
        kind: 'approval',
        toolName: pending.toolName,
        answerable: pending.answerable,
        ...pending.reason === undefined ? {} : { reason: pending.reason },
      }
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
  const usageTotals = rows.reduce((sum, row) => sum + (row.usage?.totalTokens ?? 0), 0)
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
        if (pending?.kind === 'approval') approve(active, 'allowed-once')
      } else if (active !== undefined && event.key === 'r') {
        setReplyingTo(active)
        setReplyText('')
      } else if (active !== undefined && event.key === 'i') {
        const row = rows.find(candidate => candidate.sessionId === active)
        if (row?.status === 'running') interrupt(active)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [active, keyboardIds.join(','), state.focus, rows, attention, inboxOpen, pendingOf, focusSession, closeFocus, approve, interrupt])
  const focus = state.focus
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [])
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 5_000)
    return () => { clearInterval(timer) }
  }, [refresh])
  useEffect(() => {
    const update = () => { setFacts(displayFacts()) }
    window.addEventListener('resize', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  useEffect(() => {
    if (selected === undefined) return
    const saved = readUiState(selected)
    setActiveId(saved.activeId)
    setFilter(saved.filter)
    setRelationView(saved.relationView ?? 'inline')
    setCardBoardOpen(saved.cardBoardOpen ?? false)
    const restore = () => { bodyRef.current?.scrollTo({ top: saved.scrollTop ?? 0 }) }
    const frame = requestAnimationFrame(restore)
    const timer = setTimeout(restore, 250)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [selected])
  useEffect(() => {
    if (selected === undefined) return
    writeUiState(selected, { activeId, filter, relationView, cardBoardOpen })
  }, [selected, activeId, filter, relationView, cardBoardOpen])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bus = new BroadcastChannel(CONSOLE_CHANNEL)
    bus.onmessage = (event: MessageEvent<ConsoleMessage>) => {
      const message = event.data
      if (message.workspace !== workspaceRef.current) return
      if (message.kind === 'actions') setActions(message.actions)
      else if (message.kind === 'prompt') setPrompt(message.value)
      else if (message.kind === 'card') setCardText(message.value)
      else if (message.sessionId === replyRef.current) setReplyText(message.value)
    }
    channel.current = bus
    return () => { channel.current = undefined; bus.close() }
  }, [])
  useEffect(() => {
    workspaceRef.current = selected
    if (selected === undefined) return
    setActions(readActions(selected))
    setPrompt(readDraft(selected, 'prompt'))
    setCardText(readDraft(selected, 'card'))
  }, [selected])
  useEffect(() => {
    replyRef.current = replyingTo
    if (replyingTo === null) return
    setReplyText(readReplyDraft(replyingTo))
  }, [replyingTo])
  useEffect(() => {
    if (focus?.sessionId !== undefined) setActiveId(focus.sessionId)
  }, [focus?.sessionId])
  useEffect(() => () => {
    if (scrollTimer.current !== undefined) clearTimeout(scrollTimer.current)
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
          approve: (sessionId, decision) => { approve(sessionId, decision) },
          answer: (sessionId, answerValue) => { answer(sessionId, answerValue) },
        }}
      />
    )
    : null
  const crossGroups = inboxGroups.filter(group => group.workspaceId !== selected)
  const crossInboxNode = crossGroups.length === 0
    ? null
    : (
      <GlobalInbox
        groups={crossGroups}
        statuses={statusFacts}
        aliases={aliasesMap}
        t={t}
        onOpen={(sessionId) => { openSession(sessionId) }}
        onSwitch={(workspaceId) => { setWorkspaceBack(selected); selectWorkspace(workspaceId) }}
        onApprove={(sessionId) => { approve(sessionId, 'allowed-once') }}
        onReject={(sessionId) => { approve(sessionId, 'rejected') }}
        onAnswer={(sessionId, questionId, label) => {
          answer(sessionId, { answers: [{ id: questionId, selected: [label] }] })
        }}
      />
    )
  const inboxSideNode = attention.length > 0 ? inboxNode : crossInboxNode
  const focusPending = focus === undefined ? 0 : pendingItems.filter(item => item.sessionId === focus.sessionId).length
  const focusIdentity = focus?.row === undefined ? undefined : identityOf(focus.row, aliasesMap)

  return (
    <section
      className={css.page}
      data-reading={readingLevel}
      data-compact={compact ? 'true' : undefined}
      data-surface={surface}
    >
      <header className={css.head}>
        <h1 className={css.title}>{t('title')}</h1>
        <p className={css.subtitle}>{t('description')}</p>
        {surface !== 'rail' || railSessionId === undefined
          ? null
          : railSessionId !== undefined
            ? (
              <div className={css.railScope}>
                <button
                  type="button"
                  className={css.select}
                  onClick={() => {
                    const workspaceId = workspaceSessions().find(item => item.sessionIds.includes(railSessionId))?.id
                    if (workspaceId !== undefined) selectWorkspace(workspaceId)
                    focusSession(railSessionId)
                  }}
                >
                  {t('railFollowSession')}
                </button>
                <button
                  type="button"
                  className={css.select}
                  onClick={() => {
                    const workspaceId = workspaceSessions().find(item => item.sessionIds.includes(railSessionId))?.id
                    if (workspaceId !== undefined) selectWorkspace(workspaceId)
                    closeFocus()
                  }}
                >
                  {t('railWholeProject')}
                </button>
                {onFloat === undefined ? null : <button type="button" className={css.select} onClick={onFloat}>{t('floatPanel')}</button>}
                {onDock === undefined ? null : <button type="button" className={css.select} onClick={onDock}>{t('dockPanel')}</button>}
              </div>
            )
            : null}
        {state.status === 'ready' && hasRows
          ? <HealthSegments counts={health} filter={filter} t={t} onFilter={setFilter} />
          : null}
        {usageTotals === 0
          ? null
          : (
            <div className={css.usageSummary} title={t('workspaceTokensHint')}>
              {t('workspaceTokens')} · {formatTokens(usageTotals)}
            </div>
          )}
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
          <button type="button" className={css.select} onClick={() => { setReloadNotice(true) }}>{t('refreshPage')}</button>
          <select
            className={css.select}
            aria-label={t('readingSize')}
            value={readingMode}
            onChange={(event) => {
              const mode = event.currentTarget.value as ReadingMode
              setReadingMode(mode)
              writeReadingMode(mode)
            }}
          >
            <option value="auto">{t('readingAuto')}</option>
            <option value="compact">{t('readingCompact')}</option>
            <option value="standard">{t('readingStandard')}</option>
            <option value="comfortable">{t('readingComfortable')}</option>
          </select>
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
          {view === 'studio'
            ? (
              <div className={css.viewToggle} role="group" aria-label={t('isoStudioTitle')}>
                <button
                  type="button"
                  className={studioMode === 'iso' ? `${css.viewButton} ${css.viewButtonActive}` : css.viewButton}
                  onClick={() => { setStudioMode('iso'); writeStudioMode('iso') }}
                >
                  {t('isoStudioTitle')}
                </button>
                <button
                  type="button"
                  className={studioMode === 'board' ? `${css.viewButton} ${css.viewButtonActive}` : css.viewButton}
                  onClick={() => { setStudioMode('board'); writeStudioMode('board') }}
                >
                  {t('boardMode')}
                </button>
              </div>
            )
            : null}
          {surface === 'main'
            ? (
              <button
                type="button"
                className={css.select}
                disabled={rows.length === 0 && focus === undefined}
                title={rows.length === 0 && focus === undefined ? t('railNeedsSession') : undefined}
                onClick={openInSidebar}
              >
                {t('openInSidebar')}
              </button>
            )
            : null}
          <button type="button" className={css.select} onClick={() => { setDomainsOpen(true) }}>{t('domainsTitle')}</button>
          <button
            type="button"
            className={css.select}
            onClick={() => {
              setRelationView(view => (view === 'inline' ? 'canvas' : 'inline'))
              setInboxOpen(false)
            }}
          >
            {relationView === 'inline' ? t('relationInline') : t('relationCanvas')}
          </button>
          <button
            type="button"
            className={css.select}
            aria-expanded={inboxOpen}
            onClick={() => {
              setInboxOpen((open) => {
                if (!open) {
                  closeFocus()
                  setRelationView('inline')
                }
                return !open
              })
            }}
          >
            {t('globalInbox')}{inboxTotal === 0 ? '' : ` ${String(inboxTotal)}`}
          </button>
          {workspaceBack === undefined
            ? null
            : (
              <button
                type="button"
                className={css.select}
                onClick={() => {
                  selectWorkspace(workspaceBack)
                  setWorkspaceBack(undefined)
                }}
              >
                {t('backToWorkspace')}
              </button>
            )}
          {actions[0] === undefined
            ? null
            : <span className={css.meta}>{t('recentActions')} · {actions[0].label}</span>}
          <span className={css.keyboardHint}>{t('keyboardHint')}</span>
        </div>
        {reloadNotice
          ? (
            <div className={css.notice} role="alert">
              <span className={css.noticeText}>{t('reloadRisk')}</span>
              <button type="button" className={css.select} onClick={() => { refresh(); setReloadNotice(false) }}>{t('refresh')}</button>
              <button
                type="button"
                className={css.select}
                onClick={() => {
                  const url = new URL(window.location.href)
                  url.searchParams.set('_reload', String(Date.now()))
                  window.location.replace(url.toString())
                }}
              >
                {t('reloadAnyway')}
              </button>
              <button type="button" className={css.select} onClick={() => { setReloadNotice(false) }}>{t('cancel')}</button>
            </div>
          )
          : null}
        {focus !== undefined
          ? null
          : (
            <form className={css.compose} onSubmit={(event) => {
              event.preventDefault()
              void dispatch(prompt).then((accepted) => {
                if (!accepted) return
                setPrompt('')
                writeDraft(selected, 'prompt', '')
                if (selected !== undefined) channel.current?.postMessage({ kind: 'prompt', workspace: selected, value: '' } satisfies ConsoleMessage)
              })
            }}>
              <textarea
                className={css.prompt}
                value={prompt}
                rows={2}
                placeholder={t('newSessionPrompt')}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setPrompt(value)
                  writeDraft(selected, 'prompt', value)
                  if (selected !== undefined) channel.current?.postMessage({ kind: 'prompt', workspace: selected, value } satisfies ConsoleMessage)
                }}
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
      <div className={css.body}>
        <div
          ref={bodyRef}
          className={rows.length > 12 ? `${css.mainColumn} ${css.compact}` : css.mainColumn}
          onScroll={(event) => {
            if (selected === undefined) return
            const top = event.currentTarget.scrollTop
            if (scrollTimer.current !== undefined) clearTimeout(scrollTimer.current)
            scrollTimer.current = setTimeout(() => {
              const saved: ConsoleUiState = readUiState(selected)
              writeUiState(selected, { ...saved, scrollTop: top })
            }, 200)
          }}
        >
          {focus === undefined
            ? (
              <div className={css.cardBoard} aria-label={t('taskBoard')}>
                <button type="button" className={css.boardToggle} onClick={() => { setCardBoardOpen(open => !open) }}>
                  {cardBoardOpen ? '−' : '+'} {t('taskBoard')}
                </button>
                {cardBoardOpen
                  ? (
                    <>
                      <input
                        className={css.cardInput}
                        value={cardText}
                        placeholder={t('taskCardPlaceholder')}
                        onChange={(event) => {
                          const value = event.currentTarget.value
                          setCardText(value)
                          writeDraft(selected, 'card', value)
                          if (selected !== undefined) channel.current?.postMessage({ kind: 'card', workspace: selected, value } satisfies ConsoleMessage)
                        }}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCard() } }}
                      />
                      <button type="button" className={css.select} onClick={addCard}>{t('addTaskCard')}</button>
                    </>
                  )
                  : null}
                {cards.map(card => (
                  <div
                    key={card.id}
                    className={css.taskCard}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/x-project-console-card', JSON.stringify(card))
                      event.dataTransfer.setData('text/plain', card.text)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                  >
                    <span className={css.taskText} title={card.text}>{card.text}</span>
                    <button
                      type="button"
                      className={css.cardAction}
                      disabled={active === undefined}
                      onClick={() => {
                        if (active !== undefined) dispatchCard(active, JSON.stringify(card))
                      }}
                    >
                      {t('dispatchToSelected')}
                    </button>
                    <button type="button" className={css.cardAction} aria-label={t('removeCard')} onClick={() => { removeCard(card.id) }}>×</button>
                  </div>
                ))}
              </div>
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

          {!inboxOpen && view === 'canvas' ? inboxSideNode : null}

          {(view === 'canvas'
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
                        <article
                          className={`${css.lane} ${lane} ${nested ? css.nestedLane : ''} ${active === session.sessionId ? css.rowActive : ''}`}
                          onDragOver={(event) => { event.preventDefault() }}
                          onDrop={(event) => {
                            event.preventDefault()
                            dispatchCard(session.sessionId, event.dataTransfer.getData('application/x-project-console-card'))
                          }}
                        >
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
                                {session.progress === undefined
                                  ? null
                                  : <span className={css.chip}>{t('progressOf', { done: session.progress.completed, total: session.progress.total })}</span>}
                                {session.usage === undefined
                                  ? null
                                  : <span className={css.chip} title={t('tokensCumulativeHint')}>{t('tokensCumulative', { input: formatTokens(session.usage.inputTokens), output: formatTokens(session.usage.outputTokens) })}</span>}
                                {session.toolCall === undefined
                                  ? null
                                  : <span className={css.chip} title={session.toolCall.arguments}>{t('toolCallLabel', { name: session.toolCall.name })}</span>}
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
                                  onClick={() => { interrupt(session.sessionId) }}
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
                                  onChange={(event) => {
                                    const value = event.currentTarget.value
                                    setReplyText(value)
                                    writeReplyDraft(replyingTo, value)
                                    if (selected !== undefined) channel.current?.postMessage({ kind: 'reply', workspace: selected, sessionId: replyingTo ?? '', value } satisfies ConsoleMessage)
                                  }}
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
                                      writeReplyDraft(session.sessionId, '')
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
              <div className={!inboxOpen && inboxSideNode !== null ? css.studioShell : css.studioShellFull}>
                {!inboxOpen && inboxSideNode !== null
                  ? <aside className={css.studioSide}>{inboxSideNode}</aside>
                  : null}
                {studioMode === 'iso'
                  ? (
                    <IsoStudioView
                      rows={rows}
                      aliases={aliasesMap}
                      statusFacts={statusFacts}
                      descriptorOf={descriptorOf}
                      now={now}
                      t={t}
                      onFocus={focusSession}
                      onOpen={openSession}
                      onDropCard={(sessionId, raw) => { dispatchCard(sessionId, raw) }}
                    />
                  )
                  : (
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
                      onDropCard={(sessionId, raw) => { dispatchCard(sessionId, raw) }}
                    />
                  )}
              </div>
            ))}
        </div>
        {relationView === 'canvas' && !inboxOpen && focus === undefined
          ? (
            <aside className={relationExpanded ? `${css.relationColumn} ${css.relationColumnExpanded}` : css.relationColumn} aria-label={t('relationCanvas')}>
              <div className={css.inboxColumnHead}>
                <span className={css.sectionTitle}>{t('relationCanvas')}</span>
                <button type="button" className={css.select} onClick={() => { setRelationExpanded(open => !open) }}>
                  {relationExpanded ? t('collapse') : t('expand')}
                </button>
                <button type="button" className={css.select} onClick={() => { setRelationView('inline') }}>{t('relationInline')}</button>
              </div>
              <RelationGraph groups={graphGroups} aliases={aliasesMap} t={t} onOpen={focusSession} expanded={relationExpanded} />
            </aside>
          )
          : null}
        {inboxOpen
          ? (
            <aside className={css.inboxColumn} aria-label={t('globalInbox')}>
              <div className={css.inboxColumnHead}>
                <span className={css.sectionTitle}>{t('globalInbox')}</span>
                <button type="button" className={css.select} onClick={() => { setInboxOpen(false) }}>×</button>
              </div>
              <GlobalInbox
                groups={inboxGroups}
                statuses={statusFacts}
                t={t}
                aliases={aliasesMap}
                onOpen={(sessionId) => { openSession(sessionId) }}
                onSwitch={(workspaceId) => { setWorkspaceBack(selected); selectWorkspace(workspaceId) }}
                onApprove={(sessionId) => { approve(sessionId, 'allowed-once') }}
                onReject={(sessionId) => { approve(sessionId, 'rejected') }}
                onAnswer={(sessionId, questionId, label) => {
                  answer(sessionId, { answers: [{ id: questionId, selected: [label] }] })
                }}
              />
            </aside>
          )
          : null}
        {focus === undefined
          ? null
          : (
            <aside className={css.drawerColumn} role="dialog" aria-label={t('focusActive')}>
              <article className={`${css.row} ${css.drawerCard} ${focus.row === undefined ? css.rowIdle : focus.row.status === 'running' ? css.rowRunning : css.rowIdle}`}>
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
                {focus.row?.approval === undefined
                  ? null
                  : (
                    <div className={css.approvalBlock}>
                      <span className={css.meta}>{t('pendingApproval')} · {focus.row.approval.toolName}</span>
                      {focus.row.approval.reason === undefined ? null : <span className={css.meta}>{focus.row.approval.reason}</span>}
                      {focus.row.approval.arguments === undefined
                        ? <span className={css.meta}>{t('approvalArgsUnavailable')}</span>
                        : <code className={css.toolCallArgs}>{focus.row.approval.arguments}</code>}
                    </div>
                  )}
                <div className={css.usageBlock}>
                  <span className={css.meta}>{t('tokensTotalLabel')}</span>
                  {focus.row?.usage === undefined
                    ? <span className={css.meta}>{t('tokensPending')}</span>
                    : (
                      <>
                        <span className={css.meta}>{t('tokensCumulative', { input: formatTokens(focus.row.usage.inputTokens), output: formatTokens(focus.row.usage.outputTokens) })}</span>
                        <span className={css.meta}>{t('tokensTotal', { total: formatTokens(focus.row.usage.totalTokens) })}</span>
                      </>
                    )}
                  {focus.row?.lastUsage === undefined
                    ? null
                    : <span className={css.meta}>{t('tokensLastStep', { input: formatTokens(focus.row.lastUsage.inputTokens), output: formatTokens(focus.row.lastUsage.outputTokens) })}</span>}
                </div>
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
                        onClick={() => { interrupt(focus.sessionId) }}
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
                        onChange={(event) => {
                          const value = event.currentTarget.value
                          setReplyText(value)
                          writeReplyDraft(replyingTo, value)
                          if (selected !== undefined) channel.current?.postMessage({ kind: 'reply', workspace: selected, sessionId: replyingTo ?? '', value } satisfies ConsoleMessage)
                        }}
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
                            writeReplyDraft(focus.sessionId, '')
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
                {actions.length === 0
                  ? null
                  : (
                    <div className={css.actionLog}>
                      <h2 className={css.sectionTitle}>{t('recentActions')}</h2>
                      {actions.slice(0, 4).map(action => <span key={action.id} className={css.actionItem}>{action.label}</span>)}
                    </div>
                  )}
              </article>
            </aside>
          )}
      </div>
      {domainsOpen
        ? (
          <DomainView
            t={t}
            snapshot={devConsoleSnapshot}
            openDomain={devConsoleOpenDomain}
            git={devConsoleGit}
            agents={devConsoleAgents}
            saveAgents={devConsoleSaveAgents}
            autoConfig={devConsoleAutoConfig}
            openSession={openSession}
            onClose={() => { setDomainsOpen(false) }}
          />
        )
        : null}
    </section>
  )
}
