/** Project console page: the sidebar entry and the workspace-scoped main panel it opens. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import sessionTasksRemote from '@deepseek-ai/dsh-experimental-api-session-tasks/remote'
import { ProjectConsoleMenuItem, type ProjectConsoleMenuInjected } from './ProjectConsoleMenu.tsx'
import { ProjectConsolePage, type ProjectConsoleInjected } from './ProjectConsolePage.tsx'
import { ProjectConsolePanelIcon } from './ProjectConsolePanelIcon.tsx'
import { ProjectConsoleStore } from './ProjectConsoleStore.ts'
import { de, en, es, fr, ja, pt, ru, zh } from './locales.ts'

/** Locale namespace of the page copy. */
export const NS = 'projectConsole'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'project-console' as MainPanelId

/** Client capabilities the page contributes through. */
export const inject = ['slots', 'locale', 'remote', 'workspaces', 'layout']

/**
 * Mount the overview Remote, then contribute the console entry, the page it
 * opens, and the refresh path that keeps the visible overview current.
 * @param ctx - the browser plugin context.
 * @returns disposer that unmounts the Remote contribution.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'project-console: dictionaries')
  const unmount = await ctx.remote.$mount(sessionTasksRemote)
  try {
    await ctx.inject(['remote.sessionTasks'], (inner) => { registerUi(inner) })
  } catch (error) {
    await unmount()
    throw error
  }
  return async () => { await unmount() }
}

function registerUi(ctx: Context): void {
  const t = ctx.locale.bind(NS)
  const store = new ProjectConsoleStore({
    listWorkspaces: () => ctx.workspaces.list.getSnapshot().items.map(workspace => ({
      id: workspace.workspaceId, title: workspace.title, path: workspace.path,
    })),
    subscribeWorkspaces: listener => ctx.workspaces.list.subscribe(listener),
    snapshot: async workspaceId => workspaceId === undefined
      ? ctx.remote.sessionTasks.snapshot({})
      : ctx.remote.sessionTasks.snapshot({ workspaceId }),
  })
  ctx.effect(() => () => { store.dispose() }, 'project-console: store')
  void store.refresh()
  ctx.effect(() => {
    const offStatus = ctx.remote.$on('api-session/status', () => { store.scheduleRefresh() })
    const offActivity = ctx.remote.$on('api-session/activity', () => { store.scheduleRefresh() })
    const offReset = ctx.on('connection/reset', () => { store.scheduleRefresh() })
    return () => { offStatus(); offActivity(); offReset() }
  }, 'project-console: live refresh')
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: (): ProjectConsoleInjected => ({
      store,
      workspaceOptions: () => store.workspaceOptions(),
      selectedWorkspaceId: () => store.selectedWorkspaceId(),
      selectWorkspace: (workspaceId) => { void store.selectWorkspace(workspaceId) },
      refresh: () => { void store.refresh() },
    }),
  }, ProjectConsolePage)), 'project-console: page')
  ctx.effect(() => ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item',
    id: 'project-console',
    order: 460,
    locale: NS,
    inject: (): ProjectConsoleMenuInjected => ({
      openConsole: (sessionId: SessionId) => {
        const workspace = ctx.workspaces.list.getSnapshot().items
          .find(item => item.sessionIds.includes(sessionId))
        ctx.layout.selectPanel(PANEL_ID)
        if (workspace !== undefined) void store.selectWorkspace(workspace.workspaceId)
      },
    }),
  }, ProjectConsoleMenuItem)), 'project-console: session menu')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 1,
    label: () => t('panel'),
    locale: NS,
  }, ProjectConsolePanelIcon)), 'project-console: entry')
}
