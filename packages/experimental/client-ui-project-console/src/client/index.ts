/** Project console page: the sidebar entry and the workspace-scoped main panel it opens. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ProjectConsolePage } from './ProjectConsolePage.tsx'
import { ProjectConsolePanelIcon } from './ProjectConsolePanelIcon.tsx'
import { de, en, es, fr, ja, pt, ru, zh } from './locales.ts'

/** Locale namespace of the page copy. */
export const NS = 'projectConsole'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'project-console' as MainPanelId

/** Client capabilities the page contributes through. */
export const inject = ['slots', 'locale']

/**
 * Contribute the console entry and the page it opens.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'project-console: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
  }, ProjectConsolePage)), 'project-console: page')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 1,
    label: () => t('panel'),
    locale: NS,
  }, ProjectConsolePanelIcon)), 'project-console: entry')
}
