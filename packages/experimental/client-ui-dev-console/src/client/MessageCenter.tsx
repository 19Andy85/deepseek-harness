/** Dev Console inbox/outbox, Briefs, and handoff submission. */
import { useEffect, useState } from 'react'
import type { ProjectConsoleKey } from './locales.ts'
import css from './MessageCenter.module.css'

export type Role = 'maintainer' | 'implementer' | 'domain-reviewer' | 'system'
type MessageKind = 'note' | 'request' | 'decision' | 'handoff' | 'report'
type BriefStatus = 'draft' | 'ready' | 'assigned' | 'in_review' | 'accepted' | 'changes_requested' | 'closed'

export interface MessageView {
  readonly id: string
  readonly threadId: string
  readonly fromRole: Role
  readonly toRole: Role
  readonly workspaceId?: string | undefined
  readonly kind: MessageKind
  readonly subject: string
  readonly body: string
  readonly status: string
  readonly requiresResponse: boolean
  readonly createdAt: number
  readonly payload?: {
    readonly selectedOption?: string | undefined
    readonly reason?: string | undefined
    readonly handoff?: {
      readonly branch: string
      readonly commit: string
      readonly summary: string
      readonly tests: readonly string[]
    } | undefined
  } | undefined
}

export interface BriefView {
  readonly id: string
  readonly workspaceId: string
  readonly title: string
  readonly goal: string
  readonly acceptance: string
  readonly status: BriefStatus
  readonly authorRole: Role
  readonly assigneeRole?: Role | undefined
  readonly updatedAt: number
}

const ROLE_KEYS: Record<Role, ProjectConsoleKey> = {
  maintainer: 'roleMaintainer', implementer: 'roleImplementer', 'domain-reviewer': 'roleDomainReviewer', system: 'roleSystem',
}
const KIND_KEYS: Record<MessageKind, ProjectConsoleKey> = {
  note: 'kindNote', request: 'kindRequest', decision: 'kindDecision', handoff: 'kindHandoff', report: 'kindReport',
}
const MESSAGE_STATUS_KEYS: Record<string, ProjectConsoleKey> = {
  unread: 'messageUnread', acknowledged: 'messageAcknowledged', resolved: 'messageResolved', stale: 'messageStale',
}
const BRIEF_STATUS_KEYS: Record<BriefStatus, ProjectConsoleKey> = {
  draft: 'briefDraft', ready: 'briefReady', assigned: 'briefAssigned', in_review: 'briefInReview',
  accepted: 'briefAccepted', changes_requested: 'briefChangesRequested', closed: 'briefClosed',
}

export interface MessageCenterInjected {
  readonly messages: (role: Role, box: 'inbox' | 'outbox') => Promise<readonly MessageView[]>
  readonly sendMessage: (input: {
    readonly fromRole: Role
    readonly toRole: Role
    readonly kind: MessageKind
    readonly subject: string
    readonly body: string
    readonly requiresResponse?: boolean
    readonly payload?: { readonly selectedOption?: string; readonly reason?: string }
  }) => Promise<MessageView>
  readonly messageAction: (messageId: string, action: 'ack' | 'resolve', role: Role, response?: string) => Promise<MessageView>
  readonly briefs: () => Promise<readonly BriefView[]>
  readonly createBrief: (input: {
    readonly workspaceId: string
    readonly title: string
    readonly goal: string
    readonly acceptance: string
  }) => Promise<BriefView>
  readonly transitionBrief: (briefId: string, to: BriefStatus, reason?: string) => Promise<BriefView>
  readonly handoff: (input: {
    readonly briefId: string
    readonly branch: string
    readonly commit: string
    readonly summary: string
    readonly tests: readonly string[]
  }) => Promise<MessageView>
}

export interface MessageCenterProps extends MessageCenterInjected {
  readonly t: (key: ProjectConsoleKey) => string
  readonly onClose: () => void
}

/**
 * Render messages and Briefs in a single panel.
 * @param props - Remote actions, dictionary, and close handler.
 * @returns the message center.
 */
