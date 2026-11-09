/** Minimal choice block used to prove the registry supports more than proposals. */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  registerInteractiveBlock, type BlockRenderContext, type InteractiveBlockSpec,
} from './block-registry.tsx'
import { selectedActionId, useBlockAction } from './block-actions.ts'

function options(block: InteractiveBlockSpec): string[] {
  const value = block.props?.['options']
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 8) : []
}

function ChoiceOptions(props: {
  readonly block: InteractiveBlockSpec
  readonly context: BlockRenderContext
  readonly rows: readonly string[]
}): ReactNode {
  const { block, context, rows } = props
  const handle = useBlockAction(block, context.sessionId)
  const selected = selectedActionId(handle.result)
  const actionable = block.blockId !== undefined && handle.status === 'pending'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {rows.map(row => (
        <Button
          key={row}
          variant={selected === row ? 'primary' : 'ghost'}
          disabled={!actionable || handle.busy}
          onClick={() => {
            void handle.act(row).catch(() => {
              // The failed flag renders the Host rejection in place of the options.
            })
          }}
        >
          {row}
        </Button>
      ))}
      {handle.failed ? <span role="alert">{context.t('blockActionFailed')}</span> : null}
    </div>
  )
}

/** Register the choice block. */
export function registerChoiceBlock(): void {
  registerInteractiveBlock('choice', (block, context) => {
    const rows = options(block)
    return <ChoiceOptions block={block} context={context} rows={rows} />
  }, block => options(block).length > 0)
}

/** Keep JSX transform referenced for clients that compile without automatic runtime. */
export type ChoiceNode = ReactNode
