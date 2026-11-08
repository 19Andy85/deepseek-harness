/** Always-visible pending proposal dock at the conversation composer. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { decideProposal, loadPendingProposals } from './proposal-card-actions.ts'
import css from './ProposalDock.module.css'

type ProposalDockProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'projectConsole'>

interface DockProposal {
  readonly messageId: string
  readonly title: string
  readonly goal: string
  readonly acceptance: string
  readonly steps: readonly { readonly title: string; readonly outcome: string }[]
}

/**
 * Render pending proposals for the current Session.
 * @param props - Session scope and console locale.
 * @returns the pending proposal dock, or nothing when none are pending.
 */
export function ProposalDock(props: ProposalDockProps) {
  const { sessionId, t } = props
  const [proposals, setProposals] = useState<readonly DockProposal[]>([])
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [steps, setSteps] = useState<readonly { readonly title: string; readonly outcome: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (sessionId === undefined) { setProposals([]); return }
    let live = true
    const read = (): void => {
      void loadPendingProposals(String(sessionId)).then((rows) => {
        if (live) {
          setProposals(rows.map(row => ({
            messageId: row.messageId, title: row.title, goal: row.goal, acceptance: row.acceptance, steps: row.steps,
          })))
        }
      }).catch(() => { /* the console Remote may not be mounted in this profile */ })
    }
    read()
    const timer = setInterval(read, 3000)
    return () => { live = false; clearInterval(timer) }
  }, [sessionId])
  if (proposals.length === 0) return null
  const act = (proposal: DockProposal, decision: 'accept' | 'dismiss'): void => {
    setBusy(true); setError(undefined)
    void decideProposal({
      messageId: proposal.messageId, decision,
      ...editing === proposal.messageId ? { title, goal, acceptance, steps } : {},
    }).then(() => {
      setProposals(rows => rows.filter(row => row.messageId !== proposal.messageId))
      setEditing(undefined)
    }).catch(() => { setError(t('proposalCardFailed')) }).finally(() => { setBusy(false) })
  }
  return (
    <div className={css.dock} role="status">
      {proposals.map(proposal => (
        <div key={proposal.messageId} className={css.card}>
          <div className={css.heading}>{t('proposalCardTitle')}</div>
          {editing === proposal.messageId ? (
            <div className={css.form}>
              <input value={title} aria-label={t('proposalCardTitleLabel')} onChange={(event) => { setTitle(event.currentTarget.value) }} />
              <textarea value={goal} aria-label={t('proposalCardGoalLabel')} onChange={(event) => { setGoal(event.currentTarget.value) }} />
              <textarea value={acceptance} aria-label={t('proposalCardAcceptanceLabel')} onChange={(event) => { setAcceptance(event.currentTarget.value) }} />
              {steps.map((step, index) => (
                <div className={css.stepRow} key={`${index}-${step.title}`}>
                  <input value={step.title} aria-label={t('proposalCardStepTitle')} placeholder={t('proposalCardStepTitle')} onChange={(event) => {
                    const value = event.currentTarget.value
                    setSteps(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, title: value } : row))
                  }} />
                  <input value={step.outcome} aria-label={t('proposalCardStepOutcome')} placeholder={t('proposalCardStepOutcome')} onChange={(event) => {
                    const value = event.currentTarget.value
                    setSteps(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, outcome: value } : row))
                  }} />
                  <Button disabled={busy} onClick={() => { setSteps(rows => rows.filter((_, rowIndex) => rowIndex !== index)) }}>{t('proposalCardStepRemove')}</Button>
                </div>
              ))}
              <Button disabled={busy} onClick={() => { setSteps(rows => [...rows, { title: '', outcome: '' }]) }}>{t('proposalCardStepAdd')}</Button>
            </div>
          ) : (
            <>
              <strong className={css.title}>{proposal.title}</strong>
              <span className={css.goal}>{proposal.goal}</span>
            </>
          )}
          <div className={css.actions}>
            <Button variant="primary" disabled={busy} onClick={() => { act(proposal, 'accept') }}>{editing === proposal.messageId ? t('proposalCardSave') : t('proposalCardConfirm')}</Button>
            <Button disabled={busy} onClick={() => {
              if (editing === proposal.messageId) { setEditing(undefined); return }
              setEditing(proposal.messageId)
              setTitle(proposal.title); setGoal(proposal.goal); setAcceptance(proposal.acceptance); setSteps(proposal.steps)
            }}>{editing === proposal.messageId ? t('proposalCardCancelEdit') : t('proposalCardEdit')}</Button>
            <Button disabled={busy} onClick={() => { act(proposal, 'dismiss') }}>{t('proposalCardIgnore')}</Button>
          </div>
        </div>
      ))}
      {error === undefined ? null : <p className={css.error}>{error}</p>}
    </div>
  )
}
