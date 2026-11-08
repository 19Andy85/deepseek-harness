/**
 * Durable Dev Console message bus and Brief records. One message table viewed
 * from the sender or recipient perspective, plus a manual Brief state machine.
 *
 * @module @deepseek-ai/dsh-experimental-api-session-tasks/dev-console-bus
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'

/** Acting roles recognized by the console. */
export type DevConsoleRole = 'maintainer' | 'implementer' | 'workspace-reviewer' | 'system'

/** Message kinds. */
export type DevConsoleMessageKind = 'note' | 'request' | 'decision' | 'handoff' | 'report'

/** Message lifecycle states. */
export type DevConsoleMessageStatus = 'unread' | 'acknowledged' | 'resolved' | 'stale'

/** Brief lifecycle states. */
export type DevConsoleBriefStatus = 'draft' | 'ready' | 'assigned' | 'in_review' | 'accepted' | 'changes_requested' | 'closed'

/** Plan lifecycle states. */
export type DevConsolePlanStatus = 'draft' | 'approved' | 'superseded' | 'completed'

/** One plan step. */
export interface DevConsolePlanStep {
  readonly id: string
  readonly title: string
  readonly outcome: string
  readonly status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'skipped'
  readonly dependsOn: readonly string[]
  readonly evidence: readonly string[]
  readonly sessionRefs: readonly { readonly sessionId: string; readonly seq: number }[]
}

/** Session that originated a task or plan proposal. */
export interface DevConsoleSourceSessionRef {
  readonly sessionId: string
  readonly cwd?: string | undefined
}

/** A versioned plan for a Brief, or a local plan for one parent plan/step. */
export interface DevConsolePlan {
  readonly id: string
  readonly briefId: string
  readonly workspaceId: string
  readonly title: string
  readonly version: number
  readonly status: DevConsolePlanStatus
  readonly steps: readonly DevConsolePlanStep[]
  readonly parentPlanId?: string | undefined
  readonly sourceSessionRef?: DevConsoleSourceSessionRef | undefined
  readonly changeReason?: string | undefined
  readonly createdBy: DevConsoleRole
  readonly approvedBy?: DevConsoleRole | undefined
  readonly createdAt: number
  readonly updatedAt: number
  readonly approvedAt?: number | undefined
}

/** Assignment details of a Brief. */
export interface DevConsoleAssignment {
  readonly assigneeRole: DevConsoleRole
  readonly assignedBy: DevConsoleRole
  readonly assignedAt: number
}

/** Optional structured payload of a message. */
export interface DevConsoleMessagePayload {
  /** Chosen option for a decision message. */
  readonly selectedOption?: string | undefined
  /** Reasoning for a decision or rejection. */
  readonly reason?: string | undefined
  /** Handoff evidence. */
  readonly handoff?: {
    readonly branch: string
    readonly commit: string
    readonly summary: string
    readonly tests: readonly string[]
    readonly risks?: string | undefined
    readonly nextSteps?: string | undefined
  } | undefined
  /** A task proposal awaiting maintainer confirmation. */
  readonly proposal?: DevConsoleTaskProposal | undefined
}

/** A task proposal persisted as a message, not yet a task. */
export interface DevConsoleTaskProposal {
  readonly title: string
  readonly goal: string
  readonly acceptance: string
  readonly steps: readonly { readonly title: string; readonly outcome: string }[]
  readonly sourceSessionRef?: DevConsoleSourceSessionRef | undefined
  readonly confidence?: 'high' | 'medium' | 'low' | undefined
  readonly reason?: string | undefined
  readonly status: 'pending' | 'accepted' | 'dismissed'
}

/** One durable message. */
export interface DevConsoleMessage {
  readonly id: string
  readonly threadId: string
  readonly fromRole: DevConsoleRole
  readonly toRole: DevConsoleRole
  readonly workspaceId?: string | undefined
  readonly briefId?: string | undefined
  readonly planId?: string | undefined
  readonly stepId?: string | undefined
  readonly kind: DevConsoleMessageKind
  readonly subject: string
  readonly body: string
  readonly status: DevConsoleMessageStatus
  readonly requiresResponse: boolean
  readonly createdAt: number
  readonly updatedAt: number
  readonly payload?: DevConsoleMessagePayload | undefined
}

