/**
 * Host half of the AI trace cleanup bundle: writing guidance for the models a
 * profile runs. Streaming rewrite and project cleanup land in later stages.
 * @module @deepseek-ai/dsh-experimental-ai-detox
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the system-prompt Context merge (ctx.systemPrompt).
import type {} from '@deepseek-ai/dsh-system-prompt'
import z from '@deepseek-ai/schemastery'

/** Stable Loader identity. */
export const name = 'ai-detox'

/** Services this bundle needs; the plugin stays inert without them. */
export const inject = ['systemPrompt']

/** Deployment-facing configuration. */
export interface Config {
  /** Append the writing-style section to every assembled system prompt. */
  promptGuard: boolean
}

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  promptGuard: z.boolean().default(true),
})

/** Writing guidance appended to the system prompt. */
const PROMPT_GUIDANCE = `# Writing style

Write as a person who knows this subject, not as a document generator.

- Skip filler openers and closers such as "it's worth noting", "in conclusion", "综上所述", "值得注意的是", "希望本文对你有所帮助".
- Skip fixed scaffolding such as "首先/其次/最后", "first/second/finally", "in summary", "to sum up".
- Replace corporate filler with the concrete thing: "赋能", "抓手", "闭环", "底层逻辑", "高质量发展", "leverage", "seamless", "robust", "tapestry", "delve into".
- Do not use the "not X, but Y" or "not only … but also" template.
- Vary sentence length; prefer specific nouns and numbers over broad adjectives.
- Do not close with a paragraph that restates what was just said.`

/**
 * Register the writing guidance.
 * @param ctx - Host plugin context.
 * @param config - validated row config.
 */
export function apply(ctx: Context, config: Config): void {
  if (!config.promptGuard) return
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'ai-detox:writing-style',
    order: 900,
    text: PROMPT_GUIDANCE,
  }), 'ai-detox: writing style')
}
