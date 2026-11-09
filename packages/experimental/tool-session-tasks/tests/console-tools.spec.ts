/** Console tool registration, proposal forwarding, and inline block registration. */

import { describe, expect, it } from 'vitest'
import { registerConsoleTools } from '../src/console-tools.ts'

interface RegisteredTool {
  readonly name: string
  readonly execute: (args: Record<string, unknown>, exec: unknown) => Promise<string>
  readonly output: {
    readonly presentationMeta?: (args: unknown, value: string) => unknown
  }
}

interface ToolCall {
  readonly sessionId: string
  readonly type: string
  readonly props: Record<string, unknown>
  readonly actions: readonly string[] | undefined
}

function fixture(run: (input: unknown) => unknown = () => undefined) {
  const tools: RegisteredTool[] = []
  const calls: unknown[] = []
  const blocks: ToolCall[] = []
  const service = {
    devConsoleSuggestTask: async (input: unknown) => {
      calls.push(input)
      return { messageId: 'message-1', blockId: 'block-1', proposal: { title: 'Task', goal: 'Goal', acceptance: 'Done', steps: [], status: 'pending' } }
    },
    devConsoleProposeFromAgent: async (input: unknown) => {
      calls.push(input)
      return { brief: { id: 'brief-1' }, plan: { id: 'plan-1', version: 1, steps: [{ id: 'step-1', title: 'Step', outcome: 'Result', status: 'todo' }] } }
    },
    devConsoleCreateBlock: async (input: {
      sessionId: string
      type: string
      props: Record<string, unknown>
      actions?: readonly string[]
    }) => {
      blocks.push({ sessionId: input.sessionId, type: input.type, props: input.props, actions: input.actions })
      run(input)
      return { id: 'block-1', sessionId: input.sessionId, type: input.type, props: input.props, actions: input.actions ?? [], status: 'pending', createdAt: 1, updatedAt: 1 }
    },
  }
  const ctx = {
    systemPrompt: { section: () => {}, getSectionOrder: () => 0 },
    tools: { register: (tool: RegisteredTool) => { tools.push(tool) } },
    get: (name: string) => name === 'sessionTasks' ? service : undefined,
  }
  registerConsoleTools(ctx as never)
  return { tools, calls, blocks, ctx, service }
}

function tool(tools: readonly RegisteredTool[], name: string): RegisteredTool {
  const found = tools.find(candidate => candidate.name === name)
  if (found === undefined) throw new Error(`tool ${name} was not registered`)
  return found
}

describe('registerConsoleTools', () => {
  it('registers the proposal, block, update, report, and handoff tools', () => {
    const { tools } = fixture()
    expect(tools.map(item => item.name)).toEqual([
      'console_task_suggest', 'interactive_block', 'console_plan_propose', 'console_plan_update_step', 'console_report', 'console_handoff', 'console_task_transition',
    ])
  })

  it('forwards a plan proposal and records the block that carries its actions', async () => {
    const { tools, calls } = fixture()
    const result = await tool(tools, 'console_task_suggest').execute(
      { title: 'Task', goal: 'Goal', acceptance: 'Done', steps: [{ title: 'Step', outcome: 'Result' }] },
      { agent: { session: { id: 'session-1', header: { cwd: '/work' } } } },
    )
    expect(JSON.parse(result)).toMatchObject({ messageId: 'message-1', blockId: 'block-1' })
    expect(calls).toEqual([expect.objectContaining({ sessionId: 'session-1', cwd: '/work', title: 'Task' })])
  })

  it('publishes the task proposal block with its Host identity and actions', async () => {
    const { tools } = fixture()
    const value = await tool(tools, 'console_task_suggest').execute(
      { title: 'Task', goal: 'Goal', acceptance: 'Done', steps: [{ title: 'Step', outcome: 'Result' }] },
      { agent: { session: { id: 'session-1', header: {} } } },
    )
    const meta = tool(tools, 'console_task_suggest').output.presentationMeta?.({}, value) as {
      readonly inline: boolean
      readonly block: { readonly blockId?: string; readonly actions?: readonly string[]; readonly type: string }
    }
    expect(meta.inline).toBe(true)
    expect(meta.block.type).toBe('task-proposal')
    expect(meta.block.blockId).toBe('block-1')
    expect(meta.block.actions).toEqual(['confirm', 'ignore'])
  })

  it('registers a choice block and derives its action ids from the options', async () => {
    const { tools, blocks } = fixture()
    const result = await tool(tools, 'interactive_block').execute(
      { type: 'choice', props: { options: ['A', 'B', 'A'] } },
      { agent: { session: { id: 'session-1', header: {} } } },
    )
    expect(blocks).toEqual([{ sessionId: 'session-1', type: 'choice', props: { options: ['A', 'B', 'A'] }, actions: ['A', 'B'] }])
    expect(JSON.parse(result)).toEqual({
      version: 1, type: 'choice', props: { options: ['A', 'B', 'A'] }, blockId: 'block-1', actions: ['A', 'B'], status: 'pending',
    })
  })

  it('keeps explicit action ids and rejects an unbound or untyped block call', async () => {
    const { tools, blocks } = fixture()
    await tool(tools, 'interactive_block').execute(
      { type: 'approval', props: { title: 'Ship it' }, actions: ['approve', 'reject'] },
      { agent: { session: { id: 'session-1', header: {} } } },
    )
    expect(blocks[0]?.actions).toEqual(['approve', 'reject'])
    await expect(tool(tools, 'interactive_block').execute(
      { type: 'choice', props: { options: ['A'] } }, {},
    )).rejects.toThrow('requires an agent-bound caller')
    await expect(tool(tools, 'interactive_block').execute(
      { type: '  ', props: {} }, { agent: { session: { id: 'session-1', header: {} } } },
    )).rejects.toThrow('requires a registered block type')
  })

  it('reports a missing console service instead of inventing a block', async () => {
    const tools: RegisteredTool[] = []
    const withoutService = {
      systemPrompt: { section: () => {}, getSectionOrder: () => 0 },
      tools: { register: (item: RegisteredTool) => { tools.push(item) } },
      get: () => undefined,
    }
    registerConsoleTools(withoutService as never)
    await expect(tool(tools, 'interactive_block').execute(
      { type: 'choice', props: { options: ['A'] } },
      { agent: { session: { id: 'session-1', header: {} } } },
    )).rejects.toThrow('require the sessionTasks service')
  })
})
