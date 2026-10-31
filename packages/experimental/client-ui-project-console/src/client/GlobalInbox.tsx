/** Global attention inbox: every Workspace's waiting work in one operable panel. */
import type { SessionStatus } from '@deepseek-ai/dsh-client-ui-session/client'
import type { GlobalInboxGroup, GlobalInboxItem } from './global-inbox.ts'
import type { ProjectConsoleKey } from './locales.ts'
import { partnerName } from './partner-identity.ts'
import css from './GlobalInbox.module.css'

const KIND_KEYS: Record<GlobalInboxItem['kind'], ProjectConsoleKey> = {
  approval: 'pendingApproval',
  question: 'questionPending',
  'plan-review': 'planReviewPending',
  completed: 'completedUnread',
}

/**
 * Render the cross-workspace attention panel.
 * @param props - grouped items, Session status facts, the page dictionary, and item actions.
 * @returns the inbox panel.
 */
export function GlobalInbox({
  groups, statuses, aliases, t, onOpen, onSwitch, onApprove, onReject, onAnswer,
}: {
  readonly groups: readonly GlobalInboxGroup[]
  readonly statuses: ReadonlyMap<string, SessionStatus>
  readonly aliases: ReadonlyMap<string, string>
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly onOpen: (sessionId: string) => void
  readonly onSwitch: (workspaceId: string) => void
  readonly onApprove: (sessionId: string) => void
  readonly onReject: (sessionId: string) => void
  readonly onAnswer: (sessionId: string, questionId: string, answer: string) => void
}) {
  return (
    <section className={css.inbox} aria-label={t('globalInbox')}>
      {groups.length === 0 ? <p className={css.empty}>{t('globalInboxEmpty')}</p> : null}
      {groups.map(group => (
        <div key={group.workspaceId} className={css.group}>
          <button type="button" className={css.workspace} onClick={() => { onSwitch(group.workspaceId) }}>
            {group.title}
            <span className={css.count}>{group.items.length}</span>
          </button>
          {group.items.map((item) => {
            const status = statuses.get(item.sessionId)
            const pending = status?.pendingInteraction
            const displayName = partnerName(item.sessionId, undefined, aliases.get(item.sessionId))
            const question = pending?.kind === 'question' ? pending.questions[0] : undefined
            const options = question?.options
            return (
              <div key={item.sessionId} className={css.item}>
                <span className={css.kind}>{t(KIND_KEYS[item.kind])}</span>
                <span className={css.title} title={item.sessionId}>{displayName}</span>
                <span className={css.actions}>
                  {item.kind === 'completed'
                    ? <button type="button" className={css.action} onClick={() => { onOpen(item.sessionId) }}>{t('view')}</button>
                    : (
                      <>
                        {item.kind === 'question'
                          ? null
                          : (
                            <>
                              <button type="button" className={css.action} onClick={() => { onApprove(item.sessionId) }}>{t('allowOnce')}</button>
                              <button type="button" className={css.action} onClick={() => { onReject(item.sessionId) }}>{t('rejectApproval')}</button>
                            </>
                          )}
                        {question === undefined || options === undefined
                          ? null
                          : options.slice(0, 3).map(option => (
                            <button
                              key={option.label}
                              type="button"
                              className={css.action}
                              onClick={() => { onAnswer(item.sessionId, question.id, option.label) }}
                            >
                              {option.label}
                            </button>
                          ))}
                        <button type="button" className={css.action} onClick={() => { onOpen(item.sessionId) }}>{t('openSession')}</button>
                      </>
                    )}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
