import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(8000)
const body = (await page.locator('body').innerText()).slice(0, 500).replace(/\n+/g, ' | ')
console.log('BOOT:', body)
const balance = await page.locator('[class*="balance"]').first().innerText().catch(() => 'none')
console.log('BALANCE:', balance)
console.log('PAGE-ERRORS:', errors.slice(0, 3))
await browser.close()
