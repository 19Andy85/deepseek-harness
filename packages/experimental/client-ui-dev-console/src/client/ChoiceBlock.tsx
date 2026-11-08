/** Minimal choice block used to prove the registry supports more than proposals. */
import type { ReactNode } from 'react'
import { registerInteractiveBlock, type InteractiveBlockSpec } from './block-registry.tsx'

function options(block: InteractiveBlockSpec): string[] {
  const value = block.props?.['options']
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 8) : []
}

/** Register the choice block. */
export function registerChoiceBlock(): void {
  registerInteractiveBlock('choice', (block) => {
    const rows = options(block)
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{rows.map(row => <button key={row} type="button">{row}</button>)}</div>
  }, block => options(block).length > 0)
}

/** Keep JSX transform referenced for clients that compile without automatic runtime. */
export type ChoiceNode = ReactNode
