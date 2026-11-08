/** Registry for constrained interactive blocks rendered from tool result metadata. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'

/** One block the model may reference by registered type. */
export interface InteractiveBlockSpec {
  readonly version: 1
  readonly type: string
  readonly props?: Readonly<Record<string, unknown>> | undefined
}

/** Renderer context shared by registered block types. */
export interface BlockRenderContext {
  readonly t: (key: string) => string
}

/** One registered block renderer. */
export type BlockRenderer = (block: InteractiveBlockSpec, context: BlockRenderContext) => ReactNode

const renderers = new Map<string, BlockRenderer>()

/** @param type - block type the model may use. @param renderer - component for that type. */
export function registerInteractiveBlock(type: string, renderer: BlockRenderer): void {
  renderers.set(type, renderer)
}

/** @param type - block type to remove from the registry. */
export function unregisterInteractiveBlock(type: string): void {
  renderers.delete(type)
}

/**
 * Render a block by type, degrading unknown types to a bounded text representation.
 * @param block - parsed model output.
 * @param context - locale and future action context.
 * @returns the registered renderer output, or a literal fallback.
 */
export function renderInteractiveBlock(block: InteractiveBlockSpec, context: BlockRenderContext): ReactNode {
  const renderer = renderers.get(block.type)
  if (renderer !== undefined) return renderer(block, context)
  return <pre data-interactive-block-fallback={block.type}>{JSON.stringify(block, null, 2)}</pre>
}

/** Read a toolview owner without trusting untyped metadata. */
export function isInteractiveBlock(value: unknown): value is InteractiveBlockSpec {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return candidate['version'] === 1 && typeof candidate['type'] === 'string'
}

/** Keep the slot prop import type-only without exposing the registry through props. */
export type BlockToolProps = PropsRuntime<'tool.call.toolview'>
