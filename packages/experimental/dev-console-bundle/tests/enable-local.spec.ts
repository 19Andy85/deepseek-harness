/** Local enablement transforms for one dsh profile manifest. */

import { describe, expect, it } from 'vitest'
import {
  BUNDLE_NAME, COMPOSED_PACKAGES, disableManifest, enableManifest, linkDependencies,
  type ProfileManifest,
} from '../src/enable-local.ts'

const repoRoot = '/repo'
const base: ProfileManifest = {
  name: 'dsh-profile-web',
  private: true,
  dependencies: { '@deepseek-ai/dsh-subagent-codex': 'link:/repo/packages/subagent/subagent-codex' },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' } },
}

describe('profile enablement', () => {
  it('links the bundle and every composed package', () => {
    const linked = linkDependencies(repoRoot)
    expect(Object.keys(linked)).toEqual([BUNDLE_NAME, ...COMPOSED_PACKAGES])
    expect(linked[BUNDLE_NAME]).toBe('link:/repo/packages/experimental/dev-console-bundle')
    expect(linked['@deepseek-ai/dsh-experimental-api-session-tasks']).toBe('link:/repo/packages/experimental/api-session-tasks')
  })

  it('enables the bundle once while keeping existing dependencies and bundles', () => {
    const once = enableManifest(base, repoRoot)
    expect(once.dependencies).toMatchObject({ '@deepseek-ai/dsh-subagent-codex': base.dependencies?.['@deepseek-ai/dsh-subagent-codex'] })
    expect(once.dsh?.profile?.bundles).toEqual([...base.dsh?.profile?.bundles ?? [], BUNDLE_NAME])
    expect(once.dsh?.profile?.patchReload).toBe('live')
    expect(enableManifest(once, repoRoot)).toEqual(once)
  })

  it('removes the links and the bundle entry without touching other profile layers', () => {
    const removed = disableManifest(enableManifest(base, repoRoot))
    expect(removed.dependencies).toEqual(base.dependencies)
    expect(removed.dsh?.profile?.bundles).toEqual(base.dsh?.profile?.bundles)
    expect(removed.dsh?.profile?.patchReload).toBe('live')
  })
})
