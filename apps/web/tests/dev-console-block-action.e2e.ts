/** One inline choice block executes once across a double click and keeps its Host status through reload. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const DEV_CONSOLE_BUNDLE = fileURLToPath(new URL('../../../packages/experimental/dev-console-bundle', import.meta.url))
const DEV_CONSOLE_PATCH = join(DEV_CONSOLE_BUNDLE, 'cordis.patch.yml')
const DEV_CONSOLE_PACKAGE = join(DEV_CONSOLE_BUNDLE, 'package.json')
const BLOCK_ACTION_ENDPOINT = '/api/sessionTasks/devConsoleBlockAction'
const CHOICE_OPTIONS = ['A', 'B'] as const
/** Bus domain the controller opens; the test reads the same stored state the Host committed. */
const BUS_DOMAIN = 'experimental_dev_console_bus'

/** One stored block, reduced to the fields this scenario asserts. */
interface StoredBlock {
  readonly id: string
  readonly sessionId: string
  readonly type: string
  readonly status: string
}

/** One stored block action record, reduced to the fields this scenario asserts. */
interface StoredAction {
  readonly blockId: string
  readonly actionId: string
  readonly sessionId: string
  readonly idempotencyKey: string
  readonly result: string
}

/** Dev Console bus state read from the running Host. */
interface StoredBus {
  readonly blocks: readonly StoredBlock[]
  readonly blockActions: readonly StoredAction[]
}

/** One block action outcome as the browser received it. */
interface ActionOutcome {
  readonly status: string
  readonly replayed: boolean
}

/** Narrow one JSON value to a plain object. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Read one stored block, validating the fields the assertion reads. */
function storedBlock(value: unknown): StoredBlock {
  const row = record(value)
  if (row === undefined || typeof row['id'] !== 'string' || typeof row['sessionId'] !== 'string'
    || typeof row['type'] !== 'string' || typeof row['status'] !== 'string') {
    throw new Error('dev-console bus stored a malformed block')
  }
  return { id: row['id'], sessionId: row['sessionId'], type: row['type'], status: row['status'] }
}

/** Read one stored action record, validating the fields the assertion reads. */
function storedAction(value: unknown): StoredAction {
  const row = record(value)
  if (row === undefined || typeof row['blockId'] !== 'string' || typeof row['actionId'] !== 'string'
    || typeof row['sessionId'] !== 'string' || typeof row['idempotencyKey'] !== 'string'
    || typeof row['result'] !== 'string') {
    throw new Error('dev-console bus stored a malformed block action')
  }
  return {
    blockId: row['blockId'], actionId: row['actionId'], sessionId: row['sessionId'],
    idempotencyKey: row['idempotencyKey'], result: row['result'],
  }
}

/** Read the committed Dev Console bus state without opening the domain a second time. */
function storedBus(scaffold: WebScaffold): StoredBus {
  const domain = scaffold.ctx.storageDomain.get(BUS_DOMAIN)
  if (domain === undefined) throw new Error('dev-console bus domain is not open')
  const state = record(domain.global.get())
  const blocks = state?.['blocks']
  const blockActions = state?.['blockActions']
  if (state === undefined || !Array.isArray(blocks) || !Array.isArray(blockActions)) {
    throw new Error('dev-console bus state lacks blocks or blockActions')
  }
  return { blocks: blocks.map(storedBlock), blockActions: blockActions.map(storedAction) }
}

/** Read one browser-received block action outcome from the RPC response envelope. */
function actionOutcome(body: unknown): ActionOutcome | undefined {
  const result = record(record(body)?.['result'])
  if (result?.['ok'] !== true) return undefined
  const value = record(result['value'])
  if (value === undefined || typeof value['status'] !== 'string' || typeof value['replayed'] !== 'boolean') return undefined
  return { status: value['status'], replayed: value['replayed'] }
}

/** Model script: call `interactive_block` once, then close the turn with text. */
function replayScript(): ReplayEntry[] {
  const args = JSON.stringify({ type: 'choice', props: { options: [...CHOICE_OPTIONS] } })
  return [
    { kind: 'chunks', chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: ToolCallId('choice-block'), name: 'interactive_block', argumentsDelta: args },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('choice-block'), name: 'interactive_block', arguments: args } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ] },
    { kind: 'chunks', chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Pick one.' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'Pick one.' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ] },
  ]
}

