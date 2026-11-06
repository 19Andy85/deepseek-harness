/** Structured and raw-YAML editor for the Dev Console registry. */
import { useEffect, useState } from 'react'
import { dump, load } from 'js-yaml'
import type { ProjectConsoleKey } from './locales.ts'
import css from './ConfigEditor.module.css'

interface EditableWorkspace {
  id: string
  name: string
  worktree: string
  branch: string
  base: string
  hooks?: { expectedBranch?: string; expectedToplevel?: string; [key: string]: unknown }
  agent?: unknown
  [key: string]: unknown
}

interface EditableProject {
  id: string
  name: string
  root: string
  workspaces: EditableWorkspace[]
  [key: string]: unknown
}

interface EditableConfig {
  version: number
  projects: EditableProject[]
  [key: string]: unknown
}

/** Props of the config editor. */
export interface ConfigEditorProps {
  /** Read the current file. */
  readonly load: () => Promise<{ readonly path: string; readonly yaml: string }>
  /** Save validated YAML. */
  readonly save: (yaml: string) => Promise<{ readonly path: string; readonly warnings: readonly { readonly message: string }[] }>
  /** Dictionary lookup. */
  readonly t: (key: ProjectConsoleKey) => string
  /** Close the editor. */
  readonly onClose: () => void
  /** Reload the workspace snapshot after a save. */
  readonly onSaved: () => void
}

function parse(text: string): EditableConfig | undefined {
  try {
    const value = load(text)
    if (value === null || typeof value !== 'object') return undefined
    const config = value as EditableConfig
    return Array.isArray(config.projects) ? config : undefined
  } catch { return undefined }
}

function lineDiff(original: string, next: string): string {
  const before = original.split('\n')
  const after = next.split('\n')
  const out: string[] = []
  const max = Math.max(before.length, after.length)
  for (let index = 0; index < max; index += 1) {
    if (before[index] === after[index]) continue
    if (before[index] !== undefined) out.push(`- ${before[index]}`)
    if (after[index] !== undefined) out.push(`+ ${after[index]}`)
  }
  return out.join('\n')
}

/**
 * Render the structured editor with a raw-YAML escape hatch.
 * @param props - load/save actions, dictionary, close, and reload.
 * @returns the editor overlay.
 */
