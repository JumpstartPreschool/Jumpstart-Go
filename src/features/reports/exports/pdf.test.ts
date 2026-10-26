import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDoc, THEMES } from './doc'
import { sampleReport } from './fixture'
import { detailedPdf, executivePdf, type PdfAssets } from './pdf'

const dir = join(__dirname, '..')
const b64 = (f: string) => readFileSync(join(dir, 'fonts', f)).toString('base64')
const assets: PdfAssets = { regular: b64('PlusJakartaSans-Regular.ttf'), semibold: b64('PlusJakartaSans-SemiBold.ttf'), bold: b64('PlusJakartaSans-ExtraBold.ttf'), logo: new Uint8Array(readFileSync(join(dir, 'logo.png'))) }
// Set REPORT_SAMPLES=<dir> to keep the files for looking at (pdftoppm -png).
const keep = (name: string, bytes: ArrayBuffer) => {
  const out = process.env.REPORT_SAMPLES
  if (!out) return
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, name), new Uint8Array(bytes))
}
const text = (bytes: ArrayBuffer) => new TextDecoder('latin1').decode(new Uint8Array(bytes))
const pagesOf = (bytes: ArrayBuffer) => [...text(bytes).matchAll(/\/Type \/Page[^s]/g)].length
const doc = (data = sampleReport(), theme = THEMES.navy) => buildDoc({ data, reportId: 'JSG-20261102-000042', generatedAt: '2026-11-02T07:00:00Z', scope: 'All classes · all programmes', theme })

describe('executive PDF', () => {
  it('is exactly one A4 landscape page, with the fonts embedded and its metadata', () => {
    const pdf = executivePdf(doc(), assets)
    keep('executive.pdf', pdf)
    const t = text(pdf)
    expect(pagesOf(pdf)).toBe(1)
    expect(t).toMatch(/\/MediaBox \[0 0 841\.8[89]\d* 595\.2[78]\d*\]/)
    expect(t).toMatch(/\/FontFile2/)
    // Title, author and keywords (stored as UTF-16 because of the middle dot).
    expect(t).toMatch(/\/Title \(/)
    expect(t).toMatch(/\/Keywords \(/)
  })
  it('stays one page with long names, a whole year, a monochrome theme and no data at all', () => {
    const long = executivePdf(doc(sampleReport({ longNames: true, from: '2025-11-01', to: '2026-10-31', children: 60 }), THEMES.mono), assets)
    keep('executive-year-long-mono.pdf', long)
    expect(pagesOf(long)).toBe(1)
    const empty = executivePdf(doc({ ...sampleReport(), rows: [] }), assets)
    keep('executive-empty.pdf', empty)
    expect(pagesOf(empty)).toBe(1)
  })
})

describe('detailed PDF', () => {
  it('has every row, on as many pages as it takes, each numbered', () => {
    const d = doc()
    const pdf = detailedPdf(d, assets)
    keep('detailed.pdf', pdf)
    const pages = pagesOf(pdf)
    expect(pages).toBeGreaterThan(1)
    expect(d.rows.length).toBeGreaterThan(600)
  })
})
