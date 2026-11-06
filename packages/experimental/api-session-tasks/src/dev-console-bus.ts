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
export type DevConsoleRole = 'maintainer' | 'implementer' | 'domain-reviewer' | 'system'

/** Message kinds. */
export type DevConsoleMessageKind = 'note' | 'request' | 'decision' | 'handoff' | 'report'

/** Message lifecycle states. */
export type DevConsoleMessageStatus = 'unread' | 'acknowledged' | 'resolved' | 'stale'

/** Brief lifecycle states. */
export type DevConsoleBriefStatus = 'draft' | 'ready' | 'assigned' | 'in_review' | 'accepted' | 'changes_requested' | 'closed'

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
}

/** One durable message. */
export interface DevConsoleMessage {
  readonly id: string
  readonly threadId: string
  readonly fromRole: DevConsoleRole
  readonly toRole: DevConsoleRole
  readonly workspaceId?: string | undefined
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

/** Persisted bus state. */
export interface DevConsoleBusState {
  readonly messages: readonly DevConsoleMessage[]
  readonly briefs: readonly DevConsoleBrief[]
}

const roleSchema = z.enum(['maintainer', 'implementer', 'domain-reviewer', 'system'])
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

const payloadSchema = z.object({
  selectedOption: z.string().optional(),
  reason: z.string().optional(),
  handoff: handoffSchema.optional(),
}).strict()

const messageSchema: z.ZodType<DevConsoleMessage> = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  fromRole: roleSchema,
  toRole: roleSchema,
  workspaceId: z.string().optional(),
  kind: kindSchema,
  subject: z.string().min(1),
  body: z.string(),
  status: statusSchema,
  requiresResponse: z.boolean(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  payload: payloadSchema.optional(),
}).strict()

const briefSchema: z.ZodType<DevConsoleBrief> = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  acceptance: z.string().min(1),
  status: briefStatusSchema,
  authorRole: roleSchema,
  assigneeRole: roleSchema.optional(),
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

const busStateSchema: z.ZodType<DevConsoleBusState> = z.object({
  messages: z.array(messageSchema),
  briefs: z.array(briefSchema),
}).strict()

/** Storage domain holding messages and Briefs. */
export const devConsoleBusDomain = defineDomain({
  name: 'experimental_dev_console_bus',
  version: 1,
  tables: {},
  global: { schema: busStateSchema, initial: { messages: [], briefs: [] } },
})

/** Empty bus state. */
export const EMPTY_DEV_CONSOLE_BUS: DevConsoleBusState = { messages: [], briefs: [] }

/** Create one outbound message. */
export function createMessage(input: {
  readonly fromRole: DevConsoleRole
  readonly toRole: DevConsoleRole
  readonly workspaceId?: string | undefined
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
