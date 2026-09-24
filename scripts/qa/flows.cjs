// End-to-end flows in demo mode (sample data only, never the live database).
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = 'http://localhost:5178'
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
  if (await p.getByText('Where would you like to start?').count()) { await pick.first().click(); await p.waitForTimeout(900) }
  const agree = p.getByRole('button', { name: 'I agree, continue' })
  if (await agree.count()) { await agree.click(); await p.waitForTimeout(900) }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const toast = async () => (await p.locator('.toast').allTextContents()).join(' | ')
  const dialog = () => p.locator('dialog[open]').last()

  // Login: validation and wrong code
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Send me a code' }).click()
  ok('login: empty email shows an error', await p.getByText('Enter a full email address, like name@example.com.').isVisible())
  await p.getByRole('button', { name: 'Admin', exact: true }).click()
  await p.getByRole('button', { name: 'Send me a code' }).click()
  await p.getByRole('button', { name: 'Sign in' }).waitFor()
  ok('login: demo code filled in', (await p.locator('#code').inputValue()) === '246810' && await p.getByRole('button', { name: 'Sign in' }).isEnabled())
  await p.locator('#code').fill('111111')
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.waitForTimeout(900)
  ok('login: wrong code shows the error', await p.getByText("That code isn't right", { exact: false }).isVisible())
  await p.getByRole('button', { name: 'Use the demo code' }).click()
  await p.getByRole('button', { name: 'Sign in' }).click()
  await p.waitForTimeout(1500)
  ok('login: asks where to start, with access for each area', await p.getByText('Where would you like to start?', { exact: false }).isVisible() && await p.getByText('Everything, including people and roles').isVisible())
  await p.getByRole('button', { name: /^Admin/ }).click()
  await p.waitForTimeout(900)

  // Admin demo
  ok('admin: lands on People', await p.getByRole('heading', { name: 'People', level: 1 }).isVisible(), p.url())

  // Keyboard: arrows move between tabs
  await p.getByRole('tab', { name: /^Children/ }).focus()
  await p.keyboard.press('ArrowRight')
  ok('tabs: ArrowRight selects Parents', (await p.getByRole('tab', { name: /^Parents/ }).getAttribute('aria-selected')) === 'true')
  await p.keyboard.press('End')
  ok('tabs: End selects Classes', (await p.getByRole('tab', { name: /^Classes/ }).getAttribute('aria-selected')) === 'true')

  // Add a class group
  await p.getByLabel('New class group name').fill('Daisies')
  await p.getByRole('button', { name: 'Add class' }).click()
  await p.waitForTimeout(500)
  ok('classes: added with a toast', /Daisies added/.test(await toast()) && (await p.locator('main li', { hasText: 'Daisies' }).count()) === 1)

  // Search
  await p.getByRole('tab', { name: /^Parents/ }).click()
  await p.getByLabel('Search people').fill('zzzz')
  ok('search: empty result state', await p.getByText('Nobody matches').isVisible())
  await p.getByLabel('Search people').fill('')

  // Add parent: validation then success
  await p.getByRole('button', { name: 'Add parent' }).first().click()
  await dialog().getByRole('button', { name: 'Add parent' }).click()
  ok('add parent: name error', await dialog().getByText('Enter their full name.').isVisible())
  ok('add parent: email error', await dialog().getByText('Add an email so they can sign in.').isVisible())
  await dialog().getByLabel('Full name').fill('Priya Menon')
  await dialog().getByLabel('Email').fill('priya@example.com')
  await dialog().getByLabel('Mobile (optional)').fill('12345')
  await dialog().getByRole('button', { name: 'Add parent' }).click()
  ok('add parent: bad mobile error', await dialog().getByText('Enter a 10-digit Indian mobile number.').isVisible())
  await dialog().getByLabel('Mobile (optional)').fill('98765 43210')
  await dialog().getByRole('button', { name: 'Add parent' }).click()
  await p.waitForTimeout(1200)
  ok('add parent: saved, sheet closed, toast', (await p.locator('dialog[open]').count()) === 0 && /Priya Menon added/.test(await toast()))
  ok('add parent: in the list', await p.getByText('Priya Menon', { exact: true }).isVisible())

  // Add child with the programme picker and a guardian
  await p.getByRole('tab', { name: /^Children/ }).click()
  await p.getByRole('button', { name: 'Add child' }).first().click()
  await dialog().getByRole('button', { name: 'Add child' }).click()
  ok('add child: errors shown', await dialog().getByText("Enter the child's full name.").isVisible() && await dialog().getByText('Choose the programme and class group.').isVisible())
  await dialog().getByLabel('Full name').fill('Tara Menon')
  await dialog().getByLabel('Date of birth').fill('2022-03-10')
  await dialog().getByRole('button', { name: /Choose the programme/ }).click()
  await p.waitForTimeout(300)
  ok('picker: suggests a level', await dialog().getByText(/Suggested/).first().isVisible())
  await dialog().getByRole('button', { name: /^Nursery/ }).click()
  await dialog().locator('.choice').first().click()
  await dialog().getByRole('radio').first().click()
  await dialog().getByRole('button', { name: 'Use this programme and class' }).click()
  await p.waitForTimeout(400)
  ok('picker: choice shown in form', await dialog().getByText(/Class group:/).isVisible())
  await dialog().getByLabel('Link a parent already added').selectOption({ label: 'Priya Menon, priya@example.com' })
  await dialog().getByRole('button', { name: 'Add child' }).click()
  await p.waitForTimeout(1200)
  ok('add child: saved with toast', /Tara Menon added/.test(await toast()) && await p.getByText('Tara Menon', { exact: true }).isVisible())

  // Turn off / on access
  await p.getByRole('tab', { name: /^Parents/ }).click()
  const row = p.locator('li', { hasText: 'Priya Menon' })
  await row.getByRole('button', { name: 'Turn off' }).click()
  await dialog().getByRole('button', { name: 'Turn off access' }).click()
  await p.waitForTimeout(1200)
  ok('access: turned off', await row.getByText('Access off').isVisible() && /Access turned off/.test(await toast()))
  await row.getByRole('button', { name: 'Turn on' }).click()
  await dialog().getByRole('button', { name: 'Turn on access' }).click()
  await p.waitForTimeout(1000)
  ok('access: turned back on', !(await row.first().innerText()).includes('Access off') && /can sign in again/.test(await toast()))

  // Escape closes a sheet; backdrop click closes a sheet
  await p.getByRole('button', { name: 'Add parent' }).first().click()
  await p.keyboard.press('Escape')
  await p.waitForTimeout(450)
  ok('sheet: Escape closes', (await p.locator('dialog[open]').count()) === 0)

  // Coordinators
  await p.getByRole('link', { name: 'Coordinators' }).click()
  await p.waitForTimeout(600)
  ok('nav: Coordinators page', await p.getByRole('heading', { name: 'Coordinators', level: 1 }).isVisible() && (await p.getByRole('link', { name: 'Coordinators' }).getAttribute('aria-current')) === 'page')
  await p.getByRole('button', { name: 'Add coordinator' }).first().click()
  await dialog().getByLabel('Search people').fill('Priya')
  await dialog().getByRole('button', { name: /Priya Menon/ }).click()
  await dialog().getByRole('checkbox').first().click()
  await dialog().getByRole('button', { name: 'Make coordinator' }).click()
  await p.waitForTimeout(1200)
  ok('coordinator: added', /Priya is now a coordinator/.test(await toast()))
  const crow = p.locator('li', { hasText: 'Priya Menon' })
  await crow.getByRole('button', { name: 'Edit' }).click()
  const save = dialog().getByRole('button', { name: 'Save classes' })
  ok('coordinator: save disabled until a change', await save.isDisabled())
  await dialog().getByRole('checkbox').nth(1).click()
  await save.click()
  await p.waitForTimeout(1200)
  ok('coordinator: classes saved', /classes saved/.test(await toast()))
  await crow.getByRole('button', { name: 'Edit' }).click()
  await dialog().getByRole('button', { name: 'Remove Coordinator role' }).click()
  await dialog().getByRole('button', { name: 'Remove', exact: true }).click()
  await p.waitForTimeout(1200)
  ok('coordinator: removed', /no longer a coordinator/.test(await toast()))

  // Offline notice
  await ctx.setOffline(true)
  await p.waitForTimeout(300)
  ok('offline: notice shown', await p.getByText("You're offline.", { exact: false }).first().isVisible())
  await ctx.setOffline(false)
  await p.waitForTimeout(300)
  ok('offline: notice gone when back online', !(await p.getByText("You're offline.", { exact: false }).count()))

  // Skip link
  await p.goto(BASE + '/admin')
  await p.waitForTimeout(800)
  await p.keyboard.press('Tab')
  ok('a11y: first Tab reaches Skip to content', (await p.evaluate(() => document.activeElement?.textContent?.trim())) === 'Skip to content')

  // Account: switch area to Coordinator and run duty
  await p.getByRole('button', { name: /^Account/ }).click()
  await dialog().getByRole('button', { name: 'Coordinator' }).click()
  await p.waitForTimeout(900)
  ok('account: switched to Coordinator', p.url().endsWith('/coordinator') && await p.getByRole('heading', { name: /Ready for the gate|Welcome back/ }).isVisible())
  await p.getByRole('button', { name: /Start duty|Resume duty/ }).click()
  await p.waitForTimeout(3500)
  await p.getByRole('button', { name: 'Yes, I heard it' }).click()
  await p.waitForTimeout(500)
  ok('duty: on duty', await p.getByText('On duty').first().isVisible())
  await p.getByRole('button', { name: 'Mute 5 min' }).click()
  ok('duty: muted, and the voice stops at once', await p.getByText(/Muted until/).waitFor({ timeout: 2000 }).then(() => true, () => false))
  await p.getByRole('button', { name: 'Unmute' }).click()
  await p.getByRole('button', { name: 'End duty' }).click()
  await dialog().getByRole('button', { name: 'End duty' }).click()
  await p.waitForTimeout(600)
  ok('duty: ended', await p.getByRole('button', { name: /Start duty|Resume duty/ }).isVisible())

  // Parent area
  await p.getByRole('button', { name: /^Account/ }).click()
  await dialog().getByRole('button', { name: 'Parent' }).click()
  await p.waitForTimeout(900)
  ok('parent: consent asked before the Parent area', await p.getByRole('button', { name: 'I agree, continue' }).isVisible())
  await p.getByRole('button', { name: 'I agree, continue' }).click()
  await p.waitForTimeout(900)
  ok('parent: Today with a child card', await p.getByRole('heading', { name: /^Good (morning|afternoon|evening)/, level: 1 }).isVisible() && (await p.locator('main li.card').count()) > 0)

  // Sign out
  await p.getByRole('button', { name: 'Exit demo' }).click()
  await p.waitForTimeout(800)
  ok('sign out: back to sign-in', await p.getByRole('button', { name: 'Send me a code' }).isVisible())

  console.log(results.join('\n'))
  console.log('errors:', JSON.stringify([...new Set(errors)]))
  await browser.close()
})().catch((e) => { console.log(results.join('\n')); console.log('CRASH', e.message.split('\n').slice(0, 3).join(' ')); process.exit(1) })
