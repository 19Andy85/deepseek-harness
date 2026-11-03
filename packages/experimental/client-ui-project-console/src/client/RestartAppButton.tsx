/** Sidebar footer restart button, rendered only when the desktop shell exposes the restart bridge. */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './RestartAppButton.module.css'

/** Restart command exposed by the desktop preload, when this build supports it. */
interface RestartBridge {
  /** Relaunch the application and its host. */
  readonly restart: () => Promise<void>
}

/** Locale props of the restart button. */
export type RestartAppButtonProps = PropsLocale<'projectConsole'>

/**
 * Render a two-step restart control so a single click cannot quit the app.
 * @param props - the console locale dictionary.
 * @returns the button, or null outside a desktop build with the bridge.
 */
export function RestartAppButton({ t }: RestartAppButtonProps) {
  const bridge = (globalThis as typeof globalThis & { dshApp?: RestartBridge }).dshApp
  const [confirming, setConfirming] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current) }, [])
  if (bridge === undefined) return null
  return (
    <button
      type="button"
      className={confirming ? `${css.restart} ${css.confirming}` : css.restart}
      title={t('restartAppHint')}
      onClick={() => {
        if (!confirming) {
          setConfirming(true)
          timer.current = setTimeout(() => { setConfirming(false) }, 3_000)
          return
        }
        if (timer.current !== undefined) clearTimeout(timer.current)
        void bridge.restart()
      }}
    >
      {confirming ? t('restartAppConfirm') : t('restartApp')}
    </button>
  )
}
