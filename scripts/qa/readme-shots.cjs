// Screenshots for the README, from the real app in demo mode (sample data). node scripts/qa/readme-shots.cjs
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = 'http://localhost:5178', OUT = 'docs/images'
const clean = '[role=status].glass,.toast-region{display:none!important}'
async function signIn(p, chip, area) {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: chip, exact: true }).click()
  await p.getByRole('button', { name: 'Send me a code' }).click()
  await p.getByRole('button', { name: 'Sign in' }).waitFor(); await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.waitForTimeout(1500)
  if (await p.getByText('Where would you like to start?').count()) { await p.getByRole('button', { name: new RegExp('^' + (area || chip)) }).first().click(); await p.waitForTimeout(900) }
  const agree = p.getByRole('button', { name: 'I agree, continue' }); if (await agree.count()) { await agree.click(); await p.waitForTimeout(900) }
}
;(async () => {
  const b = await chromium.launch({ channel: 'chrome' })
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' }
  const ipad = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, reducedMotion: 'reduce' }
  const shot = async (p, name) => { await p.addStyleTag({ content: clean }); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${name}.png` }) }
  // Fresh sample data
  let ctx = await b.newContext(phone); let p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('jumpstart-')) localStorage.removeItem(k) })
  await shot(p, 'sign-in')
  await signIn(p, 'Parent'); await p.getByRole('heading', { name: 'Kabir' }).waitFor(); await shot(p, 'parent-today')
  await p.getByRole('button', { name: "I'm on my way" }).click(); await p.waitForTimeout(500); await shot(p, 'parent-on-my-way'); await p.keyboard.press('Escape')
  await ctx.close()
  ctx = await b.newContext(phone); p = await ctx.newPage()
  await signIn(p, 'Admin', 'Parent'); await p.getByRole('button', { name: 'Someone else' }).first().click()
  const d = p.locator('dialog[open]'); await d.getByLabel('Full name').fill('Ramesh Kulkarni'); await d.getByLabel('Mobile').fill('98123 45678')
  await d.getByRole('button', { name: 'Create the link' }).click(); await d.getByText('Link ready').waitFor(); await shot(p, 'parent-link-ready')
  const token = decodeURIComponent(await d.getByRole('link', { name: 'Send on WhatsApp' }).getAttribute('href')).match(/\/t\/([\w-]+)/)[1]
  const q = await ctx.newPage(); await q.goto(`${BASE}/t/${token}`, { waitUntil: 'networkidle' }); await q.getByRole('button', { name: "Yes, that's me" }).waitFor(); await shot(q, 'collector-link')
  await ctx.close()
  ctx = await b.newContext(ipad); p = await ctx.newPage()
  await signIn(p, 'Coordinator'); await p.getByRole('button', { name: /Start duty|Resume duty/ }).click()
  await p.getByRole('button', { name: 'Yes, I heard it' }).waitFor(); await p.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 20000 })
  await p.getByRole('button', { name: 'Yes, I heard it' }).click(); await p.waitForTimeout(1500); await shot(p, 'gate-ipad')
  await ctx.close()
  ctx = await b.newContext(ipad); p = await ctx.newPage()
  await signIn(p, 'Core team'); await p.getByRole('button', { name: /^\d+ At school/ }).waitFor(); await shot(p, 'core-today')
  await p.goto(BASE + '/core/schedules'); await p.waitForTimeout(1200); await p.getByRole('button', { name: 'Edit' }).first().click(); await p.waitForTimeout(500); await shot(p, 'core-schedules')
  await ctx.close()
  ctx = await b.newContext(ipad); p = await ctx.newPage()
  await signIn(p, 'Admin', 'Admin'); await p.getByRole('button', { name: /^Isha Patil/ }).click(); await p.waitForTimeout(900); await shot(p, 'admin-child')
  await ctx.close()
  ctx = await b.newContext(ipad); p = await ctx.newPage()
  await signIn(p, 'Front desk'); await p.getByRole('button', { name: 'Log a call' }).first().click(); await p.waitForTimeout(500); await shot(p, 'front-desk-call')
  await b.close()
  console.log('done')
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1) })
