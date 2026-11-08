/** Short in-product guide for the console's task lifecycle. */
import type { ProjectConsoleKey } from './locales.ts'
import css from './WorkflowGuide.module.css'

/** Props of the workflow guide. */
export interface WorkflowGuideProps {
  readonly t: (key: ProjectConsoleKey) => string
  readonly compact?: boolean | undefined
}

const STEPS: readonly { readonly title: ProjectConsoleKey; readonly hint: ProjectConsoleKey }[] = [
  { title: 'guideStepSession', hint: 'guideStepSessionHint' },
  { title: 'guideStepPropose', hint: 'guideStepProposeHint' },
  { title: 'guideStepReview', hint: 'guideStepReviewHint' },
  { title: 'guideStepExecute', hint: 'guideStepExecuteHint' },
  { title: 'guideStepHandoff', hint: 'guideStepHandoffHint' },
]

/**
 * Render the lifecycle guide.
 * @param props - dictionary and compact layout flag.
 * @returns a collapsible ordered guide.
 */
export function WorkflowGuide(props: WorkflowGuideProps) {
  const { t, compact = false } = props
  return (
    <details className={compact ? `${css.guide} ${css.compact}` : css.guide} open>
      <summary>{t('guideTitle')}</summary>
      <ol>
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className={css.number}>{String(index + 1)}</span>
            <div><strong>{t(step.title)}</strong><p>{t(step.hint)}</p></div>
          </li>
        ))}
      </ol>
    </details>
  )
}
