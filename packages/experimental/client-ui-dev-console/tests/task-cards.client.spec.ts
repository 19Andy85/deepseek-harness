/** Task card creation and drag payload parsing. */

import { describe, expect, it } from 'vitest'
import { createTaskCard, parseTaskCard } from '../src/client/task-cards.ts'

describe('task cards', () => {
  it('creates trimmed cards and rejects blanks', () => {
    const card = createTaskCard('  检查构建  ')
    expect(card?.text).toBe('检查构建')
    expect(createTaskCard('   ')).toBeUndefined()
  })

  it('round-trips a drag payload', () => {
    const card = { id: '1', text: '修复登录' }
    expect(parseTaskCard(JSON.stringify(card))).toEqual(card)
    expect(parseTaskCard('not-json')).toBeUndefined()
    expect(parseTaskCard(JSON.stringify({ id: '1', text: ' ' }))).toBeUndefined()
  })
})
