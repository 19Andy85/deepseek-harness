/** Isometric studio: one small room per team, with live desks for parents and children. */
import type { SessionTaskView } from '@deepseek-ai/dsh-experimental-api-session-tasks/types'
import type { AttentionDescriptor } from './attention.ts'
import type { ProjectConsoleKey } from './locales.ts'
import { identityOf } from './partner-identity.ts'
import { formatTokens, type VisualState } from './visual/visual.tsx'
import type { StudioSessionStatus } from './StudioView.tsx'
import css from './IsoStudioView.module.css'

interface IsoProps {
  readonly rows: readonly SessionTaskView[]
  readonly aliases: ReadonlyMap<string, string>
  readonly statusFacts: ReadonlyMap<string, StudioSessionStatus>
  readonly descriptorOf: (sessionId: string) => AttentionDescriptor | undefined
  readonly now: number
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onFocus: (sessionId: string) => void
  readonly onOpen: (sessionId: string) => void
  readonly onDropCard: (sessionId: string, raw: string) => void
}

interface Team {
  readonly parent: SessionTaskView
  readonly children: readonly SessionTaskView[]
  readonly urgency: number
}

const S = 22

function teamUrgency(row: SessionTaskView, descriptorOf: IsoProps['descriptorOf'], statusFacts: IsoProps['statusFacts']): number {
  if (descriptorOf(row.sessionId) !== undefined) return 0
  if (row.outcome === 'failed' || row.stalled === true) return 1
  if (row.status === 'running') return 2
  if (statusFacts.get(row.sessionId)?.completionUnread === true) return 3
  return 4
}

function stateOf(row: SessionTaskView, unread: boolean): VisualState {
  if (row.outcome === 'failed') return 'error'
  if (row.status === 'running') return 'running'
  if (unread) return 'success'
  return 'idle'
}

function teamsOf(rows: readonly SessionTaskView[]): Team[] {
  const visible = new Map(rows.map(row => [row.sessionId, row]))
  const childIds = new Set<string>()
  for (const row of rows) for (const child of row.relations?.children ?? []) if (visible.has(child.sessionId)) childIds.add(child.sessionId)
  const parents = rows.filter(row => !childIds.has(row.sessionId))
  const teams = parents.length > 0 ? parents : rows
  return teams.map(parent => ({
    parent,
    children: (parent.relations?.children ?? [])
      .map(child => visible.get(child.sessionId))
      .filter((child): child is SessionTaskView => child !== undefined),
    urgency: 0,
  }))
}

/**
 * Render one isometric room per team.
 * @param props - rows, aliases, status facts, the dictionary, and card actions.
 * @returns the isometric studio.
 */
