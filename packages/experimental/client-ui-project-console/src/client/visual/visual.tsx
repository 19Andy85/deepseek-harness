/** Visual-language primitives shared by the project console views. */
import { Fragment } from 'react'
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
  /** Sessions finished but unread. */
  readonly completedUnread: number
  /** Remaining idle Sessions. */
  readonly idle: number
}

/** Filter selected from the health segments. */
export type HealthFilter = 'running' | 'needs' | 'completed' | 'idle' | undefined

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
            className={css.legendItem}
            onClick={() => { onFilter(filter === segment.key ? undefined : segment.key) }}
          >
            <StatusDot state={segment.key === 'needs' ? 'attention'
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
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60_000)
    return minutes < 1 ? t('durationSeconds', { n: Math.max(1, Math.round(ms / 1000)) })
      : t('durationMinutes', { n: minutes })
  }
  const text = (entry: ConsoleFocusTimelineEntry) => {
    if (entry.kind === 'baseline') return t('timelineBaseline', { status: statusLabel(entry.to) })
    if (entry.kind === 'status') return t('timelineStatus', { from: statusLabel(entry.from), to: statusLabel(entry.to) })
    if (entry.kind === 'activity') return t('timelineActivity', { value: entry.activity === '' ? t('noActivity') : entry.activity ?? '' })
    return t('timelineEnded')
  }
  return (
    <div className={css.timeline}>
      {entries.map((entry, index) => {
        const next = entries[index + 1]
        const until = next?.at ?? (entry.kind === 'ended' ? entry.at : now)
        return (
          <Fragment key={`${entry.at}-${index}`}>
            <div className={css.timeLine}>
              <span className={css.time}>{formatTime(index === 0 ? startedAt : entry.at)}</span>
              <span className={`${css.eventDot} ${dotOfEntry(entry.kind) ?? ''}`} aria-hidden="true" />
              <span className={css.eventText}>{text(entry)}</span>
              <span className={css.duration}>
                {entry.kind === 'ended' ? '' : formatDuration(Math.max(0, until - entry.at))}
              </span>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
