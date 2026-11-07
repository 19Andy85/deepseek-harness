/** Model-facing bridge that writes durable Dev Console tasks and plans. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-api-session-tasks'

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

const PROMPT = 'Use console_plan_propose to turn the current task into a durable task and draft plan. '
  + 'The write is scoped to the workspace that contains the calling Session cwd; never invent a workspace id.'

/**
 * Register the plan proposal tool.
 * @param ctx - Host context with tools, prompt, agents, and the session-task service.
 */
export function registerConsoleTools(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:console-plan-propose',
    order: ctx.systemPrompt.getSectionOrder('TOOL_SESSION_TASKS') + 1,
    text: PROMPT,
  })
  ctx.tools.register(defineTool({
    name: 'console_plan_propose',
    description: 'Create a dev-console task and its first draft plan from the current Session.',
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
      return JSON.stringify({ briefId: result.brief.id, planId: result.plan.id, version: result.plan.version })
    },
  }))
}