export function IsoStudioView(props: IsoProps) {
  const { rows, aliases, statusFacts, descriptorOf, now, t, onFocus, onDropCard } = props
  const teams = teamsOf(rows)
    .map(team => ({ ...team, urgency: teamUrgency(team.parent, descriptorOf, statusFacts) }))
    .sort((left, right) => left.urgency - right.urgency || (right.parent.lastPromptAt ?? 0) - (left.parent.lastPromptAt ?? 0))
  if (teams.length === 0) {
    return (
      <div className={css.empty}>
        <span>{t('studioEmpty')}</span>
        <span className={css.emptyHint}>{t('studioEmptyHint')}</span>
      </div>
    )
  }
  return (
    <div className={css.studio}>
      <div className={css.head}>
        <span className={css.title}>{t('isoStudioTitle')}</span>
        <span className={css.hint}>{t('isoStudioHint')}</span>
      </div>
      <div className={css.grid}>
        {teams.map((team) => {
          const row = team.parent
          const unread = statusFacts.get(row.sessionId)?.completionUnread === true
          const state = stateOf(row, unread)
          const identity = identityOf(row, aliases)
          const activeChildren = team.children.filter(child => child.status === 'running' || descriptorOf(child.sessionId) !== undefined)
          const done = team.children.filter(child => child.status !== 'running').length
          return (
            <div
              key={row.sessionId}
              className={`${css.room} ${state === 'running' ? css.running : ''} ${descriptorOf(row.sessionId) === undefined ? '' : css.needs}`}
              role="button"
              tabIndex={0}
              aria-label={`${identity.name} · ${t(state === 'running' ? 'running' : 'idle')}`}
              onClick={() => { onFocus(row.sessionId) }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFocus(row.sessionId) } }}
              onDragOver={(event) => { event.preventDefault() }}
              onDrop={(event) => {
                event.preventDefault()
                const raw = event.dataTransfer.getData('application/x-project-console-card')
                if (raw !== '') onDropCard(row.sessionId, raw)
              }}
            >
              <div className={css.roomHead}>
                <span className={css.roomName}>{identity.name}</span>
                <span className={css.roomMeta}>
                  {descriptorOf(row.sessionId) !== undefined
                    ? t('needsYou')
                    : state === 'running'
                      ? t('running')
                      : state === 'error'
                        ? t('failed')
                        : unread ? t('completedUnread') : t('idle')}
                  {team.children.length === 0 ? '' : ` · ${String(team.children.length)} ${t('activitySubagent')}`}
                </span>
              </div>
              <svg className={css.canvas} viewBox="0 0 480 250" aria-hidden="true">
                <defs>
                  <linearGradient id={`floor-${row.sessionId}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={state === 'running' ? '#1d2b25' : state === 'error' ? '#2b1f1f' : '#202027'} />
                    <stop offset="1" stopColor="#1a1a1f" />
                  </linearGradient>
                </defs>
                <polygon points={floorPoints()} fill={`url(#floor-${row.sessionId})`} stroke={state === 'running' ? '#335c48' : state === 'error' ? '#6a3434' : '#363640'} strokeWidth="1" />
                <polygon points={wallPoints()} fill="#232329" stroke="#34343c" strokeWidth="1" opacity="0.9" />
                {descriptorOf(row.sessionId) === undefined ? null : <ellipse cx={ORIGIN.x + 18} cy={ORIGIN.y + 36} rx="78" ry="34" fill="#d9a441" opacity="0.14" />}
                {desk(2.0, 2.9, state)}
                {team.children.slice(0, 4).map((child, index) => (
                  <g key={child.sessionId} onClick={(event) => { event.stopPropagation(); onFocus(child.sessionId) }} className={css.seat} role="button">
                    {seat(5.8, 2.0 + index * 1.5, child.status === 'running' ? 'running' : 'idle')}
                    <text className={css.seatLabel} x={point(6.9, 2.55 + index * 1.5, 1.15).x} y={point(6.9, 2.55 + index * 1.5, 1.15).y} textAnchor="middle">{identityOf(child, aliases).name.slice(0, 8)}</text>
                  </g>
                ))}
                {activeChildren.length > 0 ? table(7.3, 5.0) : null}
                {done === 0 ? null : (
                  <>
                    {shelf(2.0, 6.6)}
                    <text className={css.hintText} x={point(3.2, 6.9, 1.5).x} y={point(3.2, 6.9, 1.5).y}>{`+${String(done)}`}</text>
                  </>
                )}
              </svg>
              <div className={css.foot}>
                <span className={state === 'running' ? css.live : css.muted}>{t(state === 'running' ? 'running' : state === 'error' ? 'failed' : unread ? 'completedUnread' : 'idle')}</span>
                {row.usage === undefined ? null : <span className={css.muted}>{formatTokens(row.usage.totalTokens)} tok</span>}
                {row.lastPromptAt === undefined
                  ? null
                  : <span className={css.muted}>{Math.max(0, Math.round((now - row.lastPromptAt) / 60_000))}m</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ORIGIN = { x: 240, y: 88 }
const point = (x: number, y: number, z = 0) => ({
  x: ORIGIN.x + (x - y) * Math.cos(Math.PI / 6) * S,
  y: ORIGIN.y + (x + y) * Math.sin(Math.PI / 6) * S - z * S,
})
const floorPoints = () => [[0, 0], [10, 0], [10, 8], [0, 8]].map(([x, y]) => { const p = point(x ?? 0, y ?? 0); return `${p.x},${p.y}` }).join(' ')
const wallPoints = () => [[0, 0, 0], [10, 0, 0], [10, 0, 1.2], [0, 0, 1.2]].map(([x, y, z]) => { const p = point(x ?? 0, y ?? 0, z ?? 0); return `${p.x},${p.y}` }).join(' ')

function block(x: number, y: number, z: number, w: number, d: number, h: number, fill: string, side: string) {
  const top = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]].map(([px, py, pz]) => { const p = point(px ?? 0, py ?? 0, pz ?? 0); return `${p.x},${p.y}` }).join(' ')
  const right = [[x + w, y, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x + w, y, z]].map(([px, py, pz]) => { const p = point(px ?? 0, py ?? 0, pz ?? 0); return `${p.x},${p.y}` }).join(' ')
  return (
    <>
      <polygon points={top} fill={fill} />
      <polygon points={right} fill={side} />
    </>
  )
}

const desk = (x: number, y: number, state: VisualState) => (
  <>
    {block(x, y, 0, 4.0, 2.6, 1.0, state === 'running' ? '#324a3c' : '#34343e', '#26262e')}
    {block(x + 1.2, y + 0.7, 1.0, 1.5, 0.5, 1.1, '#2b2b34', '#22222a')}
    {block(x + 0.35, y + 1.85, 0, 0.5, 0.5, 0.5, '#2f2f38', '#24242c')}
    {state === 'running' ? <ellipse cx={point(x + 1.6, y + 1.1).x} cy={point(x + 1.6, y + 1.1).y} rx="34" ry="16" fill="#43b581" opacity="0.14" /> : null}
  </>
)

const seat = (x: number, y: number, state: VisualState) => (
  <>
    {block(x, y, 0, 1.7, 1.2, 0.55, '#2e333b', '#25272d')}
    {state === 'running' ? <ellipse cx={point(x + 0.85, y + 0.6).x} cy={point(x + 0.85, y + 0.6).y} rx="20" ry="9" fill="#43b581" opacity="0.16" /> : null}
  </>
)

const table = (x: number, y: number) => (
  <>
    <ellipse cx={point(x + 1.2, y + 0.8).x} cy={point(x + 1.2, y + 0.8).y} rx="36" ry="17" fill="#3a3628" />
    {block(x, y, 0, 2.4, 1.6, 0.45, '#4a4330', '#332f24')}
  </>
)

const shelf = (x: number, y: number) => (
  <>
    {block(x, y, 0, 1.8, 0.8, 1.3, '#34343e', '#282830')}
    {block(x + 0.2, y + 0.2, 1.3, 0.3, 0.4, 0.15, '#5b8def', '#3b5ba0')}
    {block(x + 0.65, y + 0.2, 1.3, 0.3, 0.4, 0.15, '#4a4a58', '#34343e')}
    {block(x + 1.1, y + 0.2, 1.3, 0.3, 0.4, 0.15, '#4a4a58', '#34343e')}
  </>
)
