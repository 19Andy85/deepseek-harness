/** Studio view: zones, room health, completion tray, and the shift summary over live sessions. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import type { ShiftStats } from './day-stats.ts'
import type { AttentionDescriptor } from './attention.ts'
import type { ProjectConsoleKey } from './locales.ts'
import { DeskIcon } from './icons.tsx'
import { identityOf } from './partner-identity.ts'
import { PartnerAvatar } from './PartnerAvatar.tsx'
import { ActivityTrack, StatusDot } from './visual/visual.tsx'
import css from './StudioView.module.css'

/** Per-Session UI facts the studio desk reads. */
export interface StudioSessionStatus {
  /** Whether the Session has an unseen completion. */
  readonly completionUnread?: boolean
}

/**
 * Render the studio floor, zones, room health, and trays.
 * @param props - rows, aliases, status facts, the dictionary, and desk actions.
 * @returns the studio surface.
 */
export function StudioView({
  rows, aliases, statusFacts, descriptorOf, shift, now, t, onFocus, onResetShift, onOpen,
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
  const unreadRows = rows.filter(row => statusFacts.get(row.sessionId)?.completionUnread === true)
  const unreadIds = new Set(unreadRows.map(row => row.sessionId))
  const pendingCount = rows.filter(row => descriptorOf(row.sessionId) !== undefined).length
  const failedCount = rows.filter(row => row.outcome === 'failed').length
  const meetingParents = rows.filter(row => row.relations?.children?.some(child => visible.has(child.sessionId)) === true)
  const meetingParentIds = new Set(meetingParents.map(row => row.sessionId))
  const meetingChildIds = new Set(meetingParents.flatMap(row => row.relations?.children?.map(child => child.sessionId) ?? []))
  const activeRows = rows.filter(row => !unreadIds.has(row.sessionId) && !meetingParentIds.has(row.sessionId)
    && !meetingChildIds.has(row.sessionId)
    && (row.status === 'running' || descriptorOf(row.sessionId) !== undefined))
  const restRows = rows.filter(row => !unreadIds.has(row.sessionId) && !meetingParentIds.has(row.sessionId)
    && !meetingChildIds.has(row.sessionId)
    && row.status !== 'running' && descriptorOf(row.sessionId) === undefined)
  const desk = (row: SessionTaskView, nested: boolean) => {
    const pending = descriptorOf(row.sessionId) !== undefined
    const unread = statusFacts.get(row.sessionId)?.completionUnread === true
    const lamp = row.outcome === 'failed' || row.stalled === true ? 'error'
      : pending ? 'attention' : unread ? 'success' : row.status === 'running' ? 'running' : 'idle'
    const identity = identityOf(row, aliases)
    return (
      <button
        key={row.sessionId}
        type="button"
        className={`${css.desk} ${pending ? css.deskAttention : ''} ${nested ? css.deskDerived : ''}`}
        onClick={() => { onFocus(row.sessionId) }}
        aria-label={`${identity.name} · ${row.status === 'running' ? t('running') : t('idle')}`}
      >
        <div className={css.deskTop}>
          <PartnerAvatar name={identity.name} initial={identity.initial} role={identity.role} size={nested ? 28 : 36} />
          <div className={css.identity}>
            <span className={css.name} title={row.title ?? row.sessionId}>{identity.name}</span>
            <span className={css.deskStatus}>
              <StatusDot state={lamp} />
              {row.status === 'running' ? t('running') : t('idle')}
              {pending ? ` · ${t('needsYou')}` : ''}
              {unread ? ` · ${t('completedUnread')}` : ''}
              {row.stalled === true ? ` · ${t('stalled')}` : ''}
              {row.outcome === 'failed' ? ` · ${t('failed')}` : ''}
            </span>
          </div>
          <span className={`${css.lamp} ${css[`lamp_${lamp}`] ?? ''}`} aria-hidden="true" />
        </div>
        <div className={css.deskBody}>
          <ActivityTrack activity={row.activity} t={t} running={row.status === 'running'} now={now} />
        </div>
        {row.lastPromptAt === undefined ? null : (
          <span className={css.deskFoot}>
            {new Date(row.lastPromptAt).toLocaleTimeString(undefined, { hour12: false })}
          </span>
        )}
      </button>
    )
  }
  const zone = (title: string, zoneRows: readonly SessionTaskView[]) => (zoneRows.length === 0 ? null : (
    <div className={css.zone}>
      <h3 className={css.zoneTitle}>{title}</h3>
      <div className={css.zoneGrid}>{zoneRows.map(row => desk(row, false))}</div>
    </div>
  ))
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
      <div className={css.studioGrid}>
        <div className={css.zones}>
          {zone(t('zoneActive'), activeRows)}
          {meetingParents.length === 0 ? null : (
            <div className={css.zone}>
              <h3 className={css.zoneTitle}>{t('zoneMeeting')}</h3>
              {meetingParents.map(parent => (
                <div key={parent.sessionId} className={css.meetingGroup}>
                  {desk(parent, false)}
                  <div className={css.meetingChildren}>
                    {(parent.relations?.children ?? [])
                      .map(child => visible.get(child.sessionId))
                      .filter((child): child is SessionTaskView => child !== undefined)
                      .map(child => desk(child, true))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {zone(t('zoneRest'), restRows)}
          {activeRows.length + restRows.length + meetingParents.length === 0
            ? (
              <div className={css.empty}>
                <DeskIcon className={css.emptyIcon} />
                <p className={css.emptyTitle}>{t('studioEmpty')}</p>
                <p className={css.emptyHint}>{t('studioEmptyHint')}</p>
              </div>
            )
            : null}
        </div>
        <aside className={css.completionTray} aria-label={t('completionTray')}>
          <h3 className={css.zoneTitle}>{t('completionTray')} {unreadRows.length}</h3>
          {unreadRows.length === 0
            ? <p className={css.trayEmpty}>{t('noCompletion')}</p>
            : unreadRows.map((row) => {
              const identity = identityOf(row, aliases)
              return (
                <div key={row.sessionId} className={css.completionCard}>
                  <div className={css.deskTop}>
                    <PartnerAvatar name={identity.name} initial={identity.initial} role={identity.role} size={26} />
                    <span className={css.name} title={row.title ?? row.sessionId}>{identity.name}</span>
                  </div>
                  {row.changes === undefined
                    ? null
                    : <span className={css.trayMeta}>{t('changesSummary', { n: row.changes.total, added: row.changes.added, deleted: row.changes.deleted })}</span>}
                  <div className={css.trayActions}>
                    <button type="button" className={css.select} onClick={() => { onFocus(row.sessionId) }}>{t('focusSession')}</button>
                    <button type="button" className={css.select} onClick={() => { onOpen(row.sessionId) }}>{t('openSession')}</button>
                  </div>
                </div>
              )
            })}
        </aside>
      </div>
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
