// The admin adds a class and a programme with drop-off and pickup set by hand, edits the timings, and the core team
// sees them in Schedules; a child can then join the new programme. Demo mode (sample data only, never the live database).
// Usage: node scripts/qa/classes.cjs [shotsDir]   (npm run dev:demo first: sample data on port 5178)
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = 'http://localhost:5178'
const [,, shots = ''] = process.argv
const results = []
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`)

async function signIn(p, chip, area) {
  await p.getByRole('button', { name: chip, exact: true }).click()
  await p.getByRole('button', { name: 'Send me a code' }).click()
  await p.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 8000 })
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.waitForTimeout(1500)
  const pick = p.getByRole('button', { name: new RegExp('^' + (area || chip)) })
  if (await p.getByRole('heading', { name: /^Welcome, / }).count()) { await pick.first().click(); await p.waitForTimeout(900) }
  const agree = p.getByRole('button', { name: 'I agree, continue' })
  if (await agree.count()) { await agree.click(); await p.waitForTimeout(900) }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const dlg = () => p.locator('dialog[open]').last()
  const toast = async () => (await p.locator('.toast').allTextContents()).join(' | ')
  const shot = async (name) => shots && p.screenshot({ path: `${shots}/classes-${name}.png` })
  const pick = (label, text) => dlg().getByLabel(label, { exact: true }).selectOption({ label: text })

  try {
    await p.goto(BASE + '/', { waitUntil: 'networkidle' })
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('jumpstart-')) localStorage.removeItem(k) })
    await signIn(p, 'Admin')
    await p.goto(BASE + '/admin')
    await p.getByRole('tab', { name: /^Classes/ }).click()
    const before = await p.getByRole('tab', { name: /^Classes/ }).textContent()
    ok('classes tab has an Add class action', await p.getByRole('button', { name: 'Add class' }).isVisible())

    // Add a class: empty and "·" are refused, a duplicate is refused by the backend.
    await p.getByRole('button', { name: 'Add class' }).click()
    ok('add class: disabled until named', await dlg().getByRole('button', { name: 'Add the class' }).isDisabled())
    await dlg().getByLabel('Class name').fill('Nursery')
    await dlg().getByRole('button', { name: 'Add the class' }).click()
    await p.waitForTimeout(400)
    ok('add class: a duplicate name is refused', await dlg().getByText('There is already a class called Nursery.').isVisible())
    await dlg().getByLabel('Class name').fill('Toddlers')
    await shot('add')
    await dlg().getByRole('button', { name: 'Add the class' }).click()
    await dlg().getByText('No programmes yet').waitFor({ timeout: 5000 })
    ok('add class: opens the new class, empty', await dlg().getByRole('heading', { name: 'Toddlers' }).isVisible())
    ok('add class: the count goes up', (await p.getByRole('tab', { name: /^Classes/ }).textContent()) !== before, `${before} → ${await p.getByRole('tab', { name: /^Classes/ }).textContent()}`)

    // Add a programme: the rule fills the windows, which follow the hours until set by hand.
    await dlg().getByRole('button', { name: 'Add a programme' }).click()
    await dlg().getByRole('heading', { name: 'New programme in Toddlers' }).waitFor()
    await dlg().getByLabel('Programme name').fill('Mornings')
    await pick('Starts', '10:00 AM')
    await pick('Ends', '12:00 PM')
    ok('new programme: windows follow the hours by the rule', (await dlg().getByLabel('Drop-off from', { exact: true }).inputValue()) === String(9 * 60 + 45) && (await dlg().getByLabel('Pickup from', { exact: true }).inputValue()) === String(12 * 60))
    await pick('Drop-off from', '9:40 AM')
    ok('new programme: a window set by hand offers the rule back', await dlg().getByRole('button', { name: 'Use the 15-minute rule' }).isVisible())
    await pick('Drop-off until', '9:30 AM')
    ok('new programme: drop-off ending before it starts is caught', await dlg().getByText('Drop-off must end after it starts.').isVisible() && await dlg().getByRole('button', { name: 'Add the programme' }).isDisabled())
    await pick('Drop-off until', '10:10 AM')
    await pick('Pickup until', '12:20 PM')
    await shot('programme')
    await dlg().getByRole('button', { name: 'Add the programme' }).click()
    await p.waitForTimeout(900)
    ok('new programme: saved and listed with its windows', await dlg().getByText('9:40–10:10 AM').isVisible() && await dlg().getByText('12:00–12:20 PM').isVisible(), await toast())

    // Edit it: move the class, keep the windows set by hand.
    await dlg().getByRole('button', { name: 'Edit Toddlers · Mornings' }).click()
    ok('edit: opens with the saved windows', (await dlg().getByLabel('Drop-off from', { exact: true }).inputValue()) === String(9 * 60 + 40))
    await pick('Ends', '12:30 PM')
    ok('edit: windows set by hand stay put when the hours change', (await dlg().getByLabel('Pickup from', { exact: true }).inputValue()) === String(12 * 60))
    await dlg().getByRole('button', { name: 'Use the 15-minute rule' }).click()
    ok('edit: the rule puts the windows back', (await dlg().getByLabel('Drop-off from', { exact: true }).inputValue()) === String(9 * 60 + 45) && (await dlg().getByLabel('Pickup from', { exact: true }).inputValue()) === String(12 * 60 + 30))
    await dlg().getByRole('button', { name: 'Save the timings' }).click()
    await p.waitForTimeout(900)
    ok('edit: saved', await dlg().getByText('9:45–10:00 AM').isVisible() && await dlg().getByText('12:30–12:45 PM').isVisible(), await toast())
    await shot('class')

    // The admin can change the Learning Center.
    await p.keyboard.press('Escape'); await p.waitForTimeout(450)
    await p.getByRole('button', { name: /^Learning Center/ }).click()
    await dlg().getByRole('button', { name: /^Edit Learning Center/ }).click()
    await pick('Drop-off until', '9:15 AM')
    await dlg().getByRole('button', { name: 'Save the timings' }).click()
    await p.waitForTimeout(900)
    ok('admin changes the Learning Center', await dlg().getByText('8:45–9:15 AM').isVisible(), await toast())
    await p.keyboard.press('Escape'); await p.waitForTimeout(450)

    // A child can join the new programme from the picker.
    await p.getByRole('tab', { name: /^Children/ }).click()
    await p.getByRole('button', { name: 'Add child' }).first().click()
    await dlg().getByRole('button', { name: /^Add child/ }).click().catch(() => {})
    await dlg().getByRole('button', { name: /Choose the class and programme/ }).click()
    ok('picker lists the new class', await dlg().getByRole('button', { name: /^Toddlers/ }).isVisible())
    await dlg().getByRole('button', { name: /^Toddlers/ }).click()
    ok('picker shows its windows', await dlg().getByText(/Drop-off 9:45 AM to 10:00 AM, pickup 12:30 PM to 12:45 PM/).isVisible())
    await shot('picker')
  } catch (e) {
    results.push('CRASH ' + e.message.split('\n')[0])
    await shot('crash')
  }
  await ctx.close()

  // The core team sees the admin's timings and changes them, but can't add programmes.
  const core = await browser.newContext({ viewport: { width: 820, height: 1180 }, reducedMotion: 'reduce' })
  const c = await core.newPage()
  c.on('pageerror', (e) => errors.push(e.message))
  try {
    await c.goto(BASE + '/', { waitUntil: 'networkidle' })
    await signIn(c, 'Core team')
    await c.goto(BASE + '/core/schedules')
    await c.getByRole('button', { name: 'Edit' }).first().click()
    const d = c.locator('dialog[open]').last()
    ok('core team: no name or days to change', (await d.getByLabel('Programme name').count()) === 0 && (await d.getByLabel('Drop-off from', { exact: true }).count()) === 1)
    await d.getByLabel('Drop-off from', { exact: true }).selectOption({ label: '8:50 AM' })
    await d.getByRole('button', { name: 'Save the timings' }).click()
    await c.waitForTimeout(900)
    ok('core team: saves a window set by hand', (await c.locator('.toast').allTextContents()).join(' ').includes('Saved'))
  } catch (e) {
    results.push('CRASH core ' + e.message.split('\n')[0])
  }
  await browser.close()
  console.log(results.join('\n'))
  console.log('errors', JSON.stringify(errors))
  process.exitCode = results.some((r) => !r.startsWith('PASS')) || errors.length ? 1 : 0
})()
