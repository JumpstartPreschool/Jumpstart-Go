// Bulk upload of children (D37): the admin uploads an Excel file, checks the preview, imports the good rows and downloads
// the rest to fix; the core team uploads the CSV template; a child already registered is refused. Demo mode only.
// Usage: node scripts/qa/bulk.cjs   (npm run dev:demo first: sample data on port 5178)
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { chromium } = require('/Users/ankitsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright-core')
const BASE = 'http://localhost:5178'
const XLSX = path.join(__dirname, '../../src/features/admin/fixtures/children.xlsx')
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
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const errors = []
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, reducedMotion: 'reduce', acceptDownloads: true })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const dlg = () => p.locator('dialog[open]').last()
  try {
    await p.goto(BASE + '/', { waitUntil: 'networkidle' })
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('jumpstart-')) localStorage.removeItem(k) })
    await signIn(p, 'Admin')
    await p.goto(BASE + '/admin')
    await p.getByRole('button', { name: 'Bulk upload' }).waitFor({ timeout: 8000 })
    const before = await p.getByRole('tab', { name: /^Children/ }).textContent()

    // The template downloads and names every column.
    await p.getByRole('button', { name: 'Bulk upload' }).click()
    const [tpl] = await Promise.all([p.waitForEvent('download'), dlg().getByRole('button', { name: 'Template' }).click()])
    const tplText = fs.readFileSync(await tpl.path(), 'utf8')
    ok('template downloads with the columns and an example', tpl.suggestedFilename() === 'jumpstart-children-template.csv' && tplText.includes('Child full name') && tplText.includes('Parent 1 mobile'))

    // A wrong file is explained.
    const junk = path.join(os.tmpdir(), 'jumpstart-junk.csv'); fs.writeFileSync(junk, 'Name,Class\nA,B\n')
    await dlg().locator('input[type=file]').setInputFiles(junk)
    ok('a sheet without the needed columns is explained', await dlg().getByText('The sheet needs these columns: Date of birth, Parent 1 name.', { exact: false }).isVisible())

    // The real Excel file: 2 good rows, 1 to fix, the blank row ignored.
    await dlg().locator('input[type=file]').setInputFiles(XLSX)
    await dlg().getByText('children.xlsx').waitFor({ timeout: 8000 })
    ok('preview: 2 ready and 1 to fix', await dlg().getByText('2 children ready').isVisible() && await dlg().getByText('1 row to fix').isVisible())
    ok('preview: the problem is said in words', await dlg().getByText('"soon" isn\'t a date', { exact: false }).isVisible())
    await dlg().getByRole('button', { name: 'Import 2 children' }).click()
    await dlg().getByText('2 children added with their families.').waitFor({ timeout: 15000 })
    ok('import: 2 added, 1 still to fix', await dlg().getByText('1 row still to fix', { exact: false }).isVisible())
    const [fix] = await Promise.all([p.waitForEvent('download'), dlg().getByRole('button', { name: 'Download rows to fix' }).click()])
    const fixText = fs.readFileSync(await fix.path(), 'utf8')
    ok('rows to fix download with the reason', fixText.includes('No Date Kid') && fixText.includes('Problem') && fixText.includes("isn't a date") && !fixText.includes('Ishaan'))
    await dlg().getByRole('button', { name: 'Done' }).click()
    await p.waitForTimeout(800)
    ok('the children list grows by 2', (await p.getByRole('tab', { name: /^Children/ }).textContent()) !== before, `${before} → ${await p.getByRole('tab', { name: /^Children/ }).textContent()}`)
    ok('the imported child is listed', await p.getByText('Ishaan Deshpande').first().isVisible())

    // Uploading the same file again: both are already registered, refused by the backend in words.
    await p.getByRole('button', { name: 'Bulk upload' }).click()
    await dlg().locator('input[type=file]').setInputFiles(XLSX)
    await dlg().getByRole('button', { name: 'Import 2 children' }).click()
    await dlg().getByText('No children were added.').waitFor({ timeout: 15000 })
    ok('the same children again are refused', await dlg().getByText('is already registered', { exact: false }).first().isVisible())
    await dlg().getByRole('button', { name: 'Done' }).click()
  } catch (e) {
    results.push('CRASH admin ' + e.message.split('\n')[0])
  }
  await ctx.close()

  // The core team: Schedules → Bulk upload children, with the template's example row.
  const core = await browser.newContext({ viewport: { width: 1024, height: 1366 }, reducedMotion: 'reduce', acceptDownloads: true })
  const c = await core.newPage()
  c.on('pageerror', (e) => errors.push(e.message))
  try {
    await c.goto(BASE + '/', { waitUntil: 'networkidle' })
    await signIn(c, 'Core team')
    await c.goto(BASE + '/core/schedules')
    await c.getByRole('button', { name: 'Bulk upload children' }).click()
    const d = c.locator('dialog[open]').last()
    const [tpl] = await Promise.all([c.waitForEvent('download'), d.getByRole('button', { name: 'Template' }).click()])
    await d.locator('input[type=file]').setInputFiles(await tpl.path())
    await d.getByRole('button', { name: 'Import 1 child' }).click()
    await d.getByText('1 child added with their families.').waitFor({ timeout: 15000 })
    ok('core team: imports from the template', true)
    await d.getByRole('button', { name: 'Done' }).click()
    await c.getByRole('tab', { name: "Children's times" }).click()
    const added = c.getByText('Aarav Kulkarni').first()
    await added.waitFor({ timeout: 8000 }).catch(() => {})
    ok("core team: the new child appears in Children's times", await added.isVisible())
  } catch (e) {
    results.push('CRASH core ' + e.message.split('\n')[0])
  }
  await core.close()

  // A coordinator has no bulk upload.
  const coord = await browser.newContext({ viewport: { width: 1024, height: 1366 } })
  const q = await coord.newPage()
  await q.goto(BASE + '/', { waitUntil: 'networkidle' })
  await signIn(q, 'Coordinator')
  ok('coordinator: no bulk upload anywhere', (await q.getByRole('button', { name: /Bulk upload/ }).count()) === 0)
  await browser.close()

  console.log(results.join('\n'))
  console.log('errors', JSON.stringify(errors))
  process.exitCode = results.some((r) => !r.startsWith('PASS')) || errors.length ? 1 : 0
})()
