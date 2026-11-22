// The page must never be wider than the phone, with animations running (the QA sweep turns motion off, so an animated
// element poking past an edge would slip through). Android zooms the whole app out when anything overflows.
// Usage: node scripts/qa/width.cjs   (npm run dev first, on port 5173)
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = process.env.BASE ?? 'http://localhost:5173'
;(async () => {
  const b = await chromium.launch({ channel: 'chrome' })
  let bad = 0
  for (const w of [360, 393, 412]) {
    const p = await b.newPage({ viewport: { width: w, height: 850 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 })
    await p.goto(BASE + '/', { waitUntil: 'networkidle' })
    let widest = 0
    for (let i = 0; i < 12; i++) { widest = Math.max(widest, await p.evaluate(() => document.documentElement.scrollWidth)); await p.waitForTimeout(1000) }
    const ok = widest <= w
    if (!ok) bad++
    console.log(`${ok ? 'PASS' : 'FAIL'} sign-in at ${w}px: page ${widest}px wide`)
    await p.close()
  }
  await b.close()
  process.exit(bad ? 1 : 0)
})()
