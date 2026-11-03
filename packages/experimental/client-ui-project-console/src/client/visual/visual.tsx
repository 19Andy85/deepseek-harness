/** Visual-language primitives shared by the project console views. */
import { Fragment } from 'react'
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import { JobIcon, ScheduleIcon, SubagentIcon, TurnIcon } from '../icons.tsx'
import type { ConsoleFocusTimelineEntry } from '../ProjectConsoleStore.ts'
import type { ProjectConsoleKey } from '../locales.ts'
import css from './visual.module.css'

/** Semantic state of one Session or activity. */
export type VisualState = 'running' | 'attention' | 'success' | 'error' | 'idle' | 'unknown'

/**
 * Render the dot that encodes one semantic state.
 * @param props - semantic state.
 * @returns the status dot.
 */
export function StatusDot({ state }: { readonly state: VisualState }) {
  const variant = state === 'running' ? css.dotRunning
    : state === 'attention' ? css.dotAttention
      : state === 'success' ? css.dotSuccess
        : state === 'error' ? css.dotError
          : state === 'unknown' ? css.dotUnknown : css.dot
  return <span className={`${css.dot} ${variant ?? ''}`} aria-hidden="true" />
}

/** Counts of one project's health categories, in priority order. */
export interface HealthCountsView {
  /** Sessions running a turn. */
  readonly running: number
  /** Sessions waiting for the user. */
  readonly needsYou: number
  /** Sessions whose last finished turn failed. */
  readonly failed: number
  /** Sessions finished but unread. */
  readonly completedUnread: number
  /** Remaining idle Sessions. */
  readonly idle: number
}

/** Filter selected from the health segments. */
export type HealthFilter = 'running' | 'needs' | 'failed' | 'completed' | 'idle' | undefined

/**
 * Render the proportional project state bar and its legend.
 * @param props - counts, the selected filter, the dictionary, and the filter callback.
 * @returns the status bar.
 */
