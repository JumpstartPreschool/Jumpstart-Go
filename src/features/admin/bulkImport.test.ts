import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkRows, matchProgramme, parseCsv, parseDate, readSheet, templateCsv, COLUMNS } from './bulkImport'
import type { ProgrammeRow } from './api'

const prog = (id: string, name: string) => ({ id, name, flexible: false, starts: '09:00', ends: '13:00' }) as ProgrammeRow
const PROGRAMMES = [prog('n360', 'Nursery · 360°'), prog('n360p', 'Nursery · 360°+'), prog('jr', 'Jr KG · Half day')]
const TODAY = new Date('2026-09-25T06:00:00Z')

describe('bulk upload: reading files (D37)', () => {
  it('reads CSV with quotes, commas, line breaks, a BOM and Excel\'s semicolons', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']])
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('reads a real Excel file: shared strings, a date cell, a number cell and gaps', async () => {
    const bytes = readFileSync(new URL('./fixtures/children.xlsx', import.meta.url))
    const rows = await readSheet(Object.assign(new Blob([bytes]), { name: 'children.xlsx' }))
    expect(rows[0]!.slice(0, 4)).toEqual(['Child full name', 'Called', 'Date of birth', 'Programme'])
    expect(rows[1]![0]).toBe('Ishaan Deshpande')
    expect(parseDate(rows[1]![2]!)).toBe('2022-03-04') // stored by Excel as a serial number
    expect(rows[1]![7]).toBe('9876543210')
    expect(rows[2]![0]).toBe('Meera & Co') // an escaped character
  })

  it('keeps sheet row numbers when Excel leaves out blank rows or writes an empty one as <row/>', async () => {
    const sheet = '<worksheet><sheetData>'
      + '<row r="1" spans="1:2"><c r="A1" t="inlineStr"><is><t>Child full name</t></is></c></row>'
      + '<row r="2"><c r="A2" t="inlineStr"><is><t>Aarav</t></is></c></row>'
      + '<row r="4"/>'
      + '<row r="5" x14ac:dyDescent="0.25"><c r="A5" t="inlineStr"><is><t>Diya</t></is></c><c r="B5"/></row>'
      + '</sheetData></worksheet>'
    const rows = await readSheet(Object.assign(new Blob([storedZip({ 'xl/worksheets/sheet1.xml': sheet })]), { name: 'gaps.xlsx' }))
    expect(rows.map((r) => r[0] ?? '')).toEqual(['Child full name', 'Aarav', '', '', 'Diya'])
  })

  it("reads a CSV saved by Excel on Windows (not UTF-8) without garbling names", async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('Child full name\nZo'), 0xeb, ...new TextEncoder().encode(' Kulkarni\n')])
    expect((await readSheet(Object.assign(new Blob([bytes]), { name: 'kids.csv' })))[1]).toEqual(['Zoë Kulkarni'])
  })

  it('refuses the old .xls format with a reason', async () => {
    await expect(readSheet(Object.assign(new Blob(['\xd0\xcf']), { name: 'old.xls' }))).rejects.toThrow('old_excel')
  })
})

