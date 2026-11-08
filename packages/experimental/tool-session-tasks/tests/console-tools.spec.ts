/** Console tool registration and proposal forwarding. */

import { describe, expect, it } from 'vitest'
import { registerConsoleTools } from '../src/console-tools.ts'

interface RegisteredTool {
  readonly name: string
  readonly execute: (args: Record<string, unknown>, exec: unknown) => Promise<string>
}

describe('registerConsoleTools', () => {
  it('registers the proposal, update, report, and handoff tools', () => {
    const tools: RegisteredTool[] = []
    const calls: unknown[] = []
    registerConsoleTools({
      systemPrompt: { section: () => {}, getSectionOrder: () => 0 },
      tools: { register: (tool: RegisteredTool) => { tools.push(tool) } },
      sessionTasks: {
        devConsoleSuggestTask: async (input: unknown) => {
          calls.push(input)
          return { messageId: 'message-1', proposal: { title: 'Task', goal: 'Goal', acceptance: 'Done', steps: [], status: 'pending' } }
        },
        devConsoleProposeFromAgent: async (input: unknown) => {
          calls.push(input)
          return { brief: { id: 'brief-1' }, plan: { id: 'plan-1', version: 1, steps: [{ id: 'step-1', title: 'Step', outcome: 'Result', status: 'todo' }] } }
        },
      },
    } as never)
    expect(tools.map(tool => tool.name)).toEqual([
      'console_task_suggest', 'console_plan_propose', 'console_plan_update_step', 'console_report', 'console_handoff', 'console_task_transition',
    ])
    const propose = tools.find(tool => tool.name === 'console_plan_propose')
    if (propose === undefined) throw new Error('proposal tool was not registered')
    const result = propose.execute({
      title: 'Task', goal: 'Goal', acceptance: 'Done', steps: [{ title: 'Step', outcome: 'Result' }],
    }, { agent: { session: { id: 'session-1', header: { cwd: '/work' } } } })
    return result.then((value) => {
      expect(JSON.parse(value)).toEqual({ briefId: 'brief-1', planId: 'plan-1', version: 1, steps: [{ id: 'step-1', title: 'Step', outcome: 'Result', status: 'todo' }] })
      expect(calls).toEqual([expect.objectContaining({ sessionId: 'session-1', cwd: '/work', title: 'Task' })])
    })
  })
})
