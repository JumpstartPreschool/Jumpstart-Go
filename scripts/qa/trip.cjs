// Parent says "I'm on my way"; the coordinator's queue sees it (two tabs share the demo data, like two devices).
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
  const parent = await ctx.newPage()
  parent.on('pageerror', (e) => errors.push('parent ' + e.message))
  parent.on('console', (m) => m.type() === 'error' && errors.push('parent console ' + m.text()))
  await signIn(parent, 'Parent')
  ok('parent: greeting and Kabir card', await parent.getByRole('heading', { name: /Good (morning|afternoon|evening), Neha/ }).isVisible() && await parent.getByRole('heading', { name: 'Kabir' }).isVisible())
  if (shots) await parent.screenshot({ path: `${shots}/p-today.png`, fullPage: true })
  await parent.getByRole('button', { name: "I'm on my way" }).click()
  const sheet = parent.locator('dialog[open]')
  await sheet.waitFor()
  ok('otw sheet: minutes with clock times', (await sheet.getByRole('radio').count()) >= 6)
  if (shots) await parent.screenshot({ path: `${shots}/p-otw.png` })
  // 45 minutes is outside Kabir's window, so a reason is needed
  await sheet.getByRole('radio', { name: /^45/ }).click()
  ok('otw: outside window asks why and blocks sending', await sheet.getByText('Why?').isVisible() && await sheet.getByRole('button', { name: 'Tell the school' }).isDisabled())
  await sheet.getByRole('radio', { name: "Doctor's visit" }).click()
  ok('otw: a reason enables sending', await sheet.getByRole('button', { name: 'Tell the school' }).isEnabled())
  if (shots) await parent.screenshot({ path: `${shots}/p-otw-late.png` })
  await sheet.getByRole('radio', { name: /^5/ }).click()
  await sheet.getByRole('button', { name: 'Tell the school' }).click()
  await parent.waitForTimeout(1200)
  ok('parent: trip on the way with steps', await parent.getByText('On the way').first().isVisible() && await parent.getByText('Sent to the school').isVisible())
  if (shots) await parent.screenshot({ path: `${shots}/p-trip.png`, fullPage: true })

  // Coordinator on another "device" (tab)
  const coord = await ctx.newPage()
  coord.on('pageerror', (e) => errors.push('coord ' + e.message))
  coord.on('console', (m) => m.type() === 'error' && errors.push('coord console ' + m.text()))
  await signIn(coord, 'Coordinator')
  await coord.getByRole('button', { name: /Start duty|Resume duty/ }).click()
  await coord.getByRole('button', { name: 'Yes, I heard it' }).waitFor()
  await coord.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 20000 })
  await coord.getByRole('button', { name: 'Yes, I heard it' }).click()
  await coord.waitForTimeout(1500)
  ok('coord: queue shows Kabir coming and Isha', await coord.getByText('Kabir Shah').first().isVisible() && await coord.getByText('Isha Patil').first().isVisible())
  const strip = await coord.locator('header [aria-live="polite"]').innerText()
  ok('coord: announcement plays for a trip in their classes', /Kabir Shah is coming for drop-off|Please get/.test(strip), strip.replace(/\s+/g, ' ').slice(0, 120))
  if (shots) { await coord.setViewportSize({ width: 1180, height: 820 }); await coord.waitForTimeout(300); await coord.screenshot({ path: `${shots}/c-queue.png` }) }
  // Check in Kabir
  await coord.locator('li', { hasText: 'Kabir Shah' }).getByRole('button', { name: 'Check in' }).click()
  await coord.waitForTimeout(1200)
  ok('coord: Kabir checked in, in Done today', await coord.getByText('Done today', { exact: false }).isVisible() && await coord.locator('li', { hasText: 'Kabir Shah' }).getByText('Checked in').first().isVisible())
  // Parent's screen updates by itself (other tab: storage event)
  await parent.waitForTimeout(1500)
  ok('parent: sees Kabir checked in without reloading', await parent.getByText('Checked in').first().isVisible() && await parent.getByText('At school').isVisible())
  // Isha: ready, then hand over to her father
  const isha = coord.locator('li', { hasText: 'Isha Patil' })
  await isha.getByRole('button', { name: 'Ready' }).click()
  await coord.waitForTimeout(1200)
  await isha.getByRole('button', { name: 'Hand over' }).click()
  const hs = coord.locator('dialog[open]')
  await hs.waitFor()
  ok('handover: lists only registered guardians', (await hs.getByRole('button', { name: /Rohan Patil/ }).count()) === 1)
  if (shots) await coord.screenshot({ path: `${shots}/c-handover.png` })
  await hs.getByRole('button', { name: /Rohan Patil/ }).click()
  await coord.waitForTimeout(1500)
  ok('coord: Isha handed over', await coord.locator('li', { hasText: 'Isha Patil' }).getByText('Handed over').first().isVisible())
  if (shots) await coord.screenshot({ path: `${shots}/c-done.png` })
  console.log(results.join('\n'))
  console.log('errors', JSON.stringify(errors))
  await browser.close()
})().catch((e) => { console.log(results.join('\n')); console.log('CRASH', e.message.split('\n').slice(0, 4).join(' ')); process.exit(1) })
