// Invitations (D36): blocked until the app's web address is set, then emailed (always), with WhatsApp and text links
// when there's a mobile number; recorded next to the person and in the audit log. Demo mode (sample data only).
// Usage: node scripts/qa/invite.cjs [shotsDir]   (npm run dev:demo first: sample data on port 5178)
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = 'http://localhost:5178'
const [,, shots = ''] = process.argv
const results = []
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`)

async function signIn(p, chip) {
  await p.getByRole('button', { name: chip, exact: true }).click()
  await p.getByRole('button', { name: 'Send me a code' }).click()
  await p.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 8000 })
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.waitForTimeout(1500)
  if (await p.getByRole('heading', { name: /^Welcome, / }).count()) { await p.getByRole('button', { name: new RegExp('^' + chip) }).first().click(); await p.waitForTimeout(900) }
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
  const shot = async (name) => shots && p.screenshot({ path: `${shots}/invite-${name}.png` })
  const family = async () => { await p.goto(BASE + '/admin'); await p.getByRole('tab', { name: /^Parents and family/ }).click(); await p.waitForTimeout(300) }

  try {
    await p.goto(BASE + '/', { waitUntil: 'networkidle' })
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('jumpstart-')) localStorage.removeItem(k) })
    await signIn(p, 'Admin')
    await family()
    const invite = p.getByRole('button', { name: /^Invite (?!again)/ }).first()
    await invite.waitFor({ timeout: 8000 }).catch(() => {})
    ok('people not yet invited say so and offer Invite', await p.getByText('Not invited yet').first().isVisible() && await invite.isVisible())
    const who = (await invite.getAttribute('aria-label')).replace(/^Invite /, '')

    // No web address yet: the sheet says what to do and links to Settings.
    await invite.click()
    await dlg().getByText("Add the app's web address in Settings first.").waitFor({ timeout: 5000 })
    ok('invite: blocked until the web address is set, with a way there', await dlg().getByRole('link', { name: 'Open Settings' }).isVisible())
    await dlg().getByRole('link', { name: 'Open Settings' }).click()
    await p.waitForURL(/\/admin\/settings$/)

    // Settings: http is refused; a bare domain becomes https.
    const url = p.getByLabel('App web address')
    await url.fill('http://app.jumpstartpreschool.in')
    await p.getByRole('button', { name: 'Save the web address' }).click()
    ok('settings: an http address is refused', await p.getByText('Enter the https address people open the app at').isVisible())
    await url.fill('app.jumpstartpreschool.in/')
    await p.getByRole('button', { name: 'Save the web address' }).click()
    await p.getByText('Saved.').first().waitFor({ timeout: 8000 }).catch(() => {})
    ok('settings: a bare address is saved as https', (await url.inputValue()) === 'https://app.jumpstartpreschool.in', `value "${await url.inputValue()}", toasts ${JSON.stringify(await p.locator('.toast').allTextContents())}`)
    ok('settings: drop-off and pickup point to Classes', await p.getByText('Set for each programme in People → Classes.').isVisible())

    // Invite: the message, the email, and the phone options.
    await family()
    await p.getByRole('button', { name: `Invite ${who}`, exact: true }).click()
    await dlg().getByText('The invitation says').waitFor({ timeout: 5000 })
    const text = await dlg().locator('p.text-ink').first().textContent()
    ok('invite: the message has the link and how to sign in', text.includes('1. Open https://app.jumpstartpreschool.in') && text.includes('2. Enter ') && text.includes('6-digit code'), text.slice(0, 90))
    const wa = dlg().getByRole('link', { name: /^Send on WhatsApp/ })
    const phoneOk = (await wa.count()) ? (await wa.getAttribute('href')).startsWith('https://wa.me/') && (await dlg().getByRole('link', { name: /^Send by text message/ }).getAttribute('href')).startsWith('sms:+') : await dlg().getByText('so the invitation goes by email').isVisible()
    ok('invite: phone options when there is a number, email only when there is not', phoneOk)
    await shot('sheet')
    await dlg().getByRole('button', { name: /^Email the invitation to/ }).click()
    await dlg().getByText(/recorded as emailed to|Emailed to/).waitFor({ timeout: 5000 })
    ok('invite: the email is sent and confirmed', true)
    await shot('sent')
    await p.keyboard.press('Escape'); await p.waitForTimeout(450)
    ok('invite: the person now shows as invited, with Invite again', await p.getByRole('button', { name: `Invite again ${who}`, exact: true }).isVisible() && await p.getByText(/^Invited \d+ \w+ by email$/).first().isVisible())

    // The audit log says it in words.
    await p.goto(BASE + '/admin/audit')
    const entry = p.getByText(`Invited ${who} by email`).first()
    await entry.waitFor({ timeout: 8000 }).catch(() => {})
    ok('audit log: records the invitation', await entry.isVisible())
  } catch (e) {
    results.push('CRASH ' + e.message.split('\n')[0])
    await shot('crash')
  }
  await browser.close()
  console.log(results.join('\n'))
  console.log('errors', JSON.stringify(errors))
  process.exitCode = results.some((r) => !r.startsWith('PASS')) || errors.length ? 1 : 0
})()
