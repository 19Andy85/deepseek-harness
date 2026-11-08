/** Out-of-tree actions the console proposal card invokes. */
export interface ProposalDecisionInput {
  readonly messageId: string
  readonly decision: 'accept' | 'dismiss'
  readonly title?: string | undefined
  readonly goal?: string | undefined
  readonly acceptance?: string | undefined
}

export interface ProposalDecisionResult {
  readonly status: 'accepted' | 'dismissed'
}

type Decider = (input: ProposalDecisionInput) => Promise<ProposalDecisionResult>

export interface PendingProposalRow {
  readonly messageId: string
  readonly title: string
  readonly goal: string
  readonly acceptance: string
}

type Lister = (sessionId: string) => Promise<readonly PendingProposalRow[]>

let decider: Decider | undefined
let lister: Lister | undefined

/** @param next - pending-proposal reader installed by the client plugin. */
export function setProposalLister(next: Lister | undefined): void { lister = next }

/**
 * Read pending proposals for one Session.
 * @param sessionId - source Session.
 * @returns pending proposal rows.
 */
export async function loadPendingProposals(sessionId: string): Promise<readonly PendingProposalRow[]> {
  if (lister === undefined) return []
  return lister(sessionId)
}

/** @param next - console Remote decider installed by the client plugin. */
export function setProposalDecider(next: Decider | undefined): void {
  decider = next
}

/**
 * Decide a proposal from the transcript card.
 * @param input - message and maintainer decision.
 * @returns the decision result.
 */
export async function decideProposal(input: ProposalDecisionInput): Promise<ProposalDecisionResult> {
  if (decider === undefined) throw new Error('console proposal bridge is unavailable')
  return decider(input)
}