/** One Brief and its transition history. */
export interface DevConsoleBrief {
  readonly id: string
  readonly workspaceId: string
  readonly title: string
  readonly goal: string
  readonly acceptance: string
  readonly status: DevConsoleBriefStatus
  readonly authorRole: DevConsoleRole
  readonly assigneeRole?: DevConsoleRole | undefined
  readonly assignment?: DevConsoleAssignment | undefined
  readonly sourceSessionRef?: DevConsoleSourceSessionRef | undefined
  readonly createdAt: number
  readonly updatedAt: number
  readonly history: readonly {
    readonly at: number
    readonly from: DevConsoleBriefStatus
    readonly to: DevConsoleBriefStatus
    readonly role: DevConsoleRole
    readonly reason?: string | undefined
  }[]
}

/** Structured instruction from the console back into one Session. */
export interface DevConsoleDirective {
  readonly id: string
  readonly sessionId: string
  readonly type: string
  readonly briefId?: string | undefined
  readonly planId?: string | undefined
  readonly summary: string
  readonly payload?: string | undefined
  readonly source: 'maintainer'
  readonly createdAt: number
  readonly status: 'pending' | 'delivered' | 'failed'
}

/** Persisted bus state. */
export interface DevConsoleBusState {
  readonly messages: readonly DevConsoleMessage[]
  readonly briefs: readonly DevConsoleBrief[]
  readonly plans: readonly DevConsolePlan[]
  readonly directives: readonly DevConsoleDirective[]
}

const roleSchema: z.ZodType<DevConsoleRole> = z.union([
  z.enum(['maintainer', 'implementer', 'workspace-reviewer', 'system']),
  z.literal('domain-reviewer').transform((): DevConsoleRole => 'workspace-reviewer'),
])
const kindSchema = z.enum(['note', 'request', 'decision', 'handoff', 'report'])
const statusSchema = z.enum(['unread', 'acknowledged', 'resolved', 'stale'])
const briefStatusSchema = z.enum(['draft', 'ready', 'assigned', 'in_review', 'accepted', 'changes_requested', 'closed'])

const handoffSchema = z.object({
  branch: z.string().min(1),
  commit: z.string().min(1),
  summary: z.string().min(1),
  tests: z.array(z.string()),
  risks: z.string().optional(),
  nextSteps: z.string().optional(),
}).strict()

const proposalStepSchema = z.object({ title: z.string().min(1), outcome: z.string().min(1) }).strict()
const proposalSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  acceptance: z.string().min(1),
  steps: z.array(proposalStepSchema).min(1),
  sourceSessionRef: z.object({ sessionId: z.string().min(1), cwd: z.string().optional() }).strict().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  reason: z.string().optional(),
  status: z.enum(['pending', 'accepted', 'dismissed']),
}).strict()

const payloadSchema = z.object({
  selectedOption: z.string().optional(),
  reason: z.string().optional(),
  handoff: handoffSchema.optional(),
  proposal: proposalSchema.optional(),
}).strict()

const assignmentSchema = z.object({
  assigneeRole: roleSchema,
  assignedBy: roleSchema,
  assignedAt: z.number().nonnegative(),
}).strict()

const messageSchema: z.ZodType<DevConsoleMessage> = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  fromRole: roleSchema,
  toRole: roleSchema,
  workspaceId: z.string().optional(),
  briefId: z.string().optional(),
  planId: z.string().optional(),
  stepId: z.string().optional(),
  kind: kindSchema,
  subject: z.string().min(1),
  body: z.string(),
  status: statusSchema,
  requiresResponse: z.boolean(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  payload: payloadSchema.optional(),
}).strict()

const sourceSessionSchema = z.object({ sessionId: z.string().min(1), cwd: z.string().optional() }).strict()

