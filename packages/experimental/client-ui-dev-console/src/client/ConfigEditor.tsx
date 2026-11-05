/** Raw YAML editor for the Dev Console registry, validated by the Host. */
import { useEffect, useState } from 'react'
import type { ProjectConsoleKey } from './locales.ts'
import css from './ConfigEditor.module.css'

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
  /** Reload the domain snapshot after a save. */
  readonly onSaved: () => void
}

/**
 * Render the registry YAML editor.
 * @param props - load/save actions, dictionary, close, and reload.
 * @returns the editor overlay.
 */
export function ConfigEditor({ load, save, t, onClose, onSaved }: ConfigEditorProps) {
  const [path, setPath] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const read = async (): Promise<void> => {
    setBusy(true)
    try {
      const value = await load()
      setPath(value.path)
      setDraft(value.yaml)
      setError(undefined)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) }
  }
  useEffect(() => { void read() }, [])
  return (
    <div className={css.scrim} role="dialog" aria-label={t('editConfig')}>
      <section className={css.panel}>
        <header className={css.head}>
          <div>
            <h2 className={css.title}>{t('editConfig')}</h2>
            <p className={css.hint}>{path}</p>
          </div>
          <div className={css.actions}>
            <button type="button" className={css.button} onClick={() => { void read() }}>{t('refresh')}</button>
            <button type="button" className={css.button} onClick={onClose}>{t('close')}</button>
          </div>
        </header>
        <textarea
          className={css.editor}
          spellCheck={false}
          value={draft}
          onChange={(event) => { setDraft(event.currentTarget.value); setSaved(false) }}
        />
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
                setError(undefined)
                onSaved()
              }).catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : String(reason))
              }).finally(() => { setBusy(false) })
            }}
          >{busy ? t('saving') : t('saveConfig')}</button>
        </div>
      </section>
    </div>
  )
}