describe('bulk upload: understanding rows', () => {
  it('reads dates the way Indian schools write them', () => {
    expect(parseDate('04/03/2022')).toBe('2022-03-04')
    expect(parseDate('4-3-2022')).toBe('2022-03-04')
    expect(parseDate('2022-03-04')).toBe('2022-03-04')
    expect(parseDate('4 Mar 2022')).toBe('2022-03-04')
    expect(parseDate('31/02/2022')).toBeNull()
    expect(parseDate('soon')).toBeNull()
  })

  it('matches programmes loosely but keeps 360° and 360°+ apart', () => {
    expect(matchProgramme('nursery 360', PROGRAMMES)?.id).toBe('n360')
    expect(matchProgramme('Nursery - 360°+', PROGRAMMES)?.id).toBe('n360p')
    expect(matchProgramme('JR KG half day', PROGRAMMES)?.id).toBe('jr')
    expect(matchProgramme('Sr KG', PROGRAMMES)).toBeNull()
  })

  it('needs only four columns: child, date of birth, parent and contact number', () => {
    expect(COLUMNS.map((c) => c.header)).toEqual(['Child full name', 'Date of birth', 'Parent name', 'Contact number'])
    const { rows, missing } = checkRows([
      ['Child full name', 'Date of birth', 'Parent name', 'Contact number'],
      ['Aarav  Kulkarni', '04/03/2022', 'Priya Kulkarni', '98765 43210'],
      ['Aarav Kulkarni', '04/03/2022', 'Rahul Kulkarni', '98765 43211'],
      [],
      ['Zoya Khan', '01/01/2030', 'Sana Khan', '98765 00000'],
      ['Ira Joshi', '', 'Neha Joshi', '98765 11111'],
      ['Kabir Rao', '12/08/2021', '', '98765 22222'],
      ['Diya Shah', '12/08/2021', 'Meera Shah', ''],
      ['Reyansh Iyer', '12/08/2021', 'Asha Iyer', '12345'],
    ], PROGRAMMES, TODAY)
    expect(missing).toEqual([])
    const [ok, dup, future, noDob, noParent, noContact, badContact] = rows
    expect(ok!.problems).toEqual([])
    // The programme is chosen in the app after the upload.
    expect(ok!.child).toEqual({ full_name: 'Aarav Kulkarni', preferred_name: null, date_of_birth: '2022-03-04', programme_id: null, gender: null })
    expect(ok!.people).toEqual([{ full_name: 'Priya Kulkarni', relation: 'Parent', kind: 'parent', phone: '+919876543210', app_access: true }])
    expect(dup!.line).toBe(3)
    expect(dup!.problems).toContain('The same child is on row 2.')
    expect(future!.problems).toEqual(["01/01/2030 can't be right for a preschool child."])
    expect(noDob!.problems).toEqual(['The date of birth is missing.'])
    expect(noParent!.problems).toEqual(["The parent's name is missing."])
    expect(noContact!.problems).toEqual(['The contact number is missing.'])
    expect(badContact!.problems).toEqual(['"12345" isn\'t a mobile number. Use 10 digits, or + and the country code.'])
  })

  it('still reads an older sheet with more columns, using what it fills in', () => {
    const { rows } = checkRows([
      ['Child full name', 'Date of birth', 'Boy or girl', 'Programme', 'Parent 1 name', 'Parent 1 relation', 'Parent 1 mobile', 'Family member name', 'Family member mobile'],
      ['Aarav Kulkarni', '04/03/2022', 'M', 'nursery 360', 'Priya Kulkarni', 'Mother', '98765 43210', 'Suresh Kulkarni', '98765 43212'],
      ['Ira Joshi', '04/03/2022', '', 'Sr KG', 'Neha Joshi', '', '98765 11111', '', ''],
    ], PROGRAMMES, TODAY)
    expect(rows[0]!.problems).toEqual([])
    expect(rows[0]!.child).toMatchObject({ programme_id: 'n360', gender: 'boy' })
    expect(rows[0]!.people.map((p) => p.relation)).toEqual(['Mother', 'Family'])
    // A programme the school doesn't have no longer stops the row: it's chosen in the app instead.
    expect(rows[1]!.problems).toEqual([])
    expect(rows[1]!.child!.programme_id).toBeNull()
    expect(rows[1]!.warnings).toEqual(['"Sr KG" isn\'t one of the school\'s programmes: choose it here.'])
  })

  it('finds the column names below a title row, and keeps the sheet row numbers', () => {
    const header = COLUMNS.map((c) => c.header)
    const { rows, missing, header: found } = checkRows([['Jumpstart children 2026'], [], header, ['Aarav Kulkarni', '2022/03/04', 'Priya Kulkarni', '98765 43210']], PROGRAMMES, TODAY)
    expect(missing).toEqual([])
    expect(found).toEqual(header)
    expect(rows[0]).toMatchObject({ line: 4, childName: 'Aarav Kulkarni', problems: [] })
    expect(rows[0]!.child!.date_of_birth).toBe('2022-03-04')
  })

  it('takes the column names schools commonly use, and names the ones a sheet is missing', () => {
    expect(checkRows([['Student name', 'DOB', 'Mother name', 'Mobile']], PROGRAMMES, TODAY).missing).toEqual([])
    expect(checkRows([['Name', 'Class']], PROGRAMMES, TODAY).missing).toEqual(['Date of birth', 'Parent name', 'Contact number'])
  })

  it('offers a template that reads back cleanly', () => {
    const { rows: checked, missing } = checkRows(parseCsv(templateCsv()), PROGRAMMES, TODAY)
    expect(missing).toEqual([])
    expect(checked[0]!.problems).toEqual([])
    expect(checked[0]!.people).toHaveLength(1)
  })
})

/** A zip of uncompressed files, as Excel writes them (the reader ignores CRCs, so they're left 0). */
function storedZip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const parts: number[] = []
  const central: number[] = []
  const le = (n: number, bytes: number) => Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 0xff)
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = [...enc.encode(name)]
    const data = [...enc.encode(text)]
    const offset = parts.length
    parts.push(...le(0x04034b50, 4), ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(0, 4), ...le(data.length, 4), ...le(data.length, 4),
      ...le(nameBytes.length, 2), ...le(0, 2), ...nameBytes, ...data)
    central.push(...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(0, 4), ...le(data.length, 4),
      ...le(data.length, 4), ...le(nameBytes.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(offset, 4), ...nameBytes)
  }
  const n = Object.keys(files).length
  return new Uint8Array([...parts, ...central, ...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(n, 2), ...le(n, 2),
    ...le(central.length, 4), ...le(parts.length, 4), ...le(0, 2)])
}