const briefSchema: z.ZodType<DevConsoleBrief> = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  acceptance: z.string().min(1),
  status: briefStatusSchema,
  authorRole: roleSchema,
  assigneeRole: roleSchema.optional(),
  assignment: assignmentSchema.optional(),
  sourceSessionRef: sourceSessionSchema.optional(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  history: z.array(z.object({
    at: z.number().nonnegative(),
    from: briefStatusSchema,
    to: briefStatusSchema,
    role: roleSchema,
    reason: z.string().optional(),
  }).strict()),
}).strict()

const planStepSchema: z.ZodType<DevConsolePlanStep> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  outcome: z.string().min(1),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'skipped']),
  dependsOn: z.array(z.string()),
  evidence: z.array(z.string()),
  sessionRefs: z.array(z.object({ sessionId: z.string(), seq: z.number().nonnegative() }).strict()),
}).strict()

const planSchema: z.ZodType<DevConsolePlan> = z.object({
  id: z.string().min(1),
  briefId: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  version: z.number().int().nonnegative(),
  status: z.enum(['draft', 'approved', 'superseded', 'completed']),
  steps: z.array(planStepSchema),
  parentPlanId: z.string().optional(),
  sourceSessionRef: sourceSessionSchema.optional(),
  changeReason: z.string().optional(),
  createdBy: roleSchema,
  approvedBy: roleSchema.optional(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  approvedAt: z.number().nonnegative().optional(),
}).strict()

const directiveSchema: z.ZodType<DevConsoleDirective> = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.string().min(1),
  briefId: z.string().optional(),
  planId: z.string().optional(),
  summary: z.string().min(1),
  payload: z.string().optional(),
  source: z.literal('maintainer'),
  createdAt: z.number().nonnegative(),
  status: z.enum(['pending', 'delivered', 'failed']),
}).strict()

const busStateSchema: z.ZodType<DevConsoleBusState> = z.object({
  messages: z.array(messageSchema),
  briefs: z.array(briefSchema),
  plans: z.array(planSchema).default([]),
  directives: z.array(directiveSchema).default([]),
}).strict()

/** Storage domain holding messages and Briefs. */
export const devConsoleBusDomain = defineDomain({
  name: 'experimental_dev_console_bus',
  version: 1,
  tables: {},
  global: { schema: busStateSchema, initial: { messages: [], briefs: [], plans: [], directives: [] } },
})

/** Empty bus state. */
export const EMPTY_DEV_CONSOLE_BUS: DevConsoleBusState = { messages: [], briefs: [], plans: [], directives: [] }

/** Create one outbound message. */
export function createMessage(input: {
  readonly fromRole: DevConsoleRole
  readonly toRole: DevConsoleRole
  readonly workspaceId?: string | undefined
  readonly briefId?: string | undefined
  readonly planId?: string | undefined
  readonly stepId?: string | undefined
  readonly kind: DevConsoleMessageKind
  readonly subject: string
  readonly body: string
  readonly requiresResponse?: boolean
  readonly payload?: DevConsoleMessagePayload | undefined
  readonly threadId?: string
}): DevConsoleMessage {
  const now = Date.now()
  return {
    id: randomUUID(),
    threadId: input.threadId ?? randomUUID(),
    fromRole: input.fromRole,
    toRole: input.toRole,
    ...input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId },
    ...input.briefId === undefined ? {} : { briefId: input.briefId },
    ...input.planId === undefined ? {} : { planId: input.planId },
    ...input.stepId === undefined ? {} : { stepId: input.stepId },
    kind: input.kind,
    subject: input.subject,
    body: input.body,
    status: 'unread',
    requiresResponse: input.requiresResponse ?? false,
    createdAt: now,
    updatedAt: now,
    ...input.payload === undefined ? {} : { payload: input.payload },
  }
}

/** Allowed Brief transitions. */
export const BRIEF_TRANSITIONS: Readonly<Record<DevConsoleBriefStatus, readonly DevConsoleBriefStatus[]>> = {
  draft: ['ready', 'closed'],
  ready: ['assigned', 'closed'],
  assigned: ['in_review', 'closed'],
  in_review: ['accepted', 'changes_requested', 'closed'],
  changes_requested: ['assigned', 'closed'],
  accepted: ['closed'],
  closed: [],
}
