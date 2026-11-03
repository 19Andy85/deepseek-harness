/** Studio team board: one card per team, sorted by urgency, with live children and a completion strip. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import type { ShiftStats } from './day-stats.ts'
import type { AttentionDescriptor } from './attention.ts'
import type { ProjectConsoleKey } from './locales.ts'
import { DeskIcon } from './icons.tsx'
import { identityOf, type PartnerRole } from './partner-identity.ts'
import { PartnerAvatar } from './PartnerAvatar.tsx'
import { ActivityTrack, formatTokens, StatusDot } from './visual/visual.tsx'
import css from './StudioView.module.css'

/** Per-Session UI facts the studio card reads. */
export interface StudioSessionStatus {
  /** Whether the Session has an unseen completion. */
  readonly completionUnread?: boolean
}

/**
 * Render the studio team board, room health, and completion strip.
 * @param props - rows, aliases, status facts, the dictionary, and card actions.
 * @returns the studio surface.
 */
export function StudioView({
  rows, aliases, statusFacts, descriptorOf, shift, now, t, onFocus, onResetShift, onOpen, onDropCard,
}: {
  readonly rows: readonly SessionTaskView[]
  readonly aliases: ReadonlyMap<string, string>
  readonly statusFacts: ReadonlyMap<string, StudioSessionStatus>
  readonly descriptorOf: (sessionId: string) => AttentionDescriptor | undefined
  readonly shift: ShiftStats | undefined
  readonly now: number
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onFocus: (sessionId: string) => void
  readonly onResetShift: () => void
  readonly onOpen: (sessionId: string) => void
  readonly onDropCard: (sessionId: string, raw: string) => void
}) {
  const counters = shift === undefined ? [] : [
    { key: 'newSession' as const, label: t('shiftNewSessions'), count: shift.newSession },
    { key: 'completed' as const, label: t('shiftCompleted'), count: shift.completed },
    { key: 'dispatched' as const, label: t('shiftDispatched'), count: shift.dispatched },
    { key: 'interrupted' as const, label: t('shiftInterrupted'), count: shift.interrupted },
    { key: 'approvals' as const, label: t('shiftApprovals'), count: shift.approvals },
    { key: 'questions' as const, label: t('shiftQuestions'), count: shift.questions },
  ].filter(counter => counter.count > 0)
  const visible = new Map(rows.map(row => [row.sessionId, row]))
  const childIds = new Set<string>()
  for (const row of rows) {
    for (const child of row.relations?.children ?? []) {
      if (visible.has(child.sessionId)) childIds.add(child.sessionId)
    }
  }
  const unreadRows = rows.filter(row => statusFacts.get(row.sessionId)?.completionUnread === true)
  const pendingCount = rows.filter(row => descriptorOf(row.sessionId) !== undefined).length
  const failedCount = rows.filter(row => row.outcome === 'failed').length
  const priority = (row: SessionTaskView): number => {
    if (descriptorOf(row.sessionId) !== undefined) return 0
    if (row.outcome === 'failed' || row.stalled === true) return 1
    if (row.status === 'running') return 2
    if (statusFacts.get(row.sessionId)?.completionUnread === true) return 3
    return 4
  }
  const teams = rows
    .filter(row => !childIds.has(row.sessionId))
    .map((row) => {
      const children = (row.relations?.children ?? [])
        .map(child => visible.get(child.sessionId))
        .filter((child): child is SessionTaskView => child !== undefined)
      const ended = (row.relations?.children?.length ?? 0) - children.length
      return { row, children, ended }
    })
    .sort((left, right) => priority(left.row) - priority(right.row))
  const roleLabel = (role: PartnerRole): ProjectConsoleKey => {
    const keys: Record<PartnerRole, ProjectConsoleKey> = {
      analysis: 'roleAnalysis',
      implementation: 'roleImplementation',
      research: 'roleResearch',
      operation: 'roleOperation',
      guard: 'roleGuard',
      general: 'roleGeneral',
    }
    return keys[role]
  }
  const stateLabel = (row: SessionTaskView): string => {
    if (descriptorOf(row.sessionId) !== undefined) return t('needsYou')
    if (row.outcome === 'failed') return t('failed')
    if (row.status === 'running') return t('running')
    if (statusFacts.get(row.sessionId)?.completionUnread === true) return t('completedUnread')
    return t('idle')
  }
  const teamCard = (row: SessionTaskView, children: readonly SessionTaskView[], ended: number) => {
    const pending = descriptorOf(row.sessionId) !== undefined
    const identity = identityOf(row, aliases)
    const lamp = row.outcome === 'failed' || row.stalled === true ? 'error'
      : pending ? 'attention' : row.status === 'running' ? 'running' : 'idle'
    return (
      <article
        key={row.sessionId}
        className={`${css.teamCard} ${pending ? css.teamPending : ''} ${row.status === 'running' ? css.teamRunning : ''}`}
        onClick={() => { onFocus(row.sessionId) }}
        onDragOver={(event) => { event.preventDefault() }}
        onDrop={(event) => {
          event.preventDefault()
          onDropCard(row.sessionId, event.dataTransfer.getData('application/x-project-console-card'))
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFocus(row.sessionId) } }}
        aria-label={`${identity.name} · ${stateLabel(row)}`}
      >
        <div className={css.teamHead}>
          <PartnerAvatar name={identity.name} initial={identity.initial} role={identity.role} size={34} />
          <div className={css.teamIdentity}>
            <span className={css.teamName} title={row.title ?? row.sessionId}>{identity.name}</span>
            <span className={css.teamMeta}>
              {t(roleLabel(identity.role))}
              {' · '}
              <StatusDot state={lamp} />
              {stateLabel(row)}
              {row.usage === undefined
                ? null
                : (
                  <span className={css.teamToken} title={t('tokensCumulativeHint')}>
                    {t('tokensCumulative', { input: formatTokens(row.usage.inputTokens), output: formatTokens(row.usage.outputTokens) })}
                  </span>
                )}
            </span>
          </div>
          {children.length === 0 ? null : <span className={css.collabBadge}>{children.length + ' ' + t('activitySubagent')}</span>}
        </div>
        <ActivityTrack activity={row.activity} t={t} running={row.status === 'running'} now={now} />
        {children.length === 0 && ended === 0
          ? null
          : (
            <div className={css.teamFoot}>
              {children.slice(0, 3).map((child) => {
                const childName = identityOf(child, aliases).name
                return (
                  <button
                    key={child.sessionId}
                    type="button"
                    className={css.teamChild}
                    onClick={(event) => { event.stopPropagation(); onFocus(child.sessionId) }}
                  >
                    {childName}
                  </button>
                )
              })}
              {children.length > 3 ? <span className={css.teamFootMore}>{'+'}{children.length - 3}{' '}{t('running')}</span> : null}
              {ended > 0 ? <span className={css.teamFootMore}>+{ended}{' '}{t('completedUnread')}</span> : null}
            </div>
          )}
      </article>
    )
  }
  return (
    <section className={css.floor} aria-label={t('studioTitle')}>
      <div className={css.floorHead}>
        <h2 className={css.floorTitle}>{t('studioTitle')}</h2>
        <span className={css.hint}>{t('studioHint')}</span>
      </div>
      <div className={css.roomHealth}>
        <span className={css.roomLabel}>{t('roomHealthLabel')}</span>
        <div className={css.roomBar}>
          <span
            className={css.roomMarker}
            style={{ left: `${String(Math.min(100, (pendingCount + failedCount) * 18))}%` }}
          />
        </div>
        <span className={css.roomText}>{t('roomHealth', { needs: pendingCount, failed: failedCount })}</span>
      </div>
      <div className={css.teamBoardHead}>
        <h3 className={css.teamBoardTitle}>{t('teamBoardTitle')}</h3>
        <span className={css.teamBoardHint}>{t('teamBoardHint')}</span>
      </div>
      <div className={css.teamBoard}>
        {teams.length === 0
          ? (
            <div className={css.empty}>
              <DeskIcon className={css.emptyIcon} />
              <p className={css.emptyTitle}>{t('studioEmpty')}</p>
              <p className={css.emptyHint}>{t('studioEmptyHint')}</p>
            </div>
          )
          : teams.map(team => teamCard(team.row, team.children, team.ended))}
      </div>
      {unreadRows.length === 0
        ? null
        : (
          <section className={css.completionStrip} aria-label={t('completionTray')}>
            <h3 className={css.zoneTitle}>{t('completionTray')} {unreadRows.length}</h3>
            <div className={css.completionStripBody}>
              {unreadRows.map((row) => {
                const identity = identityOf(row, aliases)
                return (
                  <div key={row.sessionId} className={css.completionChip}>
                    <PartnerAvatar name={identity.name} initial={identity.initial} role={identity.role} size={20} />
                    <span className={css.teamChild}>{identity.name}</span>
                    <button type="button" className={css.select} onClick={() => { onFocus(row.sessionId) }}>{t('focusSession')}</button>
                    <button type="button" className={css.select} onClick={() => { onOpen(row.sessionId) }}>{t('openSession')}</button>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      <section className={css.shift} aria-label={t('shiftTitle')}>
        <div className={css.shiftHead}>
          <h3 className={css.shiftTitle}>{t('shiftTitle')}</h3>
          {shift === undefined ? null : (
            <span className={css.shiftSince}>
              {t('shiftSince', { time: new Date(shift.since).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) })}
            </span>
          )}
          <button type="button" className={css.shiftReset} onClick={() => { onResetShift() }}>{t('shiftReset')}</button>
        </div>
        {counters.length === 0
          ? <div className={css.shiftEmpty}>{t('shiftEmpty')}</div>
          : (
            <div className={css.shiftCounters}>
              {counters.map(counter => (
                <span key={counter.key} className={css.shiftCounter}>
                  <span className={css.shiftCount}>{counter.count}</span>
                  {counter.label}
                </span>
              ))}
            </div>
          )}
        <p className={css.shiftHint}>{t('shiftHint')}</p>
      </section>
    </section>
  )
}
