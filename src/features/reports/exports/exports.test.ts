import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildDoc, csv, DEFAULT_SECTIONS, safeCell } from './doc'
import { wordDocument } from './docx'
import { sampleReport } from './fixture'
import { workbook } from './xlsx'

const keep = (name: string, bytes: ArrayBuffer | string) => {
  const out = process.env.REPORT_SAMPLES
  if (!out) return
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, name), typeof bytes === 'string' ? bytes : new Uint8Array(bytes))
}
// A child whose name starts like a formula, in Devanagari too, and a note with quotes and a line break.
const data = sampleReport({ children: 12 })
data.rows[3] = { ...data.rows[3]!, child: '=HYPERLINK("http://evil.example","Click")', note: 'Said "fever"\nwent home' }
data.rows[5] = { ...data.rows[5]!, child: 'आरव शर्मा' }
const doc = (sections = DEFAULT_SECTIONS) => buildDoc({ data, reportId: 'JSG-20261102-000042', generatedAt: '2026-11-02T07:00:00Z', scope: 'All classes', sections })

describe('CSV', () => {
  it('is UTF-8 with a BOM, CRLF lines, every text quoted, and no formula can run', () => {
    const text = csv(doc({ ...DEFAULT_SECTIONS, notes: true }))
    keep('register.csv', text)
    expect(text.startsWith('﻿"Date","Child"')).toBe(true)
    expect(text).toContain('\r\n')
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""Click"")"`)
    expect(text).toContain('"आरव शर्मा"')
    expect(text).toContain('"Said ""fever""\nwent home"')
    expect(text.split('\r\n').length - 2).toBe(doc().rows.length)
  })
  it('guards every leading character a spreadsheet treats as a formula', () => {
    for (const c of ['=', '+', '-', '@', '\t', '\r']) expect(safeCell(`${c}1`)).toBe(`'${c}1`)
    expect(safeCell('Riya')).toBe('Riya')
  })
  it('leaves guardian names and notes out unless asked', () => {
    expect(csv(doc())).not.toMatch(/Collected by|"Note"/)
    expect(csv(doc({ ...DEFAULT_SECTIONS, names: true }))).toContain('"Collected by"')
  })
})

describe('Excel', () => {
  it('has the summary, a filterable register with a frozen header, real dates and times, and no formulas', async () => {
    const d = doc()
    const bytes = await workbook(d)
    keep('report.xlsx', bytes)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Register', 'Gate activity', 'Classes', 'Definitions'])
    const reg = wb.getWorksheet('Register')!
    expect(reg.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(reg.autoFilter).toBeTruthy()
    expect(reg.rowCount).toBe(d.rows.length + 1)
    expect(reg.getCell('A2').value).toBeInstanceOf(Date)
    const dropoff = d.columns.findIndex((c) => c.key === 'dropoff') + 1
    const row = d.rows.findIndex((r) => r.dropoffMin !== null) + 2
    // Stored as a fraction of a day with a time format; read back, Excel's epoch day at that time.
    const t = reg.getRow(row).getCell(dropoff).value as Date
    expect(t.getUTCHours() * 60 + t.getUTCMinutes()).toBe(d.rows[row - 2]!.dropoffMin)
    expect(reg.getRow(row).getCell(dropoff).numFmt).toBe('h:mm AM/PM')
    let formulas = 0
    wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => { if (c.type === ExcelJS.ValueType.Formula) formulas++ })))
    expect(formulas).toBe(0)
    // The formula-like name is kept exactly, as a text cell.
    const childCol = d.columns.findIndex((c) => c.key === 'child') + 1
    const found = reg.getColumn(childCol).values.find((v) => typeof v === 'string' && v.startsWith('=HYPERLINK'))
    expect(found).toBe('=HYPERLINK("http://evil.example","Click")')
  })
})

describe('Word', () => {
  it('is a valid document with native charts, the figures, the tables and page numbers', async () => {
    const d = doc()
    const bytes = await wordDocument(d, new Uint8Array(readFileSync(join(__dirname, '..', 'logo.png'))))
    keep('report.docx', bytes)
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(Object.keys(zip.files).filter((f) => /^word\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(3)
    expect(xml).toContain('Key figures')
    expect(xml).toContain(d.tiles[0]!.value)
    expect(xml).toContain('Attendance register')
    expect(xml).toContain('w:orient="landscape"')
    const footer = Object.keys(zip.files).find((f) => /word\/footer\d*\.xml/.test(f))!
    expect(await zip.file(footer)!.async('string')).toMatch(/NUMPAGES/)
  })
})
