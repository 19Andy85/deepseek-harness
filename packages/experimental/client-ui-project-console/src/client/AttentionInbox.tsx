/** The always-on Needs you inbox shared by the canvas and studio views. */
import type { QuestionAnswer } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { AttentionItem } from './attention.ts'
import type { ProjectConsoleKey } from './locales.ts'
import { PauseIcon } from './icons.tsx'
import { StatusDot } from './visual/visual.tsx'
import css from './ProjectConsolePage.module.css'
import visualCss from './visual/visual.module.css'

/** Actions the inbox can dispatch. */
export interface AttentionInboxActions {
  /** Open the Session conversation. */
  readonly open: (sessionId: string) => void
  /** Follow the Session inside the console. */
  readonly focus: (sessionId: string) => void
  /** Answer a pending approval. */
  readonly approve: (sessionId: string, decision: 'allowed-once' | 'rejected') => void
  /** Answer a pending question or plan review. */
  readonly answer: (sessionId: string, answer: QuestionAnswer) => void
}

/**
 * Render the attention inbox.
 * @param props - attention items, the busy Session, the dictionary, and actions.
 * @returns the inbox section.
 */
export function AttentionInbox({
  attention, busySessionId, active, t, actions,
}: {
  readonly attention: readonly AttentionItem[]
  readonly busySessionId: string | undefined
  readonly active?: string | undefined
  readonly t: (key: ProjectConsoleKey, params?: Record<string, unknown>) => string
  readonly actions: AttentionInboxActions
}) {
  const pendingItems = attention.filter(item => item.pending !== undefined)
  const failedItems = attention.filter(item => item.failed !== undefined)
  const completedItems = attention.filter(item => item.pending === undefined && item.failed === undefined)
  return (
    <section className={css.section} aria-label={t('needsYou')}>
      <h2 className={css.sectionTitle}>
        {t('needsYou')}
        {attention.length === 0 ? null : ` (${String(attention.length)})`}
      </h2>
      {attention.length === 0
        ? <div className={visualCss.emptyAttention}>{t('noPending')}</div>
        : (
          <>
            {pendingItems.length === 0 ? null : <h3 className={visualCss.bucketTitle}>{t('waitingGroup')}</h3>}
            {pendingItems.map(item => (
              <article key={item.sessionId} className={`${css.row} ${css.rowAttention}`}>
                <div className={css.rowHead}>
                  <StatusDot state="attention" />
                  <span className={css.needsBadge}><PauseIcon size={11} /> {t('needsYou')}</span>
                  <span className={css.sessionId} title={item.sessionId}>{item.row.title ?? t('untitled')}</span>
                  <span className={css.meta}>{item.row.status === 'running' ? t('running') : t('idle')}</span>
                  {item.row.lastPromptAt === undefined
                    ? null
                    : <span className={css.meta}>{new Date(item.row.lastPromptAt).toLocaleTimeString(undefined, { hour12: false })}</span>}
                </div>
                <div className={css.attentionContext}>
                  <span className={css.contextLabel}>{t('contextLabel')}</span>
                  {item.row.title === undefined
                    ? null
                    : <span className={css.contextText}>{item.row.title}</span>}
                  {item.pending?.kind === 'approval'
                    ? (
                      <>
                        <span className={css.contextText}>{t('pendingApproval')} · {item.row.approval?.toolName ?? item.pending.toolName}</span>
                        {item.row.approval?.reason === undefined
                          ? null
                          : <span className={css.contextText}>{item.row.approval.reason}</span>}
                        {item.row.approval?.arguments === undefined
                          ? item.row.toolCall === undefined
                            ? <span className={css.contextText}>{t('approvalArgsUnavailable')}</span>
                            : (
                              <>
                                <span className={css.contextLabel}>{t('approvalArgsFallback')}</span>
                                <code className={css.contextCode}>{item.row.toolCall.arguments}</code>
                              </>
                            )
                          : (
                            <>
                              <span className={css.contextLabel}>{t('approvalExactArgs')}</span>
                              <code className={css.contextCode}>{item.row.approval.arguments}</code>
                            </>
                          )}
                      </>
                    )
                    : null}
                  {item.pending?.kind === 'question' || item.pending?.kind === 'plan-review'
                    ? (
                      <>
                        <span className={css.contextText}>{item.pending.firstQuestion.question}</span>
                        {item.pending.firstQuestion.options === undefined
                          ? null
                          : (
                            <span className={css.contextOptions}>
                              {item.pending.firstQuestion.options.map(option => (
                                <span key={option.label} className={css.chip}>{option.label}</span>
                              ))}
                            </span>
                          )}
                      </>
                    )
                    : null}
                  {item.failed?.reason === undefined
                    ? null
                    : <span className={css.contextText}>{t('failed')} · {item.failed.reason}</span>}
                  {item.row.changes === undefined
                    ? null
                    : (
                      <span className={css.contextText}>
                        {t('changesSummary', { n: item.row.changes.total, added: item.row.changes.added, deleted: item.row.changes.deleted })}
                      </span>
                    )}
                  <span className={css.contextMeta}>
                    {t('activityTrack')} · {item.row.activity.length === 0 ? t('noActivity') : item.row.activity.map(entry => entry.kind).join(' / ')}
                    {' · '}
                    {t('focusSession')}
                  </span>
                </div>
                <div className={css.rowActions}>
                  {item.pending?.kind === 'approval'
                    ? (
                      <>
                        <span className={css.chip}>{t('pendingApproval')} · {item.pending.toolName}</span>
                        <button
                          type="button"
                          className={css.select}
                          disabled={busySessionId === item.sessionId || !item.pending.answerable}
                          onClick={() => { actions.approve(item.sessionId, 'allowed-once') }}
                        >
                          {t('allowOnce')}
                        </button>
                        <button
                          type="button"
                          className={css.select}
                          disabled={busySessionId === item.sessionId || !item.pending.answerable}
                          onClick={() => { actions.approve(item.sessionId, 'rejected') }}
                        >
                          {t('rejectApproval')}
                        </button>
                      </>
                    )
                    : item.pending === undefined
                      ? <button type="button" className={css.select} onClick={() => { actions.open(item.sessionId) }}>{t('view')}</button>
                      : (() => {
                        const first = item.pending.firstQuestion
                        const options = item.pending.kind === 'plan-review' || first.multiSelect !== true
                          ? first.options : undefined
                        return (
                          <>
                            <span className={css.chip}>
                              {item.pending.kind === 'plan-review' ? t('planReviewPending') : t('questionPending')}
                              {' · '}
                              {first.question}
                            </span>
                            {options === undefined || options.length === 0
                              ? <button type="button" className={css.select} onClick={() => { actions.open(item.sessionId) }}>{t('goToConversation')}</button>
                              : options.map(option => (
                                <button
                                  key={option.label}
                                  type="button"
                                  className={css.select}
                                  disabled={busySessionId === item.sessionId}
                                  onClick={() => {
                                    actions.answer(item.sessionId, {
                                      answers: [{ id: first.id, selected: [option.label] }],
                                    })
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                          </>
                        )
                      })()}
                </div>
              </article>
            ))}
            {failedItems.length === 0 ? null : <h3 className={visualCss.bucketTitle}>{t('failedGroup')}</h3>}
            {failedItems.map(item => (
              <article key={item.sessionId} className={`${css.row} ${css.rowFailed} ${active === item.sessionId ? css.rowActive : ''}`}>
                <div className={css.rowHead}>
                  <StatusDot state="error" />
                  <span className={css.sessionId} title={item.sessionId}>{item.row.title ?? t('untitled')}</span>
                  <span className={css.meta}>{item.row.status === 'running' ? t('running') : t('idle')}</span>
                  <span className={css.chip}>{item.failed?.reason ?? t('failed')}</span>
                  {item.row.changes === undefined
                    ? null
                    : <span className={css.chip}>{t('changesSummary', { n: item.row.changes.total, added: item.row.changes.added, deleted: item.row.changes.deleted })}</span>}
                </div>
                <div className={css.attentionContext}>
                  <span className={css.contextLabel}>{t('contextLabel')}</span>
                  {item.row.title === undefined
                    ? null
                    : <span className={css.contextText}>{item.row.title}</span>}
                  {item.pending?.kind === 'approval'
                    ? (
                      <>
                        <span className={css.contextText}>{t('pendingApproval')} · {item.row.approval?.toolName ?? item.pending.toolName}</span>
                        {item.row.approval?.reason === undefined
                          ? null
                          : <span className={css.contextText}>{item.row.approval.reason}</span>}
                        {item.row.approval?.arguments === undefined
                          ? item.row.toolCall === undefined
                            ? <span className={css.contextText}>{t('approvalArgsUnavailable')}</span>
                            : (
                              <>
                                <span className={css.contextLabel}>{t('approvalArgsFallback')}</span>
                                <code className={css.contextCode}>{item.row.toolCall.arguments}</code>
                              </>
                            )
                          : (
                            <>
                              <span className={css.contextLabel}>{t('approvalExactArgs')}</span>
                              <code className={css.contextCode}>{item.row.approval.arguments}</code>
                            </>
                          )}
                      </>
                    )
                    : null}
                  {item.pending?.kind === 'question' || item.pending?.kind === 'plan-review'
                    ? (
                      <>
                        <span className={css.contextText}>{item.pending.firstQuestion.question}</span>
                        {item.pending.firstQuestion.options === undefined
                          ? null
                          : (
                            <span className={css.contextOptions}>
                              {item.pending.firstQuestion.options.map(option => (
                                <span key={option.label} className={css.chip}>{option.label}</span>
                              ))}
                            </span>
                          )}
                      </>
                    )
                    : null}
                  {item.failed?.reason === undefined
                    ? null
                    : <span className={css.contextText}>{t('failed')} · {item.failed.reason}</span>}
                  {item.row.changes === undefined
                    ? null
                    : (
                      <span className={css.contextText}>
                        {t('changesSummary', { n: item.row.changes.total, added: item.row.changes.added, deleted: item.row.changes.deleted })}
                      </span>
                    )}
                  <span className={css.contextMeta}>
                    {t('activityTrack')} · {item.row.activity.length === 0 ? t('noActivity') : item.row.activity.map(entry => entry.kind).join(' / ')}
                    {' · '}
                    {t('focusSession')}
                  </span>
                </div>
                <div className={css.rowActions}>
                  <button type="button" className={css.select} onClick={() => { actions.open(item.sessionId) }}>{t('view')}</button>
                  <button type="button" className={css.select} onClick={() => { actions.focus(item.sessionId) }}>{t('focusSession')}</button>
                </div>
              </article>
            ))}
            {completedItems.length === 0 ? null : <h3 className={visualCss.bucketTitle}>{t('completedGroup')}</h3>}
            {completedItems.map(item => (
              <article key={item.sessionId} className={`${css.row} ${css.rowSuccess} ${active === item.sessionId ? css.rowActive : ''}`}>
                <div className={css.rowHead}>
                  <StatusDot state="success" />
                  <span className={css.sessionId} title={item.sessionId}>{item.row.title ?? t('untitled')}</span>
                  <span className={css.meta}>{item.row.status === 'running' ? t('running') : t('idle')}</span>
                  <span className={css.chip}>{t('completedUnread')}</span>
                  {item.row.changes === undefined
                    ? null
                    : <span className={css.chip}>{t('changesSummary', { n: item.row.changes.total, added: item.row.changes.added, deleted: item.row.changes.deleted })}</span>}
                </div>
                <div className={css.attentionContext}>
                  <span className={css.contextLabel}>{t('contextLabel')}</span>
                  {item.row.title === undefined
                    ? null
                    : <span className={css.contextText}>{item.row.title}</span>}
                  {item.pending?.kind === 'approval'
                    ? (
                      <>
                        <span className={css.contextText}>{t('pendingApproval')} · {item.row.approval?.toolName ?? item.pending.toolName}</span>
                        {item.row.approval?.reason === undefined
                          ? null
                          : <span className={css.contextText}>{item.row.approval.reason}</span>}
                        {item.row.approval?.arguments === undefined
                          ? item.row.toolCall === undefined
                            ? <span className={css.contextText}>{t('approvalArgsUnavailable')}</span>
                            : (
                              <>
                                <span className={css.contextLabel}>{t('approvalArgsFallback')}</span>
                                <code className={css.contextCode}>{item.row.toolCall.arguments}</code>
                              </>
                            )
                          : (
                            <>
                              <span className={css.contextLabel}>{t('approvalExactArgs')}</span>
                              <code className={css.contextCode}>{item.row.approval.arguments}</code>
                            </>
                          )}
                      </>
                    )
                    : null}
                  {item.pending?.kind === 'question' || item.pending?.kind === 'plan-review'
                    ? (
                      <>
                        <span className={css.contextText}>{item.pending.firstQuestion.question}</span>
                        {item.pending.firstQuestion.options === undefined
                          ? null
                          : (
                            <span className={css.contextOptions}>
                              {item.pending.firstQuestion.options.map(option => (
                                <span key={option.label} className={css.chip}>{option.label}</span>
                              ))}
                            </span>
                          )}
                      </>
                    )
                    : null}
                  {item.failed?.reason === undefined
                    ? null
                    : <span className={css.contextText}>{t('failed')} · {item.failed.reason}</span>}
                  {item.row.changes === undefined
                    ? null
                    : (
                      <span className={css.contextText}>
                        {t('changesSummary', { n: item.row.changes.total, added: item.row.changes.added, deleted: item.row.changes.deleted })}
                      </span>
                    )}
                  <span className={css.contextMeta}>
                    {t('activityTrack')} · {item.row.activity.length === 0 ? t('noActivity') : item.row.activity.map(entry => entry.kind).join(' / ')}
                    {' · '}
                    {t('focusSession')}
                  </span>
                </div>
                <div className={css.rowActions}>
                  <button type="button" className={css.select} onClick={() => { actions.open(item.sessionId) }}>{t('view')}</button>
                  <button type="button" className={css.select} onClick={() => { actions.focus(item.sessionId) }}>{t('focusSession')}</button>
                </div>
              </article>
            ))}
          </>
        )}
    </section>
  )
}
