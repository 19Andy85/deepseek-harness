import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.getByText('项目控制台').first().click()
await page.waitForTimeout(2500)
let text = (await page.locator('body').innerText())
console.log('BEFORE-HAS-MARKER:', text.includes('HMR标记'))
// Wait while the bundle file is edited externally (by the harness script).
await page.waitForTimeout(12000)
text = await page.locator('body').innerText()
console.log('AFTER-WAIT-HAS-MARKER (live):', text.includes('HMR标记'))
if (!text.includes('HMR标记')) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  text = await page.locator('body').innerText()
  console.log('AFTER-RELOAD-HAS-MARKER:', text.includes('HMR标记'))
}
console.log('ERRORS:', errors.slice(0, 3))
await browser.close()
