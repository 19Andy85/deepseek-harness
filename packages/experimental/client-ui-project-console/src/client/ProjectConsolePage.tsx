/** Workspace console page: the read-only live session task overview of one project. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectConsoleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Project console page copy. */
    projectConsole: ProjectConsoleKey
  }
}

/** Framework props of the workspace console page. */
export type ProjectConsolePageProps = PropsRuntime<'main'> & PropsLocale<'projectConsole'>

/**
 * Render the console page. Live data wiring follows in the next increment.
 * @param props - framework props and the page dictionary binding.
 * @returns the page body.
 */
export function ProjectConsolePage({ t }: ProjectConsolePageProps) {
  return (
    <section style={{ display: 'grid', gap: '8px', padding: '24px' }}>
      <h1 style={{ margin: 0 }}>{t('title')}</h1>
      <p style={{ margin: 0 }}>{t('description')}</p>
      <p style={{ margin: 0 }}>{t('empty')}</p>
    </section>
  )
}
