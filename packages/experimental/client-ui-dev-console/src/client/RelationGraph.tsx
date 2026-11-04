/** Relation graph: visible parents with their durable derived children. */
import { useState } from 'react'
import type { ProjectConsoleKey } from './locales.ts'
import type { RelationGraphGroup, RelationGraphNode } from './relation-tree.ts'
import { ChevronIcon } from './icons.tsx'
import { identityOf, partnerName } from './partner-identity.ts'
import { PartnerAvatar } from './PartnerAvatar.tsx'
import { StatusDot, type VisualState } from './visual/visual.tsx'
import css from './RelationGraph.module.css'

function stateOf(node: RelationGraphNode): VisualState {
  if (node.outcome === 'failed' || node.stalled === true) return 'error'
  if (node.status === 'running') return 'running'
  if (node.outcome === 'completed') return 'success'
  return node.status === 'idle' ? 'idle' : 'unknown'
}

/**
 * Render the durable derivation graph.
 * @param props - groups, the page dictionary, and the open action.
 * @returns the relation graph, or null without groups.
 */
export function RelationGraph({
  groups, aliases, t, onOpen, expanded = false,
}: {
  readonly groups: readonly RelationGraphGroup[]
  readonly aliases: ReadonlyMap<string, string>
  readonly expanded?: boolean
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
            <PartnerAvatar
              name={partnerName(group.parent.sessionId, group.parent.title, aliases.get(group.parent.sessionId))}
              initial={identityOf({ sessionId: group.parent.sessionId, title: group.parent.title, activity: [] }, aliases).initial}
              role={identityOf({ sessionId: group.parent.sessionId, title: group.parent.title, activity: [] }, aliases).role}
              size={20}
            />
            <StatusDot state={stateOf(group.parent)} />
            <button type="button" className={css.link} onClick={() => { onOpen(group.parent.sessionId) }}>
              {partnerName(group.parent.sessionId, group.parent.title, aliases.get(group.parent.sessionId))}
            </button>
            <span className={css.meta}>{t('derivedChildren', { n: group.children.length })}</span>
            {group.parent.jobs?.map(job => <span key={job} className={css.jobChip}>{job}</span>)}
          </div>
          {collapsed.has(group.parent.sessionId)
            ? null
            : (
              <div className={expanded ? `${css.canvas} ${css.canvasExpanded}` : css.canvas}>
                <svg
                  className={css.links}
                  width={44}
                  height={group.children.length * 30}
                  viewBox={`0 0 44 ${String(group.children.length * 30)}`}
                  aria-hidden="true"
                >
                  {group.children.map((child, index) => (
                    <path
                      key={child.sessionId}
                      d={`M0 ${String((group.children.length * 30) / 2)} C 18 ${String((group.children.length * 30) / 2)}, 26 ${String(index * 30 + 15)}, 44 ${String(index * 30 + 15)}`}
                      fill="none"
                      stroke="var(--dsw-alias-settings-card-stroke)"
                      strokeWidth="1"
                    />
                  ))}
                </svg>
                <div className={css.childColumn} data-relation="derived" aria-label={t('derivedFrom', { title: '' })}>
                  {group.children.map(child => (
                    <button
                      key={child.sessionId}
                      type="button"
                      className={css.childNode}
                      onClick={() => { onOpen(child.sessionId) }}
                    >
                      <PartnerAvatar
                        name={partnerName(child.sessionId, child.title, aliases.get(child.sessionId))}
                        initial={identityOf({ sessionId: child.sessionId, title: child.title, activity: [] }, aliases).initial}
                        role={identityOf({ sessionId: child.sessionId, title: child.title, activity: [] }, aliases).role}
                        size={18}
                      />
                      <StatusDot state={stateOf(child)} />
                      <span className={css.childTitle}>{partnerName(child.sessionId, child.title, aliases.get(child.sessionId))}</span>
                      {child.depth !== undefined && child.depth > 1 ? <span className={css.depth}>{`L${String(child.depth)}`}</span> : null}
                      {child.activity === undefined ? null : <span className={css.activity}>{child.activity}</span>}
                      {child.live === true ? <span className={css.badge}>{t('running')}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
        </div>
      ))}
    </section>
  )
}
