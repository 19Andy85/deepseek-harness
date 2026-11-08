/** Session row menu entry that opens the console in the right rail. */
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { ProjectConsolePanelIcon } from './ProjectConsolePanelIcon.tsx'

/** Behavior the rail menu row injects. */
export interface SessionRailMenuInjected {
  /** @param sessionId - the row's Session. */
  readonly openRail: (sessionId: string, displayTitle: string) => void
}

/** Props of the rail menu row. */
export type SessionRailMenuItemProps = PropsRuntime<'sidebar.workspaces.session.menu.item'>
  & PropsLocale<'projectConsole'>
  & InjectFace<SessionRailMenuInjected>

/**
 * Render the rail menu row.
 * @param props - owner share, dictionary, menu state, and injected behavior.
 * @returns the menu row.
 */
export function SessionRailMenuItem(props: SessionRailMenuItemProps) {
  const { sessionId, displayTitle, useMenuOpenState, openRail, t } = props
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      icon={<ProjectConsolePanelIcon />}
      onSelect={() => {
        setMenuOpen(false)
        openRail(sessionId, displayTitle)
      }}
    >
      {t('openInSidebar')}
    </MenuItemButton>
  )
}
