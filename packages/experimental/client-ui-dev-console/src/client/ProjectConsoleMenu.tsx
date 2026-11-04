/** Workspace row menu entry that opens the project console on that Workspace. */
import { MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { ProjectConsolePanelIcon } from './ProjectConsolePanelIcon.tsx'

/** Behavior the menu row injects. */
export interface ProjectConsoleMenuInjected {
  /**
   * Open the console on the row's Workspace.
   * @param workspaceId - the menu row's Workspace.
   */
  readonly openConsole: (workspaceId: WorkspaceId) => void
}

/** Framework props and the console dictionary of the menu row. */
export type ProjectConsoleMenuItemProps = PropsRuntime<'sidebar.workspaces.workspace.menu.item'>
  & PropsLocale<'projectConsole'>
  & InjectFace<ProjectConsoleMenuInjected>

/**
 * Render the menu row.
 * @param props - owner share, the console dictionary, menu state, and the injected behavior.
 * @returns the menu row.
 */
export function ProjectConsoleMenuItem(props: ProjectConsoleMenuItemProps) {
  const { workspaceId, useMenuOpenState, openConsole, t } = props
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      icon={<ProjectConsolePanelIcon />}
      onSelect={() => {
        setMenuOpen(false)
        openConsole(workspaceId)
      }}
    >
      {t('openConsole')}
    </MenuItemButton>
  )
}
