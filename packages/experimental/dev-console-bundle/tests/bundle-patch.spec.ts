/** Composition rows of the experimental project console bundle. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

interface PatchRow { readonly id: string; readonly name: string }
interface PatchOperation { readonly insert?: readonly PatchRow[] }

const root = join(import.meta.dirname, '..')
const patch = load(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')) as readonly PatchOperation[]
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  readonly dependencies: Readonly<Record<string, string>>
}

describe('project console bundle patch', () => {
  it('inserts the Remote, page, and tool rows in one operation', () => {
    const rows = patch.flatMap(operation => operation.insert ?? [])
    expect(rows.map(row => row.name)).toEqual([
      '@deepseek-ai/dsh-experimental-api-session-tasks',
      '@deepseek-ai/dsh-experimental-client-ui-dev-console',
      '@deepseek-ai/dsh-experimental-tool-session-tasks',
    ])
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
  })

  it('declares every inserted package as a dependency so an install resolves the rows', () => {
    const rows = patch.flatMap(operation => operation.insert ?? [])
    for (const row of rows) expect(manifest.dependencies).toHaveProperty(row.name)
  })
})
