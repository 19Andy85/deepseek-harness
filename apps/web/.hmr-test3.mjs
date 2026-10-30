import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.getByText('项目控制台').first().click()
await page.waitForTimeout(2500)
for (let i = 0; i < 15; i += 1) {
  const body = await page.locator('body').innerText()
  console.log(`T=${i}: marker=${body.includes('HMR测试标记')}`)
  if (body.includes('HMR测试标记')) break
  await page.waitForTimeout(1000)
}
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
const after = await page.locator('body').innerText()
console.log('AFTER-RELOAD-MARKER:', after.includes('HMR测试标记'))
console.log('ERRORS:', errors.slice(0, 3))
await browser.close()
