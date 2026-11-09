/** Registry for constrained interactive blocks rendered from tool result metadata. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { BlockStatus } from './block-actions.ts'

/** Contract version supported by this client. */
export const INTERACTIVE_BLOCK_VERSION = 1

/** One block the model may reference by registered type. */
export interface InteractiveBlockSpec {
  readonly version: 1
  readonly type: string
  readonly props?: Readonly<Record<string, unknown>> | undefined
  /** Host-registered identity; absent on blocks recorded before the action bus. */
  readonly blockId?: string | undefined
  /** Action ids the Host registered for this block. */
  readonly actions?: readonly string[] | undefined
  /** Status recorded when the Host created the block; the live status is read from the Host. */
  readonly status?: BlockStatus | undefined
}

/** Renderer context shared by registered block types. */
export interface BlockRenderContext {
  readonly t: (key: string) => string
  /** Session that owns the block; its actions are valid only within it. */
  readonly sessionId?: string | undefined
}

/** One registered block renderer. */
export type BlockRenderer = (block: InteractiveBlockSpec, context: BlockRenderContext) => ReactNode

/** Optional props guard; a failed guard uses the same fallback as an unknown type. */
export type BlockValidator = (block: InteractiveBlockSpec) => boolean

interface BlockEntry { readonly renderer: BlockRenderer; readonly validate: BlockValidator | undefined }

const renderers = new Map<string, BlockEntry>()

/** @param type - block type. @param renderer - component. @param validate - optional props guard. */
export function registerInteractiveBlock(type: string, renderer: BlockRenderer, validate?: BlockValidator): void {
  renderers.set(type, { renderer, validate })
}

/** @param type - block type to remove from the registry. */
export function unregisterInteractiveBlock(type: string): void {
  renderers.delete(type)
}

/**
 * Render a block by type, degrading unknown types to a bounded text representation.
 * @param block - parsed model output.
 * @param context - locale, owning Session, and action bridge.
 * @returns the registered renderer output, or a literal fallback.
 */
export function renderInteractiveBlock(block: InteractiveBlockSpec, context: BlockRenderContext): ReactNode {
  const entry = block.version === INTERACTIVE_BLOCK_VERSION ? renderers.get(block.type) : undefined
  if (entry !== undefined && (entry.validate === undefined || entry.validate(block))) return entry.renderer(block, context)
  return <pre data-interactive-block-fallback={block.type}>{JSON.stringify(block, null, 2)}</pre>
}

/** Read a toolview owner without trusting untyped metadata. */
export function isInteractiveBlock(value: unknown): value is InteractiveBlockSpec {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return candidate['version'] === INTERACTIVE_BLOCK_VERSION && typeof candidate['type'] === 'string'
}

/** Keep the slot prop import type-only without exposing the registry through props. */
export type BlockToolProps = PropsRuntime<'tool.call.toolview'>
