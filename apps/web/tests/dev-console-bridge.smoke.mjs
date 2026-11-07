/**
 * Repeatable real-model smoke for the dev-console proposal bridge.
 *
 * Usage:
 *   DSH_BRIDGE_URL='http://127.0.0.1:3350/?token=...' node apps/web/tests/dev-console-bridge.smoke.mjs
 *
 * The script starts a real Session, asks the model to call
 * console_plan_propose, then asserts that the task appears under 待我处理.
 * It writes a real task; there is intentionally no automatic cleanup.
 */
import { chromium } from 'playwright'

const url = process.env.DSH_BRIDGE_URL
if (url === undefined) throw new Error('DSH_BRIDGE_URL is required')
const title = process.env.DSH_BRIDGE_TITLE ?? `桥接验证 ${String(Date.now())}`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', error => { errors.push(String(error)) })
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  const input = page.locator('textarea, [contenteditable="true"]').first()
  await input.click()
  await input.fill(`Call console_plan_propose exactly once with title '${title}', goal 'bridge smoke', acceptance 'task appears', and one step titled 'smoke' with outcome 'ok'. Then answer DONE.`)
  await input.press('Enter')
  await page.getByText('DONE', { exact: true }).waitFor({ timeout: 120_000 })
  await page.getByText('研发控制台').first().click()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: '待我处理', exact: true }).click()
  await page.getByText(title, { exact: false }).first().waitFor({ timeout: 20_000 })
  if (errors.length > 0) throw new Error(errors.join('\n'))
  console.log(`PASS ${title}`)
} finally {
  await browser.close()
}
