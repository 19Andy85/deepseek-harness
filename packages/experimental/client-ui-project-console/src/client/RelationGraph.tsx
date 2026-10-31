/** Relation graph: visible parents with their durable derived children. */
import { useState } from 'react'
import type { ProjectConsoleKey } from './locales.ts'
import type { RelationGraphGroup, RelationGraphNode } from './relation-tree.ts'
import { ChevronIcon } from './icons.tsx'
import { StatusDot, type VisualState } from './visual/visual.tsx'
import css from './RelationGraph.module.css'

function stateOf(node: RelationGraphNode): VisualState {
  if (node.outcome === 'failed' || node.stalled === true) return 'error'
  if (node.status === 'running') return 'running'
  if (node.outcome === 'completed') return 'success'
  return node.status === 'idle' ? 'idle' : 'unknown'
}

function shortId(sessionId: string): string {
  return sessionId.slice(0, 8)
}

/**
 * Render the durable derivation graph.
 * @param props - groups, the page dictionary, and the open action.
 * @returns the relation graph, or null without groups.
 */
export function RelationGraph({
  groups, t, onOpen,
}: {
  readonly groups: readonly RelationGraphGroup[]
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onOpen: (sessionId: string) => void
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  if (groups.length === 0) return null
  const toggle = (sessionId: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }
  return (
    <section className={css.graph} aria-label={t('relationGraph')}>
      <h2 className={css.title}>{t('relationGraph')}</h2>
      {groups.map(group => (
        <div key={group.parent.sessionId} className={css.group}>
          <div className={css.parentRow}>
            <button
              type="button"
              className={css.toggle}
              aria-expanded={!collapsed.has(group.parent.sessionId)}
              aria-label={collapsed.has(group.parent.sessionId) ? t('expandGraph') : t('collapseGraph')}
              onClick={() => { toggle(group.parent.sessionId) }}
            >
              <span className={collapsed.has(group.parent.sessionId) ? css.chevronCollapsed : css.chevron}><ChevronIcon /></span>
            </button>
            <StatusDot state={stateOf(group.parent)} />
            <button type="button" className={css.link} onClick={() => { onOpen(group.parent.sessionId) }}>
              {group.parent.title ?? shortId(group.parent.sessionId)}
            </button>
            <span className={css.meta}>{t('derivedChildren', { n: group.children.length })}</span>
          </div>
          {collapsed.has(group.parent.sessionId)
            ? null
            : (
              <div className={css.children}>
                {group.children.map(child => (
                  <div key={child.sessionId} className={css.childRow}>
                    <span className={css.connector} aria-hidden="true" />
                    <StatusDot state={stateOf(child)} />
                    <button type="button" className={css.link} onClick={() => { onOpen(child.sessionId) }}>
                      {child.title ?? shortId(child.sessionId)}
                    </button>
                    {child.live === true ? <span className={css.badge}>{t('running')}</span> : null}
                  </div>
                ))}
              </div>
            )}
        </div>
      ))}
    </section>
  )
}
