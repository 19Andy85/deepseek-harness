/** Inline renderer for the generic interactive_block tool. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { isInteractiveBlock, renderInteractiveBlock } from './block-registry.tsx'

/** Generic block toolview. */
export function InteractiveBlockView(props: ToolCallViewProps & PropsLocale<'projectConsole'>) {
  if (props.phase !== 'result') return null
  const meta = props.block.meta
  const block = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>)['block'] : undefined
  return isInteractiveBlock(block) ? <>{renderInteractiveBlock(block, { t: props.t as unknown as (key: string) => string })}</> : null
}
