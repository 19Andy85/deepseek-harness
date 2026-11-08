/**
 * Model-facing read-only live session task overview for one Host.
 *
 * @module @deepseek-ai/dsh-experimental-tool-session-tasks
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  callerAgent, gatherSessionTasks, renderSessionTasks, VISIBLE_SCOPES, type VisibleScope,
} from './tasks.ts'
import { registerConsoleTools } from './console-tools.ts'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'tool-session-tasks'

/** Capability services required by the model-facing consumer. */
export const inject = ['tools', 'systemPrompt', 'agents', 'sessionTasks']

/** Default visibility scope: the caller plus sessions created in the same working directory. */
export const DEFAULT_VISIBLE_SCOPE: VisibleScope = 'same-cwd'

/** Deployment-owned visibility policy for the overview. */
export interface Config {
  /** Which live sessions the tool may reveal. Defaults to `same-cwd`. */
  visibleScope?: VisibleScope
}

/** Schemastery config for Loader defaults and generated documentation. */
export const Config: z<Config> = z.object({
  visibleScope: z.union([z.const('self'), z.const('same-cwd'), z.const('host')]).default(DEFAULT_VISIBLE_SCOPE),
})

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

const PROMPT_TEXT =
  'Use session_tasks to list the sessions currently active in this Host with the activity families still running '
  + 'for each one. Pass session_id to restrict the overview to one session and include to keep selected families. '
  + 'The result is a read-only snapshot; it never returns transcript text.'

/**
 * Register the overview tool and its shared model guidance.
 * @param ctx - Host context with tools, prompt, and Agent services.
 * @param config - Visibility policy for the overview.
 */
export function apply(ctx: Context, config: Config): void {
  const scope = resolveVisibleScope(config)
  ctx.systemPrompt.section({
    name: 'tool:session-tasks',
    order: 2310,
    text: PROMPT_TEXT,
  })

  registerConsoleTools(ctx)

  ctx.tools.register(defineTool({
    name: 'session_tasks',
    description: 'List live sessions in this Host with the activity families still running for each one.',
    parameters: {
      session_id: { type: 'string', description: 'Restrict the overview to one visible session id.' },
      include: {
        type: 'array',
        items: { type: 'string' },
        description: 'Activity families to keep (turn, job, subagent, schedule); omit for every family.',
      },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args, exec) => {
      const caller = callerAgent(exec)
      const rows = await gatherSessionTasks({
        agents: ctx.agents,
        activityOf: sessionId => ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([])),
      }, caller, {
        scope,
        ...args.session_id === undefined ? {} : { sessionId: args.session_id },
        ...args.include === undefined ? {} : { include: args.include },
      }, exec.signal)
      return renderSessionTasks(rows)
    },
  }))
}

function resolveVisibleScope(config: Config): VisibleScope {
  const scope = config.visibleScope ?? DEFAULT_VISIBLE_SCOPE
  if (!VISIBLE_SCOPES.includes(scope)) {
    throw new TypeError(`tool-session-tasks: visibleScope must be one of ${VISIBLE_SCOPES.join(', ')}`)
  }
  return scope
}
