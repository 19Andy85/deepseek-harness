import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
const run = async (width, height, name) => {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await page.getByText('项目控制台').first().click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: '工作室' }).click()
  await page.waitForTimeout(1500)
  const card = page.locator('[class*="teamCard"]').first()
  if (await card.count() > 0) await card.click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `/tmp/r3-${name}.png`, fullPage: false })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  console.log(name, 'OVERFLOW-X:', overflow, 'ERRORS:', errors.slice(0, 2))
  await page.close()
}
await run(1440, 900, 'desktop')
await run(390, 844, 'narrow')
await browser.close()
