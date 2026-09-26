// Someone else collects: parent makes a link → the collector's phone confirms and shares location → the gate types the code.
// Three tabs share the demo data like three devices. The browser's geolocation is set to a point near the school.
// Usage: node scripts/qa/collector.cjs [shotsDir]   (npm run dev:demo first: sample data on port 5178)
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = 'http://localhost:5178'
const [,, shots = ''] = process.argv
const results = []
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`)
const snap = async (p, name, full = false) => shots && p.screenshot({ path: `${shots}/${name}.png`, fullPage: full })

async function signIn(p, chip, area) {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: chip, exact: true }).click()
  await p.getByRole('button', { name: 'Send me a code' }).click()
  await p.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 8000 })
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.waitForTimeout(1500)
  if (await p.getByRole('heading', { name: /^Welcome, / }).count()) { await p.getByRole('button', { name: new RegExp('^' + (area || chip)) }).first().click(); await p.waitForTimeout(900) }
  const agree = p.getByRole('button', { name: 'I agree, continue' })
  if (await agree.count()) { await agree.click(); await p.waitForTimeout(900) }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', permissions: ['geolocation'], geolocation: { latitude: 18.5150, longitude: 73.8262, accuracy: 12 } })
  const errors = []
  const watch = (p, who) => { p.on('pageerror', (e) => errors.push(`${who} ${e.message}`)); p.on('console', (m) => m.type() === 'error' && !/tiles\.openfreemap|Failed to load resource/.test(m.text()) && errors.push(`${who} console ${m.text()}`)) }

  // 1. The parent (the owner's account, parent of Anaya) sends a link to a driver.
  const parent = await ctx.newPage(); watch(parent, 'parent')
  // Fresh sample data and demo clock for this run (once: every tab shares them).
  await parent.goto(BASE + '/', { waitUntil: 'networkidle' })
  await parent.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('jumpstart-')) localStorage.removeItem(k) })
  await signIn(parent, 'Admin', 'Parent')
  const card = parent.locator('li', { has: parent.getByRole('heading', { name: 'Anaya' }) })
  await card.getByRole('button', { name: 'Someone else', exact: true }).click()
  const sheet = parent.locator('dialog[open]')
  await sheet.waitFor()
  ok('else sheet: arrival times around the window, one chosen', (await sheet.getByRole('radio', { checked: true }).count()) >= 1 && (await sheet.getByText('In window').count()) >= 1)
  await sheet.getByRole('button', { name: 'Create the link' }).click()
  ok('else sheet: empty form is explained, field by field', await sheet.getByText('Enter their full name.').isVisible() && await sheet.getByText(/10-digit mobile/).isVisible())
  await sheet.getByLabel('Full name').fill('Ramesh Kulkarni')
  await sheet.getByLabel('Mobile').fill('98123 45678')
  await snap(parent, 'p-else')
  await sheet.getByRole('button', { name: 'Create the link' }).click()
  await sheet.getByText('Link ready for Ramesh').waitFor({ timeout: 8000 })
  const code = (await sheet.getByRole('img', { name: /Handoff code/ }).getAttribute('aria-label')).replace(/\D/g, '')
  const wa = await sheet.getByRole('link', { name: 'Send on WhatsApp' }).getAttribute('href')
  const token = decodeURIComponent(wa).match(/\/t\/([\w-]+)/)?.[1]
  ok('link ready: 4-digit code and a WhatsApp message to +91 98123 45678 with the link', code.length === 4 && wa.startsWith('https://wa.me/919812345678?text=') && !!token, `code ${code}`)
  const sms = await sheet.getByRole('link', { name: /^Send by text message/ }).getAttribute('href')
  ok('link ready: the same message by text, to the same number', sms.startsWith('sms:+919812345678?&body=') && decodeURIComponent(sms.split('body=')[1]) === decodeURIComponent(wa.split('text=')[1]))
  await snap(parent, 'p-link-ready')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await parent.waitForTimeout(900)
  ok('parent card: Ramesh arrives, with his code', await card.getByText(/Ramesh arrives about/).isVisible() && await card.getByText(code, { exact: true }).isVisible())
  ok('parent card: no location yet, said plainly', await card.getByText("Ramesh hasn't shared their location", { exact: false }).isVisible() && await card.getByText('Only you can see this. The school can\'t.').isVisible())

  // 2. Ramesh's phone opens the link.
  const phone = await ctx.newPage(); watch(phone, 'collector')
  await phone.goto(`${BASE}/t/${token}`, { waitUntil: 'networkidle' })
  await phone.getByRole('button', { name: "Yes, that's me" }).waitFor({ timeout: 8000 })
  ok('link: greets Ramesh by name, for Anaya', await phone.getByRole('heading', { name: "Hi Ramesh, you're collecting Anaya today" }).isVisible())
  ok('link: no code before confirming', !(await phone.getByText(code, { exact: true }).count()))
  await snap(phone, 'l-confirm')
  await phone.getByLabel(/last 4 digits of your mobile/).fill('1111')
  await phone.getByRole('button', { name: "Yes, that's me" }).click()
  await phone.getByText('2 tries left', { exact: false }).waitFor({ timeout: 8000 })
  ok('link: wrong digits show no code, and count a try', !(await phone.getByText(code, { exact: true }).count()))
  await phone.getByLabel(/last 4 digits of your mobile/).fill('5678')
  await phone.getByRole('button', { name: "Yes, that's me" }).click()
  await phone.getByRole('button', { name: 'Allow location' }).click()
  ok('link: code shown after confirming', (await phone.getByRole('img', { name: /Handoff code/ }).getAttribute('aria-label')).replace(/\D/g, '') === code)
  await snap(phone, 'l-ready')
  await phone.getByRole('button', { name: 'Start trip' }).click()
  // Ramesh drives toward the school (Chrome's emulated position only reports when it changes).
  let step = 0
  const drive = setInterval(() => { step += 1; void ctx.setGeolocation({ latitude: 18.5150 - step * 0.0002, longitude: 73.8262 + step * 0.0002, accuracy: 12 }) }, 3000)
  await phone.waitForTimeout(7000)
  ok('link: sharing, with distance to the gate', await phone.getByText('Sharing', { exact: true }).isVisible() && await phone.getByText(/from the gate/).isVisible())
  await snap(phone, 'l-trip')

  // 3. The parent sees him live.
  // No tab switching: on two real phones both screens are in front (a hidden tab's timers are throttled).
  await parent.waitForTimeout(11000)
  ok('parent: Ramesh is LIVE with a distance', await card.getByText('Live', { exact: true }).isVisible() && await card.getByText(/\d m away|km away|At the school/).isVisible(),
    (await card.locator('[aria-label^="Live"], [aria-label^="Recent"], [aria-label^="Stale"]').first().getAttribute('aria-label').catch(() => 'none')))
  await snap(parent, 'p-live', true)

  clearInterval(drive)
  // 4. The gate: code needed, a wrong code counted, the right one hands over.
  const coord = await ctx.newPage(); watch(coord, 'coord')
  await coord.setViewportSize({ width: 1180, height: 820 })
  await signIn(coord, 'Coordinator')
  await coord.getByRole('button', { name: /Start duty|Resume duty/ }).click()
  await coord.getByRole('button', { name: 'Yes, I heard it' }).waitFor()
  await coord.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 20000 })
  await coord.getByRole('button', { name: 'Yes, I heard it' }).click()
  await coord.waitForTimeout(1500)
  const row = coord.locator('li', { hasText: 'Anaya Singh' }).first()
  // D38: the school never sees location, even while the collector shares it with the parent.
  ok('gate: Anaya shows Code needed and no location at all', await row.getByText('Code needed').isVisible() && (await row.getByText(/Live|Recent|from school|away/).count()) === 0)
  if (await row.getByRole('button', { name: 'Acknowledge' }).count()) { await row.getByRole('button', { name: 'Acknowledge' }).click(); await coord.waitForTimeout(1000) }
  await row.getByRole('button', { name: 'Ready' }).click()
  await coord.waitForTimeout(1200)
  await row.getByRole('button', { name: 'Enter code' }).click()
  const pad = coord.locator('dialog[open]')
  await pad.waitFor()
  const wrong = String((Number(code) + 1) % 10000).padStart(4, '0')
  for (const d of wrong) await pad.getByRole('button', { name: d, exact: true }).click()
  await coord.waitForTimeout(900)
  ok('gate: wrong code refused, 2 tries left', await pad.getByText("That code doesn't match", { exact: false }).isVisible() && await pad.getByText('2 tries left', { exact: false }).isVisible())
  await snap(coord, 'c-code-wrong')
  for (const d of code) await coord.keyboard.press(d)
  await coord.waitForTimeout(1500)
  ok('gate: right code (typed on a keyboard) hands over', await coord.getByText(/Code correct\. Anaya handed over to Ramesh/).isVisible())
  await snap(coord, 'c-code-done')

  // 5. The collector's phone moves on by itself; Reached home closes the link.
  await phone.bringToFront()
  await phone.getByText('Anaya is with you', { exact: false }).waitFor({ timeout: 15000 })
  ok('link: handed over, way home', true)
  await snap(phone, 'l-done')
  await phone.getByRole('button', { name: 'Reached home' }).click()
  await phone.getByRole('heading', { name: 'Trip closed' }).waitFor({ timeout: 8000 })
  ok('link: closed after Reached home', true)
  await phone.reload({ waitUntil: 'networkidle' })
  ok('link: still says closed after a reload, with no code', await phone.getByRole('heading', { name: 'Trip closed' }).isVisible() && !(await phone.getByText(code, { exact: true }).count()))

  // 6. The parent's card.
  await parent.bringToFront()
  await parent.waitForTimeout(2500)
  ok('parent: pickup done, By Ramesh', await card.getByText('By Ramesh').isVisible())
  await snap(parent, 'p-done', true)

  console.log(results.join('\n'))
  console.log('errors', JSON.stringify(errors))
  await browser.close()
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => { console.log(results.join('\n')); console.log('CRASH', e.message.split('\n').slice(0, 4).join(' ')); process.exit(1) })
