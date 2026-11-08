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

let decider: Decider | undefined

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
