import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.getByText('项目控制台').first().click()
await page.waitForTimeout(2500)
await page.getByRole('button', { name: '工作室' }).click()
await page.waitForTimeout(2000)
const info = await page.evaluate(() => {
  const desks = [...document.querySelectorAll('button[aria-label]')]
    .filter(el => (el.getAttribute('aria-label') ?? '').includes('运行中') || (el.getAttribute('aria-label') ?? '').includes('空闲'))
  return desks.slice(0, 3).map(desk => ({
    label: desk.getAttribute('aria-label'),
    nodes: [...desk.querySelectorAll('span')].map(span => ({
      cls: span.className,
      animation: getComputedStyle(span).animationName,
      display: getComputedStyle(span).display,
    })).slice(0, 8),
  }))
})
console.log(JSON.stringify(info, null, 1).slice(0, 2500))
await browser.close()