export function MessageCenter({
  messages, sendMessage, messageAction, briefs, createBrief, transitionBrief, handoff, t, onClose,
}: MessageCenterProps) {
  const [role, setRole] = useState<Role>('maintainer')
  const [tab, setTab] = useState<'inbox' | 'outbox' | 'briefs'>('inbox')
  const [rows, setRows] = useState<readonly MessageView[]>([])
  const [briefRows, setBriefRows] = useState<readonly BriefView[]>([])
  const [error, setError] = useState<string | undefined>(undefined)
  const [toRole, setToRole] = useState<Role>('implementer')
  const [kind, setKind] = useState<MessageKind>('request')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [requiresResponse, setRequiresResponse] = useState(true)
  const [selectedOption, setSelectedOption] = useState('')
  const [reason, setReason] = useState('')
  const [response, setResponse] = useState('')
  const [briefWorkspace, setBriefWorkspace] = useState('')
  const [briefTitle, setBriefTitle] = useState('')
  const [briefGoal, setBriefGoal] = useState('')
  const [briefAcceptance, setBriefAcceptance] = useState('')
  const [handoffBrief, setHandoffBrief] = useState('')
  const [branch, setBranch] = useState('')
  const [commit, setCommit] = useState('')
  const [summary, setSummary] = useState('')
  const [tests, setTests] = useState('')
  const fail = (value: unknown): void => {
    const text = value instanceof Error ? value.message : String(value)
    setError(text.includes('404') || text.includes('transport failure')
      ? 'Host 尚未更新该接口，请完全退出并重开 App 后重试。'
      : text)
  }
  const reload = async (): Promise<void> => {
    try {
      if (tab === 'briefs') setBriefRows(await briefs())
      else setRows(await messages(role, tab === 'outbox' ? 'outbox' : 'inbox'))
      setError(undefined)
    } catch (reasonValue) { fail(reasonValue) }
  }
  useEffect(() => { void reload() }, [tab, role])
  return (
    <div
      className={css.scrim}
      role="dialog"
      aria-label={t('messagesTitle')}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section className={css.panel}>
        <header className={css.head}>
          <div>
            <h2 className={css.title}>{t('messagesTitle')}</h2>
            <p className={css.hint}>{t('messagesHint')}</p>
          </div>
          <div className={css.actions}>
            <label className={css.label}>{t('currentRole')}
              <select value={role} onChange={(event) => { setRole(event.currentTarget.value as Role) }}>
                {(['maintainer', 'implementer', 'domain-reviewer', 'system'] as const).map(value => (
                  <option key={value} value={value}>{t(ROLE_KEYS[value])}</option>
                ))}
              </select>
            </label>
            <button type="button" className={css.button} onClick={() => { void reload() }}>{t('refresh')}</button>
            <button type="button" className={css.button} onClick={onClose}>{t('close')}</button>
          </div>
        </header>
        <div className={css.tabs}>
          <button type="button" className={tab === 'inbox' ? css.tabActive : css.tab} onClick={() => { setTab('inbox') }}>{t('inbox')}</button>
          <button type="button" className={tab === 'outbox' ? css.tabActive : css.tab} onClick={() => { setTab('outbox') }}>{t('outbox')}</button>
          <button type="button" className={tab === 'briefs' ? css.tabActive : css.tab} onClick={() => { setTab('briefs') }}>{t('briefs')}</button>
        </div>
        {error === undefined ? null : <p className={css.error}>{error}</p>}
        <div className={css.body}>
          {tab === 'briefs'
            ? (
              <>
                <form className={css.compose} onSubmit={(event) => {
                  event.preventDefault()
                  void createBrief({
                    workspaceId: briefWorkspace, title: briefTitle, goal: briefGoal, acceptance: briefAcceptance,
                  }).then(() => {
                    setBriefTitle(''); setBriefGoal(''); setBriefAcceptance(''); void reload()
                  }).catch((value: unknown) => { fail(value) })
                }}>
                  <input placeholder={t('workspaceIdLabel')} value={briefWorkspace} onChange={(event) => { setBriefWorkspace(event.currentTarget.value) }} />
                  <input placeholder={t('briefTitle')} value={briefTitle} onChange={(event) => { setBriefTitle(event.currentTarget.value) }} />
                  <input placeholder={t('briefGoal')} value={briefGoal} onChange={(event) => { setBriefGoal(event.currentTarget.value) }} />
                  <input placeholder={t('briefAcceptance')} value={briefAcceptance} onChange={(event) => { setBriefAcceptance(event.currentTarget.value) }} />
                  <button type="submit" className={css.button}>{t('createBrief')}</button>
                </form>
                {briefRows.length === 0 ? <p className={css.empty}>{t('noBriefsHint')}</p> : null}
                {briefRows.map(brief => (
                  <article key={brief.id} className={css.card}>
                    <strong>{brief.title}</strong>
                    <span className={css.meta}>{t(BRIEF_STATUS_KEYS[brief.status])} · {brief.workspaceId}</span>
                    <div className={css.actions}>
                      {(brief.status === 'draft' || brief.status === 'ready' || brief.status === 'assigned' || brief.status === 'in_review' || brief.status === 'changes_requested') && (
                        <button type="button" className={css.button} onClick={() => {
                          const next: BriefStatus = brief.status === 'draft' ? 'ready'
                            : brief.status === 'ready' ? 'assigned'
                              : brief.status === 'assigned' ? 'in_review'
                                : brief.status === 'in_review' ? 'accepted' : 'assigned'
                          void transitionBrief(brief.id, next).then(() => { void reload() }).catch((value: unknown) => {
                            fail(value)
                          })
                        }}>{t('advanceBrief')}</button>
                      )}
                      {brief.status === 'assigned' && (
                        <button type="button" className={css.button} onClick={() => { setHandoffBrief(brief.id) }}>{t('handoff')}</button>
                      )}
                    </div>
                  </article>
                ))}
                {handoffBrief === '' ? null : (
                  <form className={css.compose} onSubmit={(event) => {
                    event.preventDefault()
                    void handoff({ briefId: handoffBrief, branch, commit, summary, tests: tests.split(',').map(item => item.trim()).filter(Boolean) }).then(() => {
                      setHandoffBrief(''); setBranch(''); setCommit(''); setSummary(''); setTests(''); void reload()
                    }).catch((value: unknown) => { fail(value) })
                  }}>
                    <input placeholder={t('branch')} value={branch} onChange={(event) => { setBranch(event.currentTarget.value) }} />
                    <input placeholder={t('commit')} value={commit} onChange={(event) => { setCommit(event.currentTarget.value) }} />
                    <input placeholder={t('summary')} value={summary} onChange={(event) => { setSummary(event.currentTarget.value) }} />
                    <input placeholder={t('tests')} value={tests} onChange={(event) => { setTests(event.currentTarget.value) }} />
                    <button type="submit" className={css.button}>{t('sendHandoff')}</button>
                  </form>
                )}
              </>
            )
            : (
              <>
                <form className={css.compose} onSubmit={(event) => {
                  event.preventDefault()
                  void sendMessage({ fromRole: role, toRole, kind, subject, body, requiresResponse, ...kind === 'decision' ? { payload: { selectedOption, reason } } : {} }).then(() => {
                    setSubject(''); setBody(''); setSelectedOption(''); setReason(''); void reload()
                  }).catch((value: unknown) => { fail(value) })
                }}>
                  <div className={css.row}>
                    <label className={css.label}>{t('recipient')}
                      <select value={toRole} onChange={(event) => { setToRole(event.currentTarget.value as Role) }}>
                        {(['maintainer', 'implementer', 'domain-reviewer', 'system'] as const).map(value => (
                          <option key={value} value={value}>{t(ROLE_KEYS[value])}</option>
                        ))}
                      </select>
                    </label>
                    <label className={css.label}>{t('messageKind')}
                      <select value={kind} onChange={(event) => { setKind(event.currentTarget.value as MessageKind) }}>
                        {(['note', 'request', 'decision', 'handoff', 'report'] as const).map(value => (
                          <option key={value} value={value}>{t(KIND_KEYS[value])}</option>
                        ))}
                      </select>
                    </label>
                    <label className={css.checkbox}>
                      <input type="checkbox" checked={requiresResponse} onChange={(event) => { setRequiresResponse(event.currentTarget.checked) }} />
                      {t('requiresResponse')}
                    </label>
                  </div>
                  <input placeholder={t('subject')} value={subject} onChange={(event) => { setSubject(event.currentTarget.value) }} />
                  <textarea placeholder={t('messageBody')} value={body} onChange={(event) => { setBody(event.currentTarget.value) }} />
                  {kind !== 'decision' ? null : <input placeholder={t('selectedOption')} value={selectedOption} onChange={(event) => { setSelectedOption(event.currentTarget.value) }} />}
                  {kind !== 'decision' ? null : <input placeholder={t('reason')} value={reason} onChange={(event) => { setReason(event.currentTarget.value) }} />}
                  <button type="submit" className={css.button}>{t('sendMessage')}</button>
                </form>
                {rows.length === 0 ? <p className={css.empty}>{tab === 'inbox' ? t('emptyInboxHint') : t('noMessages')}</p> : null}
                {rows.map(message => (
                  <article key={message.id} className={css.card}>
                    <div className={css.row}>
                      <strong>{message.subject}</strong>
                      <span className={css.meta}>{t(KIND_KEYS[message.kind])} · {t(ROLE_KEYS[message.fromRole])} → {t(ROLE_KEYS[message.toRole])} · {t(MESSAGE_STATUS_KEYS[message.status] ?? 'messageUnread')}</span>
                    </div>
                    <p>{message.body}</p>
                    <div className={css.actions}>
                      {tab === 'inbox' && message.status === 'unread' ? <button type="button" className={css.button} onClick={() => { void messageAction(message.id, 'ack', role).then(() => { void reload() }).catch((value: unknown) => { fail(value) }) }}>{t('acknowledge')}</button> : null}
                      {tab === 'inbox' && message.status !== 'resolved' ? (
                        <>
                          <input placeholder={t('reply')} value={response} onChange={(event) => { setResponse(event.currentTarget.value) }} />
                          <button type="button" className={css.button} onClick={() => { void messageAction(message.id, 'resolve', role, response).then(() => { setResponse(''); void reload() }).catch((value: unknown) => { fail(value) }) }}>{t('resolve')}</button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </>
            )}
        </div>
      </section>
    </div>
  )
}
