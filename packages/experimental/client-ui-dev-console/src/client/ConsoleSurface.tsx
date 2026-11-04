/** Main-panel and right-rail wrappers around the shared console page. */
import { useEffect } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ProjectConsolePage, type ProjectConsoleInjected } from './ProjectConsolePage.tsx'

/** Injected page data plus the rail-only float command. */
export interface RailInjected extends ProjectConsoleInjected {
  /** Float the current rail tab. */
  readonly floatTab: (tabId: string) => void
  /** Dock the current rail tab's pane. */
  readonly dockTab: (paneId: string) => void
}

/** Main-panel surface props. */
export type ConsoleMainPageProps = PropsRuntime<'main'> & PropsLocale<'projectConsole'> & InjectFace<ProjectConsoleInjected>

/** Right-rail surface props. */
export type ConsoleRailPageProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'projectConsole'> & InjectFace<RailInjected>

/**
 * Render the console in the center panel.
 * @param props - framework props, locale, and injected data.
 * @returns the console page.
 */
export function ConsoleMainPage(props: ConsoleMainPageProps) {
  return <ProjectConsolePage {...props} useSessionStatus={props.useSessionStatus} />
}

/**
 * Render the console in the right rail, following the tab's session.
 * @param props - framework props, locale, and injected data.
 * @returns the console page in compact mode.
 */
export function ConsoleRailPage(props: ConsoleRailPageProps) {
  const { sessionId, useTabInfo, workspaceSessions, selectWorkspace } = props
  const info = useTabInfo()
  const tab = info.tab
  useEffect(() => {
    if (sessionId === undefined) return
    const target = String(sessionId)
    const workspaceId = workspaceSessions().find(item => item.sessionIds.includes(target))?.id
    if (workspaceId !== undefined) selectWorkspace(workspaceId)
  }, [sessionId, workspaceSessions, selectWorkspace])
  return (
    <ProjectConsolePage
      {...props}
      compact
      surface="rail"
      {...sessionId === undefined ? {} : { railSessionId: String(sessionId) }}
      onFloat={() => props.floatTab(tab.id)}
      onDock={() => props.dockTab(info.panel.id)}
      useSessionStatus={props.useSessionStatus}
    />
  )
}

/** Branded session id helper so the rail menu can target the row's session. */
export type RailSessionId = SessionId