describe.skipIf(webSnapshotMode() === 'record')('web e2e: inline block action bus', () => {
  let directory: string | undefined
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  /** Block action outcomes the browser received, in arrival order. */
  const outcomes: ActionOutcome[] = []
  /** Block action requests the browser dispatched, for the double click. */
  const dispatches: string[] = []

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dsh-dev-console-block-'))
    const replayOverride = join(directory, 'replay.override.json')
    await writeFile(replayOverride, JSON.stringify(replayScript()))
    scaffold = await launchWebScaffold({
      extraOverlayPath: DEV_CONSOLE_PATCH,
      extraInstallAnchors: [DEV_CONSOLE_PACKAGE],
      replayFixture: join(directory, 'override-only.jsonl'),
      replayOverride,
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes(BLOCK_ACTION_ENDPOINT)) dispatches.push(request.url())
    })
    page.on('response', (response) => {
      if (!response.url().includes(BLOCK_ACTION_ENDPOINT)) return
      void response.json().then((body: unknown) => {
        const outcome = actionOutcome(body)
        if (outcome !== undefined) outcomes.push(outcome)
      }).catch(() => {
        // A transport failure surfaces through the browser's own error state.
      })
    })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (directory !== undefined) await rm(directory, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    if (failures.length > 0) throw new AggregateError(failures, 'inline block action cleanup failed')
  })

  it('runs one action for a double click and renders the Host status after reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-inline-block-action'))
    const settled = scaffold!.whenTurnSettled(120_000)
    const input = page.locator('[data-composer-input]').first()
    await input.fill('Ask me to choose A or B.')
    await input.press('Enter')
    await settled

    // The block renders inline in the conversation, so it is visible without opening the turn process.
    const choice = page.getByRole('button', { name: CHOICE_OPTIONS[0], exact: true })
    await choice.waitFor({ timeout: 30_000 })
    expect(await choice.isVisible()).toBe(true)
    const registered = storedBus(scaffold!)
    expect(registered.blockActions).toEqual([])
    const block = registered.blocks.find(candidate => candidate.type === 'choice')
    if (block === undefined) throw new Error('the interactive_block tool registered no choice block')
    expect(block.status).toBe('pending')

    // First click: the browser dispatches one action and the Host settles the block.
    await choice.click()
    await expect.poll(() => storedBus(scaffold!).blockActions.length, { timeout: 20_000 }).toBe(1)
    const acted = storedBus(scaffold!)
    expect(acted.blocks.find(candidate => candidate.id === block.id)?.status).toBe('resolved')
    expect(acted.blockActions[0]).toMatchObject({ blockId: block.id, actionId: CHOICE_OPTIONS[0], sessionId: block.sessionId })
    await expect.poll(() => outcomes.length, { timeout: 20_000 }).toBe(1)
    expect(outcomes[0]).toEqual({ status: 'resolved', replayed: false })
    expect(dispatches).toHaveLength(1)

    // Second click: the Host-owned resolved status has disabled the control, so the
    // repeat gesture cannot start another action.
    await choice.evaluate((element: HTMLElement) => element.click())
    expect(dispatches).toHaveLength(1)
    expect(storedBus(scaffold!).blockActions).toHaveLength(1)

    // The recorded gesture key replays through the real gateway instead of acting twice,
    // which is the same guarantee a retried or racing click relies on.
    const replayKey = acted.blockActions[0]?.idempotencyKey
    if (replayKey === undefined) throw new Error('the first action stored no idempotency key')
    const replayResponse = await scaffold!.hostFetch('/api/sessionTasks/devConsoleBlockAction', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'inline-block-replay',
        method: 'sessionTasks/devConsoleBlockAction',
        payload: {
          args: {
            request: {
              blockId: block.id, actionId: CHOICE_OPTIONS[0], sessionId: block.sessionId, idempotencyKey: replayKey,
            },
          },
        },
      }),
    })
    expect(replayResponse.status).toBe(200)
    expect(actionOutcome(await replayResponse.json())).toEqual({ status: 'resolved', replayed: true })
    expect(storedBus(scaffold!).blockActions).toHaveLength(1)

    // A reload repaints the card from the Host status, not the status recorded at creation.
    await page.reload({ waitUntil: 'load' })
    const reloaded = page.getByRole('button', { name: CHOICE_OPTIONS[0], exact: true })
    await reloaded.waitFor({ timeout: 30_000 })
    await expect.poll(() => reloaded.isDisabled(), { timeout: 20_000 }).toBe(true)
    const afterReload = storedBus(scaffold!)
    expect(afterReload.blockActions).toHaveLength(1)
    expect(afterReload.blocks.find(candidate => candidate.id === block.id)?.status).toBe('resolved')
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 180_000)
})
