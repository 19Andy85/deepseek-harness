/** Model-facing bridge that writes durable Dev Console tasks and plans. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-api-session-tasks'

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

const PROMPT = 'Use these console tools only when the maintainer explicitly asks you to create or update a dev-console task, '
  + 'or when a console directive asks for it. Do not create a console task as a side effect of ordinary work. '
  + 'Use console_plan_update_step, console_report, console_handoff, and console_task_transition only for an existing task. '
  + 'These writes are scoped to the calling Session; never invent a workspace id.'

/**
 * Register the plan proposal tool.
 * @param ctx - Host context with tools, prompt, agents, and the session-task service.
 */
export function registerConsoleTools(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:console-plan-propose',
    order: 2311,
    text: PROMPT,
  })
  ctx.tools.register(defineTool({
    name: 'console_task_suggest',
    description: 'Suggest a task and draft plan for maintainer confirmation without creating it.',
    parameters: {
      title: { type: 'string', description: 'Task title.' },
      goal: { type: 'string', description: 'Why the task exists.' },
      acceptance: { type: 'string', description: 'What acceptance means.' },
      steps: {
        type: 'array',
        description: 'Plan steps with a title and expected outcome.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Step title.' },
            outcome: { type: 'string', description: 'Expected step outcome.' },
          },
          additionalProperties: false,
        },
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Confidence that this should become a task.' },
      reason: { type: 'string', description: 'Why the task should be created now.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
      presentationMeta: (_args, value) => ({ ...JSON.parse(value) as Record<string, unknown>, inline: true }) as never,
    },
    isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('console_task_suggest requires an agent-bound caller')
      const input = args as {
        readonly title?: string
        readonly goal?: string
        readonly acceptance?: string
        readonly steps?: readonly { readonly title?: string; readonly outcome?: string }[]
        readonly confidence?: 'high' | 'medium' | 'low'
        readonly reason?: string
      }
      const steps = (input.steps ?? []).map(step => ({ title: step.title ?? '', outcome: step.outcome ?? '' }))
        .filter(step => step.title.trim() !== '' && step.outcome.trim() !== '')
      if (input.title === undefined || input.goal === undefined || input.acceptance === undefined || steps.length === 0) {
        throw new Error('console_task_suggest requires title, goal, acceptance, and at least one complete step')
      }
      const result = await ctx.sessionTasks.devConsoleSuggestTask({
        sessionId: agent.session.id,
        ...agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd },
        title: input.title, goal: input.goal, acceptance: input.acceptance, steps,
        ...input.confidence === undefined ? {} : { confidence: input.confidence },
        ...input.reason === undefined ? {} : { reason: input.reason },
      })
      return JSON.stringify(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'console_plan_propose',
    description: 'Create a dev-console task and draft plan only on an explicit maintainer request or console directive.',
    parameters: {
      title: { type: 'string', description: 'Task title.' },
      goal: { type: 'string', description: 'Why the task exists.' },
      acceptance: { type: 'string', description: 'What acceptance means.' },
      steps: {
        type: 'array',
        description: 'Plan steps with a title and expected outcome.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Step title.' },
            outcome: { type: 'string', description: 'Expected step outcome.' },
          },
          additionalProperties: false,
        },
      },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('console_plan_propose requires an agent-bound caller')
      const input = args as {
        readonly title?: string
        readonly goal?: string
        readonly acceptance?: string
        readonly steps?: readonly { readonly title?: string; readonly outcome?: string }[]
      }
      const steps = (input.steps ?? []).map(step => ({
        title: step.title ?? '',
        outcome: step.outcome ?? '',
      })).filter(step => step.title.trim() !== '' && step.outcome.trim() !== '')
      if (input.title === undefined || input.goal === undefined || input.acceptance === undefined || steps.length === 0) {
        throw new Error('console_plan_propose requires title, goal, acceptance, and at least one complete step')
      }
      const result = await ctx.sessionTasks.devConsoleProposeFromAgent({
        sessionId: agent.session.id,
        ...agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd },
        title: input.title,
        goal: input.goal,
        acceptance: input.acceptance,
        steps,
      })
      return JSON.stringify({
        briefId: result.brief.id,
        planId: result.plan.id,
        version: result.plan.version,
        steps: result.plan.steps.map(step => ({
          id: step.id, title: step.title, outcome: step.outcome, status: step.status,
        })),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'console_plan_update_step',
    description: 'Record the status or evidence of one dev-console plan step.',
    parameters: {
      plan_id: { type: 'string', description: 'Plan id returned by console_plan_propose.' },
      step_id: { type: 'string', description: 'Step id from the plan.' },
      status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done', 'skipped'], description: 'New step status.' },
      evidence: { type: 'string', description: 'Evidence text; required when status is done.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => {
      const input = args as { plan_id?: string; step_id?: string; status?: 'todo' | 'in_progress' | 'blocked' | 'done' | 'skipped'; evidence?: string }
      if (input.plan_id === undefined || input.step_id === undefined || input.status === undefined) {
        throw new Error('console_plan_update_step requires plan_id, step_id, and status')
      }
      const plan = await ctx.sessionTasks.devConsoleUpdatePlanStep({
        planId: input.plan_id, stepId: input.step_id, status: input.status, role: 'implementer',
        ...input.evidence === undefined ? {} : { evidence: input.evidence },
      })
      return JSON.stringify({ planId: plan.id, stepId: input.step_id, status: input.status })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'console_report',
    description: 'Send a report from the current execution Agent to the maintainer.',
    parameters: {
      subject: { type: 'string', description: 'Report subject.' },
      body: { type: 'string', description: 'Report body.' },
      brief_id: { type: 'string', description: 'Optional task id this report belongs to.' },
      plan_id: { type: 'string', description: 'Optional plan id this report belongs to.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => {
      const input = args as { subject?: string; body?: string; brief_id?: string; plan_id?: string }
      if (input.subject === undefined || input.body === undefined) throw new Error('console_report requires subject and body')
      const message = await ctx.sessionTasks.devConsoleSendMessage({
        fromRole: 'implementer', toRole: 'maintainer', kind: 'report', subject: input.subject, body: input.body,
        ...input.brief_id === undefined ? {} : { briefId: input.brief_id },
        ...input.plan_id === undefined ? {} : { planId: input.plan_id },
      })
      return JSON.stringify({ messageId: message.id })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'console_handoff',
    description: 'Submit a handoff for maintainer review.',
    parameters: {
      brief_id: { type: 'string', description: 'Task id this handoff belongs to.' },
      branch: { type: 'string', description: 'Branch name.' },
      commit: { type: 'string', description: 'Commit id.' },
      summary: { type: 'string', description: 'What was delivered.' },
      tests: { type: 'array', items: { type: 'string' }, description: 'Tests that passed.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => {
      const input = args as { brief_id?: string; branch?: string; commit?: string; summary?: string; tests?: readonly string[] }
      if (input.brief_id === undefined || input.branch === undefined || input.commit === undefined
        || input.summary === undefined || input.tests === undefined || input.tests.length === 0) {
        throw new Error('console_handoff requires brief_id, branch, commit, summary, and tests')
      }
      const message = await ctx.sessionTasks.devConsoleHandoff({
        briefId: input.brief_id, fromRole: 'implementer', toRole: 'maintainer',
        branch: input.branch, commit: input.commit, summary: input.summary, tests: [...input.tests],
      })
      return JSON.stringify({ messageId: message.id })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'console_task_transition',
    description: 'Move an assigned dev-console task into review for maintainer acceptance.',
    parameters: {
      brief_id: { type: 'string', description: 'Task id to transition.' },
      reason: { type: 'string', description: 'Optional reason for the transition.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => false,
    execute: async (args) => {
      const input = args as { brief_id?: string; reason?: string }
      if (input.brief_id === undefined) throw new Error('console_task_transition requires brief_id')
      const brief = await ctx.sessionTasks.devConsoleTransitionBrief({
        briefId: input.brief_id, to: 'in_review', role: 'implementer',
        ...input.reason === undefined ? {} : { reason: input.reason },
      })
      return JSON.stringify({ briefId: brief.id, status: brief.status })
    },
  }))
}
