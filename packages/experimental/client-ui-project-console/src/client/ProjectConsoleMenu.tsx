/** Session row menu entry that opens the project console for the row's workspace. */
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { ProjectConsolePanelIcon } from './ProjectConsolePanelIcon.tsx'

/** Behavior the menu row injects. */
export interface ProjectConsoleMenuInjected {
  /**
   * Open the console for the Workspace that accounts this Session.
   * @param sessionId - the menu row's Session.
   */
  readonly openConsole: (sessionId: SessionId) => void
}

/** Framework props and the console dictionary of the menu row. */
export type ProjectConsoleMenuItemProps = PropsRuntime<'sidebar.workspaces.session.menu.item'>
  & PropsLocale<'projectConsole'>
  & InjectFace<ProjectConsoleMenuInjected>

/**
 * Render the menu row.
 * @param props - owner share, the console dictionary, menu state, and the injected behavior.
 * @returns the menu row.
 */
export function ProjectConsoleMenuItem(props: ProjectConsoleMenuItemProps) {
  const { sessionId, useMenuOpenState, openConsole, t } = props
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      icon={<ProjectConsolePanelIcon />}
      onSelect={() => {
        setMenuOpen(false)
        openConsole(sessionId)
      }}
    >
      {t('openConsole')}
    </MenuItemButton>
  )
}
