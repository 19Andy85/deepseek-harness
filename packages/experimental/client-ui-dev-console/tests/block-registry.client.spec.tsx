import { describe, expect, it } from 'vitest'
import { isInteractiveBlock, registerInteractiveBlock, renderInteractiveBlock, type InteractiveBlockSpec } from '../src/client/block-registry.tsx'
import { registerChoiceBlock } from '../src/client/ChoiceBlock.tsx'

describe('interactive block registry', () => {
  it('renders a registered type and falls back for unknown types', () => {
    registerInteractiveBlock('text', block => block.props?.['text'] as string)
    const known: InteractiveBlockSpec = { version: 1, type: 'text', props: { text: 'hello' } }
    expect(renderInteractiveBlock(known, { t: key => key })).toBe('hello')
    const unknown: InteractiveBlockSpec = { version: 1, type: 'unknown' }
    const fallback = renderInteractiveBlock(unknown, { t: key => key })
    expect(fallback).toBeTruthy()
  })

  it('validates and renders a choice block, rejecting malformed options', () => {
    registerChoiceBlock()
    const valid: InteractiveBlockSpec = { version: 1, type: 'choice', props: { options: ['A', 'B'] } }
    expect(renderInteractiveBlock(valid, { t: key => key })).toBeTruthy()
    const invalid: InteractiveBlockSpec = { version: 1, type: 'choice', props: { options: [] } }
    expect(renderInteractiveBlock(invalid, { t: key => key })).toBeTruthy()
  })

  it('rejects malformed specs', () => {
    expect(isInteractiveBlock({ version: 1, type: 'text' })).toBe(true)
    expect(isInteractiveBlock({ version: 2, type: 'text' })).toBe(false)
    expect(isInteractiveBlock({ type: 'text' })).toBe(false)
  })
})
