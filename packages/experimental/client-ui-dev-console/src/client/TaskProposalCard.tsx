/** In-conversation card for a proposed console task. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { decideProposal } from './proposal-card-actions.ts'
import css from './TaskProposalCard.module.css'

type TaskProposalCardProps = ToolCallViewProps & PropsLocale<'projectConsole'>

interface ProposalView {
  readonly messageId: string
  readonly title: string
  readonly goal: string
  readonly acceptance: string
  readonly steps: readonly { readonly title: string; readonly outcome: string }[]
  readonly confidence?: 'high' | 'medium' | 'low' | undefined
  readonly reason?: string | undefined
}

function proposalOf(meta: unknown): ProposalView | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const value = meta as Record<string, unknown>
  const proposal = value['proposal']
  if (typeof value['messageId'] !== 'string' || typeof proposal !== 'object' || proposal === null) return undefined
  const p = proposal as Record<string, unknown>
  if (typeof p['title'] !== 'string' || typeof p['goal'] !== 'string' || typeof p['acceptance'] !== 'string') return undefined
  const steps = Array.isArray(p['steps'])
    ? p['steps'].flatMap((step) => {
      if (typeof step !== 'object' || step === null) return []
      const s = step as Record<string, unknown>
      return typeof s['title'] === 'string' && typeof s['outcome'] === 'string'
        ? [{ title: s['title'], outcome: s['outcome'] }]
        : []
    })
    : []
  if (steps.length === 0) return undefined
  return {
    messageId: value['messageId'], title: p['title'], goal: p['goal'], acceptance: p['acceptance'], steps,
    ...typeof p['confidence'] === 'string' ? { confidence: p['confidence'] as 'high' | 'medium' | 'low' } : {},
    ...typeof p['reason'] === 'string' ? { reason: p['reason'] } : {},
  }
}

/**
 * Render a proposal as a transcript card with confirm, edit, and dismiss actions.
 * @param props - toolview phase and console locale.
 * @returns the proposal card.
 */
export function TaskProposalCard(props: TaskProposalCardProps) {
  const { t } = props
  if (props.phase !== 'result') {
    return <div className={css.card}><div className={css.heading}>{t('proposalCardTitle')}</div><p className={css.muted}>{t('proposalCardPreparing')}</p></div>
  }
  const proposal = proposalOf(props.block.meta)
  if (proposal === undefined) {
    return <div className={css.card}><div className={css.heading}>{t('proposalCardTitle')}</div><p className={css.muted}>{t('proposalCardUnavailable')}</p></div>
  }
  return <ProposalBody proposal={proposal} t={t} />
}

function ProposalBody({ proposal, t }: { readonly proposal: ProposalView; readonly t: TaskProposalCardProps['t'] }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'accepted' | 'dismissed' | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [title, setTitle] = useState(proposal.title)
  const [goal, setGoal] = useState(proposal.goal)
  const [acceptance, setAcceptance] = useState(proposal.acceptance)
  const act = (decision: 'accept' | 'dismiss'): void => {
    setBusy(true)
    setError(undefined)
    void decideProposal({
      messageId: proposal.messageId, decision,
      ...editing ? { title, goal, acceptance } : {},
    }).then((value) => { setResult(value.status) }).catch(() => { setError(t('proposalCardFailed')) }).finally(() => { setBusy(false) })
  }
  if (result !== undefined) {
    return <div className={css.card}><div className={css.heading}>{result === 'accepted' ? t('proposalCardAccepted') : t('proposalCardDismissed')}</div></div>
  }
  return (
    <div className={css.card}>
      <div className={css.heading}>{t('proposalCardTitle')}</div>
      {editing ? (
        <div className={css.form}>
          <label>{t('proposalCardTitleLabel')}<input value={title} onChange={(event) => { setTitle(event.currentTarget.value) }} /></label>
          <label>{t('proposalCardGoalLabel')}<textarea value={goal} onChange={(event) => { setGoal(event.currentTarget.value) }} /></label>
          <label>{t('proposalCardAcceptanceLabel')}<textarea value={acceptance} onChange={(event) => { setAcceptance(event.currentTarget.value) }} /></label>
        </div>
      ) : (
        <>
          <h3>{proposal.title}</h3>
          <p className={css.goal}>{proposal.goal}</p>
          <p className={css.muted}>{proposal.acceptance}</p>
        </>
      )}
      <ol className={css.steps}>
        {proposal.steps.map(step => (
          <li key={step.title}><strong>{step.title}</strong><span>{step.outcome}</span></li>
        ))}
      </ol>
      {proposal.reason === undefined ? null : <p className={css.muted}>{proposal.reason}</p>}
      {error === undefined ? null : <p className={css.error}>{error}</p>}
      <div className={css.actions}>
        <Button variant="primary" disabled={busy} onClick={() => { act('accept') }}>{editing ? t('proposalCardSave') : t('proposalCardConfirm')}</Button>
        <Button disabled={busy} onClick={() => { if (editing) { setEditing(false) } else { setEditing(true) } }}>{editing ? t('proposalCardCancelEdit') : t('proposalCardEdit')}</Button>
        <Button disabled={busy} onClick={() => { act('dismiss') }}>{t('proposalCardIgnore')}</Button>
      </div>
    </div>
  )
}