export function HealthSegments({
  counts, filter, t, onFilter,
}: {
  readonly counts: HealthCountsView
  readonly filter: HealthFilter
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onFilter: (filter: HealthFilter) => void
}) {
  const segments = [
    { key: 'needs' as const, count: counts.needsYou, label: t('needsYou'), className: css.segmentAttention },
    { key: 'failed' as const, count: counts.failed, label: t('failed'), className: css.segmentError },
    { key: 'running' as const, count: counts.running, label: t('running'), className: css.segmentRunning },
    { key: 'completed' as const, count: counts.completedUnread, label: t('completedUnread'), className: css.segmentSuccess },
    { key: 'idle' as const, count: counts.idle, label: t('idle'), className: css.segmentIdle },
  ]
  const total = segments.reduce((sum, segment) => sum + segment.count, 0)
  return (
    <div className={css.health}>
      <div className={css.healthBar} role="group" aria-label={t('healthLabel')}>
        {total === 0 ? null : segments.map(segment => segment.count === 0 ? null : (
          <button
            key={segment.key}
            type="button"
            className={`${css.segment} ${segment.className} ${filter === segment.key ? css.segmentSelected : ''}`}
            style={{ width: `${String((segment.count / total) * 100)}%` }}
            aria-label={t('healthSegment', { label: segment.label, count: segment.count })}
            onClick={() => { onFilter(filter === segment.key ? undefined : segment.key) }}
          />
        ))}
      </div>
      <div className={css.legend}>
        {segments.map(segment => (
          <button
            key={segment.key}
            type="button"
            className={segment.count === 0 ? `${css.legendItem} ${css.legendItemZero}` : css.legendItem}
            onClick={() => { onFilter(filter === segment.key ? undefined : segment.key) }}
          >
            <StatusDot state={segment.key === 'needs' ? 'attention'
              : segment.key === 'failed' ? 'error'
                : segment.key === 'running' ? 'running'
                  : segment.key === 'completed' ? 'success' : 'idle'} />
            <span>{segment.label}</span>
            <span className={css.legendCount}>{segment.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Format a duration for the console.
 * @param ms - duration in milliseconds.
 * @param t - page dictionary.
 * @returns compact duration text.
 */
export function formatDuration(
  ms: number,
  t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string,
): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return t('durationSeconds', { n: Math.max(1, Math.round(ms / 1_000)) })
  const hours = Math.floor(minutes / 60)
  if (hours < 1) return t('durationMinutes', { n: minutes })
  if (hours < 24) return t('durationHours', { n: hours })
  return t('durationDays', { n: Math.floor(hours / 24) })
}

/**
 * Compact token count for console chips.
 * @param value - token count.
 * @returns a short human-readable count.
 */
export function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

/** Display label of one activity family. */
export function activityKindLabel(
  kind: string,
  t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string,
): string {
  if (kind === 'turn') return t('activityTurn')
  if (kind === 'job') return t('activityJob')
  if (kind === 'subagent') return t('activitySubagent')
  if (kind === 'schedule') return t('activitySchedule')
  return kind
}

/** Marker that distinguishes a relation-bearing activity family. */
export function activitySymbol(kind: string): string {
  if (kind === 'turn') return '▶'
  if (kind === 'job') return '▣'
  if (kind === 'subagent') return '↳'
  if (kind === 'schedule') return '⏱'
  return '•'
}

/**
 * Render one Session's running activity families as an activity track.
 * @param props - activity families, the dictionary, and whether the row runs.
 * @returns the activity track.
 */
export function ActivityTrack({
  activity, t, running, now, onFocus,
}: {
  readonly activity: SessionTaskView['activity']
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly running: boolean
  readonly now?: number
  readonly onFocus?: () => void
}) {
  if (activity.length === 0) {
    return <div className={css.trackEmpty}>{t('noActivity')}</div>
  }
  return (
    <div className={css.track}>
      {activity.map((entry) => {
        const items = entry.items?.map(item => item.label ?? item.id) ?? []
        return (
          <div key={entry.kind} className={css.trackGroup}>
            <span className={running ? `${css.trackLead} ${css.trackRunning}` : css.trackLead}>
              {entry.kind === 'turn' ? <TurnIcon /> : entry.kind === 'job' ? <JobIcon />
                : entry.kind === 'subagent' ? <SubagentIcon /> : entry.kind === 'schedule' ? <ScheduleIcon />
                  : <span aria-hidden="true">•</span>}
            </span>
            <span className={css.trackLabel}>{activityKindLabel(entry.kind, t)}</span>
            {entry.startedAt === undefined || now === undefined
              ? null
              : <span className={css.trackAge}>{t('activityAge', { duration: formatDuration(now - entry.startedAt, t) })}</span>}
            {items.slice(0, 3).map(item => (
              <span key={item} className={`${css.trackItem} ${css[`item_${entry.kind}`] ?? ''}`} title={item}>{item}</span>
            ))}
            {items.length > 3 ? <span className={css.trackItem}>+{items.length - 3}</span> : null}
          </div>
        )
      })}
      {onFocus === undefined ? null : (
        <button type="button" className={css.trackAction} onClick={onFocus}>{t('focusSession')}</button>
      )}
    </div>
  )
}

function dotOfEntry(kind: ConsoleFocusTimelineEntry['kind']): string | undefined {
  if (kind === 'status') return css.eventDotStatus
  if (kind === 'ended') return css.eventDotError
  if (kind === 'baseline') return css.eventDotSuccess
  return css.eventDot
}

/**
 * Render one observed-change timeline with a time axis, event dots, and durations.
 * @param props - observed entries, the observation start, the dictionary, and the current time.
 * @returns the timeline.
 */
export function Timeline({
  entries, startedAt, now, t,
}: {
  readonly entries: readonly ConsoleFocusTimelineEntry[]
  readonly startedAt: number
  readonly now: number
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
}) {
  const statusLabel = (status: string | undefined) => status === 'running' ? t('running')
    : status === 'idle' ? t('idle') : (status ?? t('unknown'))
  const formatTime = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour12: false })
  const text = (entry: ConsoleFocusTimelineEntry) => {
    if (entry.kind === 'baseline') return t('timelineBaseline', { status: statusLabel(entry.to) })
    if (entry.kind === 'status') return t('timelineStatus', { from: statusLabel(entry.from), to: statusLabel(entry.to) })
    if (entry.kind === 'activity') {
      const kinds = entry.activity === undefined || entry.activity === ''
        ? t('noActivity')
        : entry.activity.split(',').map(kind => `${activitySymbol(kind)} ${activityKindLabel(kind, t)}`).join(' + ')
      return t('timelineActivity', { value: kinds })
    }
    return t('timelineEnded')
  }
  const durations = entries.map((entry, index) => {
    const next = entries[index + 1]
    const until = next?.at ?? (entry.kind === 'ended' ? entry.at : now)
    return Math.max(0, until - entry.at)
  })
  const maxDuration = Math.max(1, ...durations)
  return (
    <div className={css.timeline}>
      {entries.map((entry, index) => {
        const duration = durations[index] ?? 0
        const fill = entry.kind === 'ended' ? css.intervalError
          : entry.kind === 'activity' ? css.intervalActivity
            : entry.kind === 'baseline'
              ? (entry.to === 'running' ? css.intervalStatus : css.intervalActivity)
              : entry.kind === 'status'
                ? (entry.to === 'idle' ? css.intervalSuccess : css.intervalStatus)
                : css.intervalActivity
        return (
          <Fragment key={`${entry.at}-${index}`}>
            <div className={css.timeLine}>
              <span className={css.time}>{formatTime(index === 0 ? startedAt : entry.at)}</span>
              <span className={`${css.eventDot} ${dotOfEntry(entry.kind) ?? ''}`} aria-hidden="true" />
              <span className={css.eventText}>{text(entry)}</span>
              <span className={css.interval} aria-hidden="true">
                {entry.kind === 'ended' ? null : (
                  <span
                    className={`${css.intervalFill} ${fill}`}
                    style={{ width: `${String(Math.max(3, Math.round((duration / maxDuration) * 100)))}%` }}
                  />
                )}
              </span>
              <span className={css.duration}>
                {entry.kind === 'ended' ? '' : formatDuration(duration, t)}
              </span>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
