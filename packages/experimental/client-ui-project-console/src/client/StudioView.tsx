/** Static studio view: one desk per visible Session, a status lamp, and its activity. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import type { ShiftStats } from './day-stats.ts'
import type { AttentionDescriptor } from './attention.ts'
import type { ProjectConsoleKey } from './locales.ts'
import { ActivityTrack, StatusDot } from './visual/visual.tsx'
import css from './StudioView.module.css'

/** Per-Session UI facts the studio desk reads. */
export interface StudioSessionStatus {
  /** Whether the Session has an unseen completion. */
  readonly completionUnread?: boolean
}

/**
 * Render the studio floor.
 * @param props - rows, status facts, the dictionary, and the desk click action.
 * @returns the studio floor.
 */
export function StudioView({
  rows, statusFacts, descriptorOf, shift, now, t, onFocus, onResetShift,
}: {
  readonly rows: readonly SessionTaskView[]
  readonly statusFacts: ReadonlyMap<string, StudioSessionStatus>
  readonly descriptorOf: (sessionId: string) => AttentionDescriptor | undefined
  readonly shift: ShiftStats | undefined
  readonly now: number
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onFocus: (sessionId: string) => void
  readonly onResetShift: () => void
}) {
  const counters = shift === undefined ? [] : [
    { key: 'newSession' as const, label: t('shiftNewSessions'), count: shift.newSession },
    { key: 'completed' as const, label: t('shiftCompleted'), count: shift.completed },
    { key: 'dispatched' as const, label: t('shiftDispatched'), count: shift.dispatched },
    { key: 'interrupted' as const, label: t('shiftInterrupted'), count: shift.interrupted },
    { key: 'approvals' as const, label: t('shiftApprovals'), count: shift.approvals },
    { key: 'questions' as const, label: t('shiftQuestions'), count: shift.questions },
  ].filter(counter => counter.count > 0)
  return (
    <section className={css.floor} aria-label={t('studioTitle')}>
      <div className={css.floorHead}>
        <h2 className={css.floorTitle}>{t('studioTitle')}</h2>
        <span className={css.hint}>{t('studioHint')}</span>
      </div>
      <div className={css.grid}>
        {rows.map((row) => {
          const pending = descriptorOf(row.sessionId) !== undefined
          const unread = statusFacts.get(row.sessionId)?.completionUnread === true
          const lamp = row.stalled === true ? 'error'
            : pending ? 'attention' : unread ? 'success' : row.status === 'running' ? 'running' : 'idle'
          const initials = (row.title ?? t('untitled')).slice(0, 2)
          return (
            <button
              key={row.sessionId}
              type="button"
              className={`${css.desk} ${pending ? css.deskAttention : ''}`}
              onClick={() => { onFocus(row.sessionId) }}
              aria-label={`${row.title ?? t('untitled')} · ${row.status === 'running' ? t('running') : t('idle')}`}
            >
              <div className={css.deskTop}>
                <span className={css.avatar} aria-hidden="true">{initials}</span>
                <div className={css.identity}>
                  <span className={css.name} title={row.title ?? row.sessionId}>{row.title ?? t('untitled')}</span>
                  <span className={css.deskStatus}>
                    <StatusDot state={lamp} />
                    {row.status === 'running' ? t('running') : t('idle')}
                    {pending ? ` · ${t('needsYou')}` : ''}
                    {unread ? ` · ${t('completedUnread')}` : ''}
                    {row.stalled === true ? ` · ${t('stalled')}` : ''}
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
        })}
      </div>
      {rows.length === 0 ? <div className={css.empty}>{t('studioEmpty')}</div> : null}
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
