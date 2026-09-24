// The parent's app on a phone, in demo mode: tabs, Updates, Messages, Account (saved people, notifications, absence),
// Change time, and a saved person in Someone else. Usage: node scripts/qa/parent.cjs [shotsDir]   (npm run dev on 5178)
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = 'http://localhost:5178'
const [,, shots = ''] = process.argv
const results = []
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`)

async function signIn(p, chip, area) {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: chip, exact: true }).click()
  await p.getByRole('button', { name: 'Send me a code' }).click()
  await p.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 8000 })
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.waitForTimeout(1500)
  if (await p.getByText('Where would you like to start?').count()) { await p.getByRole('button', { name: new RegExp('^' + (area || chip)) }).first().click(); await p.waitForTimeout(900) }
  const agree = p.getByRole('button', { name: 'I agree, continue' })
  if (await agree.count()) { await agree.click(); await p.waitForTimeout(900) }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const errors = []
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('jumpstart-')) localStorage.removeItem(k) })
  const toast = async () => (await p.locator('.toast').allTextContents()).join(' | ')
  const dlg = () => p.locator('dialog[open]').last()
  const tabbar = () => p.getByRole('navigation', { name: 'Parent pages' })

  await signIn(p, 'Parent')
  await p.getByRole('heading', { name: 'Kabir' }).waitFor({ timeout: 10000 })
  ok('tabs: bar at the thumb, Updates shows 1 new', await tabbar().isVisible() && await tabbar().getByLabel('1 new').isVisible())
  if (shots) await p.screenshot({ path: `${shots}/parent-today.png`, fullPage: true })

  // Change today's drop-off for Kabir, with how busy each slot is
  await p.getByRole('button', { name: 'Change time' }).first().click()
  await dlg().waitFor()
  ok('change time: slots say how busy they are', (await dlg().getByRole('radio').count()) > 3 && /Quiet|other|Busy|Early|Late/.test(await dlg().innerText()))
  if (shots) await p.screenshot({ path: `${shots}/parent-time.png` })
  await dlg().getByRole('radio').first().click()
  if (await dlg().getByRole('radiogroup', { name: 'Reason' }).count()) await dlg().getByRole('radio', { name: "Doctor's visit" }).click()
  await dlg().getByRole('button', { name: "Save today's time" }).click()
  await p.waitForTimeout(1200)
  ok('change time: saved, the tile says today', /moved to/.test(await toast()) && await p.getByText(/Drop-off, today/).isVisible())

  // Updates: the announcement, read
  await tabbar().getByRole('link', { name: /Updates/ }).click()
  await p.waitForTimeout(900)
  ok('updates: announcement and today\'s events', await p.getByText('Early closing on Friday').isVisible())
  await p.getByRole('button', { name: /Early closing on Friday/ }).click()
  await dlg().waitFor()
  ok('updates: announcement opens in full', await dlg().getByText('The school closes at 5:00 PM this Friday', { exact: false }).isVisible())
  await dlg().getByRole('button', { name: 'Close', exact: true }).last().click()
  await p.waitForTimeout(900)
  ok('updates: badge cleared once read', (await tabbar().getByLabel(/new$/).count()) === 0)
  if (shots) await p.screenshot({ path: `${shots}/parent-updates.png`, fullPage: true })

  // Messages
  await tabbar().getByRole('link', { name: 'Messages' }).click()
  await p.waitForTimeout(800)
  await p.getByRole('button', { name: /Kabir and the school/ }).click()
  await p.waitForTimeout(800)
  ok('messages: the conversation with the school', await p.getByText("Thanks, Neha. We'll keep an eye on him", { exact: false }).isVisible())
  await p.getByLabel('Message').fill('He is feeling better now, thank you.')
  await p.getByRole('button', { name: 'Send' }).click()
  await p.waitForTimeout(1000)
  ok('messages: sent', await p.getByText('He is feeling better now, thank you.').isVisible())
  if (shots) await p.screenshot({ path: `${shots}/parent-thread.png` })

  // Account: notifications, saved person, absence
  await tabbar().getByRole('link', { name: 'Account' }).click()
  await p.waitForTimeout(1000)
  await p.getByRole('switch', { name: 'Morning reminder' }).click()
  await p.waitForTimeout(800)
  ok('account: morning reminder off', /Turned off/.test(await toast()) && (await p.getByRole('switch', { name: 'Morning reminder' }).getAttribute('aria-checked')) === 'false')
  await p.getByRole('button', { name: 'Add a person' }).click()
  await dlg().getByLabel('Full name').fill('Ramesh Kulkarni')
  await dlg().getByLabel('Mobile').fill('98123 45678')
  await dlg().getByRole('button', { name: 'Save' }).click()
  await p.waitForTimeout(1000)
  ok('account: saved person listed', await p.getByText('Driver, +91 98123 45678').isVisible())
  if (shots) await p.screenshot({ path: `${shots}/parent-account.png`, fullPage: true })
  await p.getByRole('button', { name: 'Report an absence' }).click()
  await dlg().getByRole('radio', { name: 'Today' }).click()
  await dlg().getByRole('radio', { name: 'Unwell' }).click()
  await dlg().getByRole('button', { name: 'Tell the school' }).click()
  await p.waitForTimeout(1000)
  ok('absence: reported', /marked absent today/.test(await toast()))
  await tabbar().getByRole('link', { name: 'Today' }).click()
  await p.waitForTimeout(1000)
  ok('today: absent, with Undo', await p.getByText('Absent today: unwell').isVisible())
  await p.getByRole('button', { name: 'Undo' }).click()
  await p.waitForTimeout(1200)
  ok('today: undone', /expected today again/.test(await toast()) && !(await p.getByText('Absent today: unwell').count()))

  // The owner, as a parent: a saved person in Someone else
  const q = await ctx.newPage()
  q.on('pageerror', (e) => errors.push(e.message))
  await signIn(q, 'Admin', 'Parent')
  await q.getByRole('navigation', { name: 'Parent pages' }).getByRole('link', { name: 'Account' }).click()
  await q.waitForTimeout(900)
  await q.getByRole('button', { name: 'Add a person' }).click()
  await q.locator('dialog[open]').getByLabel('Full name').fill('Suresh Driver')
  await q.locator('dialog[open]').getByLabel('Mobile').fill('98111 22233')
  await q.locator('dialog[open]').getByRole('button', { name: 'Save' }).click()
  await q.waitForTimeout(900)
  await q.getByRole('navigation', { name: 'Parent pages' }).getByRole('link', { name: 'Today' }).click()
  await q.waitForTimeout(900)
  await q.getByRole('button', { name: 'Someone else' }).first().click()
  const d = q.locator('dialog[open]')
  await d.getByRole('radio', { name: /Suresh Driver/ }).click()
  await d.getByRole('button', { name: 'Create the link' }).click()
  await d.getByText('Link ready for Suresh').waitFor({ timeout: 8000 })
  ok('someone else: a saved person in one tap', true)

  console.log(results.join('\n'))
  console.log('errors', JSON.stringify(errors))
  await browser.close()
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => { console.log(results.join('\n')); console.log('CRASH', e.message.split('\n').slice(0, 3).join(' ')); process.exit(1) })
