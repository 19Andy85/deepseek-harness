import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import LlmRuntime, { ToolCallId } from '@deepseek-ai/dsh-llm'
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import WorkingDirectoryService from '@deepseek-ai/dsh-working-directory'
import * as ToolSessionTasks from '../src/index.ts'

let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('session tasks tool through real Loader composition', () => {
  it('lists visible live sessions with provider activity, hides foreign sessions, and unregisters on disposal', async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-session-tasks-loader-')))
    const work = join(root, 'work')
    const other = join(root, 'other')
    await mkdir(work)
    await mkdir(other)

    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-agent', AgentRegistry],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-llm', LlmRuntime],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-tool-executor-native', NativeToolExecutor],
      ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
      ['@deepseek-ai/dsh-subprocess-local', LocalSubprocessRuntime],
      ['@deepseek-ai/dsh-sandbox-local', LocalSandbox],
      ['@deepseek-ai/dsh-sandbox-policy', SandboxPolicyService],
      ['@deepseek-ai/dsh-working-directory', WorkingDirectoryService],
      ['@deepseek-ai/dsh-experimental-tool-session-tasks', ToolSessionTasks],
      ['@deepseek-ai/dsh-agent-loop', AgentLoop],
    ])
    const config = [...modules.keys()].flatMap(name => [
      `- name: 'cordis:${name}'`,
      ...name === '@deepseek-ai/dsh-sandbox-policy' ? ['  config:', '    mode: danger-full-access'] : [],
      ...name === '@deepseek-ai/dsh-agent-loop' ? ['  config:', '    agents: []'] : [],
      ...name === '@deepseek-ai/dsh-experimental-tool-session-tasks'
        ? ['  config:', '    visibleScope: same-cwd'] : [],
    ]).join('\n') + '\n'
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, config)
    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    for (const [specifier, plugin] of modules) context.loader.builtins[specifier] = plugin
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    context.on('workspace/session-activity', async ({ sessionId }, next) => [
      { kind: 'job', items: [{ id: `job-${sessionId}`, label: 'fixture job' }] },
      ...await next(),
    ])

    const caller = await context.agentLoop.create(SessionId('caller'), {}, { cwd: work })
    await context.agentLoop.create(SessionId('sibling'), {}, { cwd: work })
    await context.agentLoop.create(SessionId('outside'), {}, { cwd: other })

    expect(context.tools.get('session_tasks')).toBeDefined()
    const result = await executeToolFixture(context, {
      name: 'session_tasks',
      callId: ToolCallId('overview'),
      arguments: {},
      agent: caller,
      signal: new AbortController().signal,
    })
    expect(result.isError).not.toBe(true)
    const rows = JSON.parse(result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')) as Array<{
      sessionId: string
      status: string
      activity: Array<{ kind: string; items: Array<{ id: string; label: string }> }>
    }>
    expect(rows.map(row => row.sessionId)).toEqual(['caller', 'sibling'])
    expect(rows[0]?.status).toBe('idle')
    expect(rows[0]?.activity).toEqual([{ kind: 'job', items: [{ id: 'job-caller', label: 'fixture job' }] }])

    const hidden = await executeToolFixture(context, {
      name: 'session_tasks',
      callId: ToolCallId('hidden'),
      arguments: { session_id: 'outside' },
      agent: caller,
      signal: new AbortController().signal,
    })
    expect(hidden.content).toEqual([{ type: 'text', text: 'No visible sessions are currently active.' }])

    const unbound = await executeToolFixture(context, {
      name: 'session_tasks',
      callId: ToolCallId('unbound'),
      arguments: {},
      signal: new AbortController().signal,
    })
    expect(unbound.isError).toBe(true)
    expect(unbound.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n'))
      .toContain('requires an agent-bound caller')

    const entry = [...context.loader.entries()]
      .find(candidate => candidate.options.name === 'cordis:@deepseek-ai/dsh-experimental-tool-session-tasks')
    await entry!.fiber!.dispose()
    expect(context.tools.schemas().some(tool => tool.name === 'session_tasks')).toBe(false)
  })
})
