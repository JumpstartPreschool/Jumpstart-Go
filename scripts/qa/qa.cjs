// QA sweep of the real app in demo mode: every area, page and sheet at every target viewport.
// node qa.cjs [shotsDir] [scheme]
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const [,, shots = '', scheme = 'light'] = process.argv
const BASE = 'http://localhost:5178'
const VIEWPORTS = [
  [320, 640], [360, 780], [375, 812], [390, 844], [414, 896], [430, 932],
  [667, 375], [844, 390], [932, 430],
  [600, 960], [768, 1024], [820, 1180], [834, 1194], [1024, 768], [1024, 1366], [1180, 820],
  [1280, 800], [1366, 768], [1440, 900], [1536, 864], [1728, 1117], [1920, 1080], [2560, 1440],
]
const SHOT_AT = new Set(['320x640', '390x844', '844x390', '768x1024', '1180x820', '1440x900', '2560x1440'])

const measure = () => {
  const vw = innerWidth
  const dialog = document.querySelector('dialog[open]')
  const root = dialog || document.body
  const scrolls = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return p } return null }
  const visible = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.opacity !== '0' && !el.closest('.sr-only') }
  const out = { overflowX: document.documentElement.scrollWidth - vw, offenders: [], tiny: [], small: [], clipped: [] }
  const limit = dialog ? dialog.getBoundingClientRect().right : vw
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    const sc = scrolls(el)
    if (r.right > limit + 1 && (!sc || sc === dialog)) out.offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} r=${Math.round(r.right)}`)
    if (el.children.length === 0 && el.textContent.trim()) {
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs < 12) out.tiny.push(`${fs}px "${el.textContent.trim().slice(0, 24)}"`)
      // Text cut off without an ellipsis on purpose
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis' && getComputedStyle(el).overflowX === 'hidden') out.clipped.push(el.textContent.trim().slice(0, 30))
    }
    if (el.matches('button, a[href], [role=tab], [role=radio], [role=checkbox], select, input:not([type=hidden])') && !el.closest('[aria-hidden=true]')) {
      if (el.id === 'code') continue
      if ((r.height < 40 || r.width < 40) && !(el.tagName === 'INPUT' && el.closest('.input'))) out.small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
  }
  for (const k of ['offenders', 'tiny', 'small', 'clipped']) out[k] = [...new Set(out[k])].slice(0, 6)
  return out
}


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
  const report = []
  const errors = []

  async function session(role, states) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${role}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`${role} console: ${m.text()}`))
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    if (role) {
      await signIn(page, role)
    }
    for (const [name, open, close] of states) {
      try { await open(page) } catch (e) { errors.push(`${role} ${name} open: ${e.message.split('\n')[0]}`); continue }
      await page.waitForTimeout(400)
      for (const [w, h] of VIEWPORTS) {
        await page.setViewportSize({ width: w, height: h })
        await page.waitForTimeout(80)
        const m = await page.evaluate(measure)
        const bad = m.overflowX > 0 || m.offenders.length || m.tiny.length || m.small.length || m.clipped.length
        if (bad) report.push({ state: `${role || 'login'}/${name}`, vp: `${w}x${h}`, ...m })
        if (shots && SHOT_AT.has(`${w}x${h}`)) await page.screenshot({ path: `${shots}/${(role || 'login').toLowerCase().replace(' ', '')}-${name}-${w}x${h}.png` })
      }
      await page.setViewportSize({ width: 390, height: 844 })
      if (close) { try { await close(page) } catch (e) { errors.push(`${role} ${name} close: ${e.message.split('\n')[0]}`) } }
      await page.waitForTimeout(300)
    }
    await ctx.close()
  }

  const esc = async (p) => { await p.keyboard.press('Escape'); await p.waitForTimeout(450) }
  const tab = (n) => async (p) => p.getByRole('tab', { name: new RegExp('^' + n) }).click()

  await session(null, [
    ['email', async () => {}],
    ['code', async (p) => { await p.getByRole('button', { name: 'Admin', exact: true }).click(); await p.getByRole('button', { name: 'Send me a code' }).click(); await p.getByRole('button', { name: 'Sign in' }).waitFor() }],
    ['areas', async (p) => { await p.getByRole('button', { name: 'Sign in' }).click(); await p.getByText('Where would you like to start?', { exact: false }).waitFor() }],
  ])
  const dlg = (p) => p.locator('dialog[open]').last()
  await session('Admin', [
    ['children', async (p) => p.goto(BASE + '/admin')],
    ['family', tab('Parents and family')],
    ['staff', tab('Staff')],
    ['classes', tab('Classes')],
    ['add-staff', async (p) => { await tab('Staff')(p); await p.getByRole('button', { name: 'Add staff' }).first().click(); await dlg(p).getByRole('checkbox', { name: /Coordinator/ }).click() }, esc],
    ['add-child', async (p) => { await tab('Children')(p); await p.getByRole('button', { name: 'Add child' }).first().click(); await dlg(p).getByRole('button', { name: /^Add child/ }).click() }],
    ['relation', async (p) => dlg(p).getByRole('button', { name: 'Add a parent or relative' }).click()],
    ['relation-side', async (p) => dlg(p).getByRole('radio', { name: 'Aunt' }).click(), esc],
    ['picker-level', async (p) => { await p.locator('dialog[open]').last().getByRole('button', { name: /Choose the class and programme/ }).click() }],
    ['picker-plan', async (p) => { await dlg(p).getByRole('button', { name: /^Nursery/ }).click(); await dlg(p).getByRole('radio').first().click() }, async (p) => { await esc(p); await esc(p) }],
    ['child-page', async (p) => { await p.goto(BASE + '/admin'); await p.getByRole('button', { name: /^Isha Patil/ }).click() }],
    ['child-access', async (p) => p.getByRole('switch', { name: /App access for Rohan/ }).click(), esc],
    ['child-edit', async (p) => p.getByRole('button', { name: 'Edit details' }).click(), esc],
    ['child-left', async (p) => p.getByRole('button', { name: /has left the school/ }).click(), esc],
    ['child-add-person', async (p) => p.getByRole('button', { name: 'Add a parent or relative' }).click(), esc],
    ['account', async (p) => p.getByRole('button', { name: /^Account/ }).click(), esc],
    ['settings', async (p) => p.goto(BASE + '/admin/settings')],
    ['audit', async (p) => p.goto(BASE + '/admin/audit')],
    ['coordinators', async (p) => p.goto(BASE + '/admin/coordinators')],
    ['add-coordinator', async (p) => p.getByRole('button', { name: 'Add coordinator' }).first().click(), esc],
    ['edit-coordinator', async (p) => p.getByRole('button', { name: 'Edit' }).first().click(), esc],
  ])
  await session('Core team', [['today', async (p) => p.goto(BASE + '/core')], ['coordinators', async (p) => p.goto(BASE + '/core/coordinators')]])
  await session('Parent', [
    ['today', async (p) => p.goto(BASE + '/parent')],
  ])
  await session('Admin', [
    ['parent-else', async (p) => { await p.goto(BASE + '/parent'); await p.waitForTimeout(800); if (await p.getByRole('button', { name: 'I agree, continue' }).count()) { await p.getByRole('button', { name: 'I agree, continue' }).click(); await p.waitForTimeout(900) } await p.getByRole('button', { name: 'Someone else is collecting' }).first().click(); const d = p.locator('dialog[open]'); await d.getByLabel('Full name').fill('Ramesh Kulkarni'); await d.getByLabel('Mobile').fill('98123 45678'); await d.getByRole('button', { name: 'Create the link' }).click(); await d.getByText('Link ready', { exact: false }).waitFor() }, esc],
    ['parent-trip-else', async (p) => p.waitForTimeout(600)],
    ['parent-resend', async (p) => p.getByRole('button', { name: 'Resend link' }).click(), esc],
  ])
  await session('Coordinator', [
    ['start', async (p) => p.goto(BASE + '/coordinator')],
    ['voices', async (p) => p.getByRole('button', { name: 'Change voice' }).click(), esc],
    ['check', async (p) => { await p.getByRole('button', { name: /Start duty|Resume duty/ }).click(); await p.waitForTimeout(3500) }],
    ['on-duty', async (p) => { await p.getByRole('button', { name: 'Yes, I heard it' }).click() }],
    ['end-sheet', async (p) => p.getByRole('button', { name: 'End duty' }).click(), esc],
  ])

  const byState = {}
  for (const r of report) (byState[r.state] ||= []).push(r)
  for (const [state, rows] of Object.entries(byState)) {
    console.log(`\n## ${state}`)
    for (const r of rows) console.log(` ${r.vp}${r.overflowX > 0 ? ` overflowX=${r.overflowX}` : ''}${r.offenders.length ? ` off=${JSON.stringify(r.offenders)}` : ''}${r.tiny.length ? ` tiny=${JSON.stringify(r.tiny)}` : ''}${r.small.length ? ` small=${JSON.stringify(r.small)}` : ''}${r.clipped.length ? ` clipped=${JSON.stringify(r.clipped)}` : ''}`)
  }
  console.log('\nERRORS', JSON.stringify([...new Set(errors)], null, 1))
  console.log('states with issues:', Object.keys(byState).length)
  await browser.close()
})()
