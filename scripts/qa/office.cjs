// The office's day in demo mode: the core team (attendance, today's time, schedules, messages, announcements) and the
// front desk (logged calls), then the gate hears a phoned-in trip. Usage: node scripts/qa/office.cjs (npm run dev on 5178)
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = 'http://localhost:5178'
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
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, reducedMotion: 'reduce' })
  const errors = []
  const watch = (p, who) => { p.on('pageerror', (e) => errors.push(`${who} ${e.message}`)); p.on('console', (m) => m.type() === 'error' && errors.push(`${who} console ${m.text()}`)) }
  const core = await ctx.newPage(); watch(core, 'core')
  await core.goto(BASE + '/', { waitUntil: 'networkidle' })
  await core.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('jumpstart-')) localStorage.removeItem(k) })
  const toast = async (p) => (await p.locator('.toast').allTextContents()).join(' | ')
  const dlg = (p) => p.locator('dialog[open]').last()

  // Core team: attendance
  await signIn(core, 'Core team')
  ok('core: board with counts', await core.getByRole('button', { name: /^\d+ At school/ }).isVisible() && await core.getByRole('button', { name: /^Kabir Shah/ }).isVisible())
  await core.getByRole('button', { name: /^Riya Joshi/ }).click()
  await dlg(core).getByRole('radio', { name: 'Absent' }).click()
  await dlg(core).getByLabel('Note (optional)').fill('Unwell')
  await dlg(core).getByRole('button', { name: 'Save attendance' }).click()
  await core.waitForTimeout(1200)
  ok('core: Riya marked absent', /Riya: absent/.test(await toast(core)) && (await core.getByRole('button', { name: /^Riya Joshi/ }).getByText('Absent').count()) === 1)
  // Today's time for Anaya, inside her pickup window
  await core.getByRole('button', { name: /^Anaya Singh/ }).click()
  await dlg(core).getByRole('button', { name: /Change today's pickup/ }).click()
  await dlg(core).getByRole('radio', { name: /1:10 PM/ }).click()
  await dlg(core).getByRole('button', { name: /^Save for/ }).click()
  await core.waitForTimeout(1200)
  ok("core: today's pickup moved", /pickup moved to 1:10 PM/.test(await toast(core)) && await core.getByRole('button', { name: /^Anaya Singh/ }).getByText('1:10').isVisible())

  // Schedules: programme hours, regular times
  await core.getByRole('link', { name: 'Schedules' }).click()
  await core.waitForTimeout(900)
  const sr = core.locator('li', { hasText: 'Half day' }).filter({ hasText: '1:00–1:15 PM' }).first()
  await sr.getByRole('button', { name: 'Edit' }).click()
  await dlg(core).getByLabel('Ends').selectOption({ label: '1:30 PM' })
  ok('schedules: windows follow the hours', await dlg(core).getByText('1:30–1:45 PM').isVisible())
  await dlg(core).getByRole('button', { name: 'Save the timings' }).click()
  await core.waitForTimeout(1200)
  ok('schedules: saved', /Saved\. Parents, the gate/.test(await toast(core)))
  await core.getByRole('tab', { name: "Children's times" }).click()
  await core.locator('li', { hasText: 'Kabir Shah' }).getByRole('button', { name: 'Edit' }).click()
  await dlg(core).getByLabel(/^Pickup/).selectOption({ label: '5:45 PM' })
  await dlg(core).getByRole('button', { name: 'Save regular times' }).click()
  await core.waitForTimeout(1200)
  ok('regular times: saved', /regular times are saved/.test(await toast(core)) && await core.locator('li', { hasText: 'Kabir Shah' }).getByText('5:45 PM').isVisible())

  // Messages and announcements
  await core.getByRole('link', { name: 'Messages' }).click()
  await core.waitForTimeout(900)
  ok('messages: no family left waiting (Kabir was answered)', (await core.getByLabel('Waiting for a reply').count()) === 0)
  await core.getByRole('button', { name: /^Kabir Shah/ }).click()
  await core.getByLabel('Message').fill('Kabir drank all his water today.')
  await core.getByRole('button', { name: 'Send' }).click()
  await core.waitForTimeout(1000)
  ok('messages: sent into the thread', await core.getByText('Kabir drank all his water today.').isVisible())
  await core.getByRole('link', { name: 'Announce' }).click()
  await core.waitForTimeout(900)
  await core.getByRole('radio', { name: 'Jr KG' }).click()
  await core.waitForTimeout(500)
  const sendBtn = core.getByRole('button', { name: /^Send to/ })
  ok('announce: counts the parents it reaches', /Send to 1 parent/.test(await sendBtn.innerText()))
  await core.getByLabel('Title').fill('Jr KG sports day')
  await core.getByLabel('Message').fill('Sports day is on Friday. Please send your child in white.')
  await sendBtn.click()
  await core.waitForTimeout(1200)
  ok('announce: sent and listed with reads', /Sent to 1 parent/.test(await toast(core)) && await core.getByText('0 of 1 read', { exact: false }).isVisible())

  // Front desk: a message call and an on-the-way call
  const desk = await ctx.newPage(); watch(desk, 'desk')
  await signIn(desk, 'Front desk')
  await desk.getByRole('button', { name: 'Log a call' }).first().click()
  await dlg(desk).getByRole('radio', { name: 'Kabir' }).click()
  await dlg(desk).getByRole('radio', { name: /Just a message/ }).click()
  await dlg(desk).getByLabel('What did they say?').fill('Bringing his raincoat tomorrow')
  await dlg(desk).getByRole('button', { name: 'Log the call' }).click()
  await desk.waitForTimeout(1200)
  ok('desk: message call listed', await desk.getByText('Neha about Kabir').isVisible() && await desk.getByText('Bringing his raincoat tomorrow', { exact: false }).isVisible())
  await desk.getByRole('button', { name: 'Log a call' }).first().click()
  await dlg(desk).getByRole('radio', { name: 'Anaya' }).click()
  await dlg(desk).getByRole('radio', { name: /On the way/ }).click()
  await dlg(desk).getByRole('radio', { name: /^30 min/ }).click()
  if (await dlg(desk).getByText('Tell the school why', { exact: false }).count() || await dlg(desk).getByRole('radiogroup', { name: 'Reason' }).count()) await dlg(desk).getByRole('radio', { name: 'Family event' }).click()
  await dlg(desk).getByRole('button', { name: 'Log the call' }).click()
  await desk.waitForTimeout(1200)
  ok('desk: on-the-way call logged', /Logged\. The gate has Anaya's pickup/.test(await toast(desk)) && await desk.getByText(/On the way for the pickup/).isVisible())

  // The gate hears it, marked phoned in
  const gate = await ctx.newPage(); watch(gate, 'gate')
  await signIn(gate, 'Coordinator')
  await gate.getByRole('button', { name: /Start duty|Resume duty/ }).click()
  await gate.getByRole('button', { name: 'Yes, I heard it' }).waitFor()
  await gate.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 20000 })
  await gate.getByRole('button', { name: 'Yes, I heard it' }).click()
  await gate.waitForTimeout(1500)
  ok('gate: phoned-in pickup in the queue', await gate.locator('li', { hasText: 'Anaya Singh' }).first().getByText('Phoned in').isVisible())

  console.log(results.join('\n'))
  console.log('errors', JSON.stringify(errors))
  await browser.close()
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
})().catch((e) => { console.log(results.join('\n')); console.log('CRASH', e.message.split('\n').slice(0, 3).join(' ')); process.exit(1) })
