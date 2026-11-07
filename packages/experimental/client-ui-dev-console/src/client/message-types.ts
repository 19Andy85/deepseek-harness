/** Durable message, task, and plan wire types shared by the console. */
export type Role = 'maintainer' | 'implementer' | 'workspace-reviewer' | 'system'
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

export interface InboxItemView {
  readonly id: string
  readonly kind: 'message' | 'brief' | 'plan'
  readonly title: string
  readonly detail: string
  readonly briefId?: string | undefined
  readonly planId?: string | undefined
  readonly messageId?: string | undefined
  readonly action: 'approve-plan' | 'review-handoff' | 'handle-message' | 'assign-brief'
}

export interface PlanStepView {
  readonly id: string
  readonly title: string
  readonly outcome: string
  readonly status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'skipped'
  readonly evidence: readonly string[]
}

export interface PlanView {
  readonly id: string
  readonly briefId: string
  readonly workspaceId: string
  readonly title: string
  readonly version: number
  readonly status: 'draft' | 'approved' | 'superseded' | 'completed'
  readonly steps: readonly PlanStepView[]
  readonly parentPlanId?: string | undefined
  readonly changeReason?: string | undefined
  readonly approvedAt?: number | undefined
}

export interface MessageCenterInjected {
  readonly inbox: (role: Role) => Promise<readonly InboxItemView[]>
  readonly plans: (briefId?: string) => Promise<readonly PlanView[]>
  readonly createPlan: (input: {
    readonly briefId: string
    readonly title: string
    readonly steps: readonly { readonly title: string; readonly outcome: string }[]
  }) => Promise<PlanView>
  readonly approvePlan: (planId: string) => Promise<PlanView>
  readonly deliverDirective: (input: {
    readonly sessionId: string
    readonly type: string
    readonly briefId?: string | undefined
    readonly planId?: string | undefined
    readonly summary: string
  }) => Promise<unknown>
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