export function ConfigEditor({ load, save, t, onClose, onSaved }: ConfigEditorProps) {
  const [path, setPath] = useState('')
  const [original, setOriginal] = useState('')
  const [draft, setDraft] = useState('')
  const [config, setConfig] = useState<EditableConfig | undefined>(undefined)
  const [mode, setMode] = useState<'form' | 'yaml'>('form')
  const [error, setError] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const read = async (): Promise<void> => {
    setBusy(true)
    try {
      const value = await load()
      setPath(value.path)
      setOriginal(value.yaml)
      setDraft(value.yaml)
      setConfig(parse(value.yaml))
      setMode('form')
      setError(undefined)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) }
  }
  useEffect(() => { void read() }, [])
  const update = (next: EditableConfig): void => {
    setConfig(next)
    setDraft(dump(next))
    setSaved(false)
  }
  const editProject = (index: number, field: 'name' | 'root', value: string): void => {
    if (config === undefined) return
    const next = JSON.parse(JSON.stringify(config)) as EditableConfig
    const project = next.projects[index]
    if (project === undefined) return
    project[field] = value
    update(next)
  }
  const editWorkspace = (projectIndex: number, workspaceIndex: number, field: keyof EditableWorkspace, value: string): void => {
    if (config === undefined) return
    const next = JSON.parse(JSON.stringify(config)) as EditableConfig
    const project = next.projects[projectIndex]
    if (project === undefined) return
    const workspace = project.workspaces[workspaceIndex]
    if (workspace === undefined) return
    workspace[field] = value
    if (field === 'branch') workspace.hooks = { ...workspace.hooks, expectedBranch: value }
    if (field === 'worktree') workspace.hooks = { ...workspace.hooks, expectedToplevel: value }
    update(next)
  }
  return (
    <div className={css.scrim} role="dialog" aria-label={t('editConfig')}>
      <section className={css.panel}>
        <header className={css.head}>
          <div>
            <h2 className={css.title}>{t('editConfig')}</h2>
            <p className={css.hint}>{path}</p>
          </div>
          <div className={css.actions}>
            <button type="button" className={css.button} onClick={() => { setMode('form') }}>{t('formMode')}</button>
            <button type="button" className={css.button} onClick={() => { setMode('yaml') }}>{t('yamlMode')}</button>
            <button type="button" className={css.button} onClick={() => { void read() }}>{t('refresh')}</button>
            <button type="button" className={css.button} onClick={onClose}>{t('close')}</button>
          </div>
        </header>
        {mode === 'yaml' || config === undefined
          ? (
            <textarea
              className={css.editor}
              spellCheck={false}
              value={draft}
              onChange={(event) => {
                const value = event.currentTarget.value
                setDraft(value)
                setConfig(parse(value))
                setSaved(false)
              }}
            />
          )
          : (
            <div className={css.form}>
              {config.projects.map((project, projectIndex) => (
                <section key={projectIndex} className={css.project}>
                  <div className={css.formRow}>
                    <label>{t('projectName')}<input value={project.name} onChange={(event) => { editProject(projectIndex, 'name', event.currentTarget.value) }} /></label>
                    <label>{t('projectRoot')}<input value={project.root} onChange={(event) => { editProject(projectIndex, 'root', event.currentTarget.value) }} /></label>
                    <button type="button" className={css.button} onClick={() => {
                      const next = JSON.parse(JSON.stringify(config)) as EditableConfig
                      next.projects.splice(projectIndex, 1)
                      update(next)
                    }}>{t('remove')}</button>
                  </div>
                  {project.workspaces.map((workspace, workspaceIndex) => (
                    <div key={workspaceIndex} className={css.workspace}>
                      <div className={css.formRow}>
                        <label>{t('idLabel')}<input value={workspace.id} onChange={(event) => { editWorkspace(projectIndex, workspaceIndex, 'id', event.currentTarget.value) }} /></label>
                        <label>{t('projectName')}<input value={workspace.name} onChange={(event) => { editWorkspace(projectIndex, workspaceIndex, 'name', event.currentTarget.value) }} /></label>
                        <button type="button" className={css.button} onClick={() => {
                          const next = JSON.parse(JSON.stringify(config)) as EditableConfig
                          const target = next.projects[projectIndex]
                          if (target === undefined) return
                          target.workspaces.splice(workspaceIndex, 1)
                          update(next)
                        }}>{t('remove')}</button>
                      </div>
                      <div className={css.formRow}>
                        <label>{t('worktree')}<input value={workspace.worktree} onChange={(event) => { editWorkspace(projectIndex, workspaceIndex, 'worktree', event.currentTarget.value) }} /></label>
                        <label>{t('branch')}<input value={workspace.branch} onChange={(event) => { editWorkspace(projectIndex, workspaceIndex, 'branch', event.currentTarget.value) }} /></label>
                        <label>{t('baseLabel')}<input value={workspace.base} onChange={(event) => { editWorkspace(projectIndex, workspaceIndex, 'base', event.currentTarget.value) }} /></label>
                      </div>
                    </div>
                  ))}
                  <button type="button" className={css.button} onClick={() => {
                    const next = JSON.parse(JSON.stringify(config)) as EditableConfig
                    const target = next.projects[projectIndex]
                    if (target === undefined) return
                    target.workspaces.push({
                      id: `workspace-${String(project.workspaces.length + 1)}`,
                      name: 'Workspace',
                      worktree: '',
                      branch: 'main',
                      base: 'main',
                      agent: { adapter: 'dsh-session' },
                      hooks: { expectedBranch: 'main', expectedToplevel: '' },
                    })
                    update(next)
                  }}>{t('addWorkspace')}</button>
                </section>
              ))}
              <button type="button" className={css.button} onClick={() => {
                const next = JSON.parse(JSON.stringify(config)) as EditableConfig
                next.projects.push({ id: `project-${String(config.projects.length + 1)}`, name: 'Project', root: '', workspaces: [] })
                update(next)
              }}>{t('addProject')}</button>
            </div>
          )}
        {original === draft ? null : (
          <div className={css.diffBox}>
            <p className={css.hint}>{t('configDiff')}</p>
            <pre className={css.diff}>{lineDiff(original, draft)}</pre>
          </div>
        )}
        {error === undefined ? null : <p className={css.error}>{error}</p>}
        {saved ? <p className={css.ok}>{t('configSaved')}</p> : null}
        <div className={css.actions}>
          <button
            type="button"
            className={css.button}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void save(draft).then(() => {
                setSaved(true)
                setOriginal(draft)
                setError(undefined)
                onSaved()
              }).catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : String(reason))
              }).finally(() => { setBusy(false) })
            }}
          >{busy ? t('saving') : t('saveConfig')}</button>
          <span className={css.hint}>{t('backupHint')}</span>
        </div>
      </section>
    </div>
  )
}
