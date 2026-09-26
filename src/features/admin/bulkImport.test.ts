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

  it('checks every row and says what is wrong in words', () => {
    const header = COLUMNS.map((c) => c.header)
    const row = (over: Partial<Record<string, string>>) => header.map((h) => over[h] ?? '')
    const { rows, missing } = checkRows([
      header,
      row({ 'Child full name': 'Aarav  Kulkarni', 'Date of birth': '04/03/2022', 'Boy or girl': 'M', Programme: 'nursery 360', 'Parent 1 name': 'Priya Kulkarni', 'Parent 1 relation': 'Mother', 'Parent 1 mobile': '98765 43210', 'Parent 1 email': 'Priya@Example.com', 'Family member name': 'Suresh Kulkarni', 'Family member mobile': '98765 43212' }),
      row({ 'Child full name': 'Aarav Kulkarni', 'Date of birth': '04/03/2022', Programme: 'nursery 360', 'Parent 1 name': 'P K', 'Parent 1 mobile': '12345' }),
      row({}),
      row({ 'Child full name': 'Zoya', 'Boy or girl': 'maybe', 'Date of birth': '01/01/2030', Programme: 'Sr KG', 'Child contact number': '98765 00000', 'Parent 1 name': 'Sana Khan' }),
    ], PROGRAMMES, TODAY)
    expect(missing).toEqual([])
    expect(rows).toHaveLength(3)
    const [ok, dup, bad] = rows as [typeof rows[0], typeof rows[0], typeof rows[0]]
    expect(ok.problems).toEqual([])
    expect(ok.child).toEqual({ full_name: 'Aarav Kulkarni', preferred_name: null, date_of_birth: '2022-03-04', programme_id: 'n360', gender: 'boy' })
    expect(ok.people).toEqual([
      { full_name: 'Priya Kulkarni', relation: 'Mother', kind: 'parent', email: 'priya@example.com', phone: '+919876543210', app_access: true },
      { full_name: 'Suresh Kulkarni', relation: 'Family', kind: 'family', email: null, phone: '+919876543212', app_access: false },
    ])
    expect(dup.line).toBe(3)
    expect(dup.problems).toContain('The same child is on row 2.')
    expect(dup.warnings.some((p) => p.includes('"12345" isn\'t a mobile number'))).toBe(true)
    // Only the programme stops this row; the impossible date and the unclear gender are left empty with a warning.
    expect(bad.problems).toEqual(['"Sr KG" isn\'t one of the school\'s programmes.'])
    expect(bad.warnings).toEqual(expect.arrayContaining(['01/01/2030 can\'t be right for a preschool child, so the date of birth is left empty.', '"maybe" isn\'t Boy or Girl, so it\'s left empty.']))
    expect(bad.people[0]!.phone).toBe('+919876500000') // the child's contact number stands in for Parent 1's mobile
  })

  it('names the columns a sheet is missing', () => {
    expect(checkRows([['Name', 'Class']], PROGRAMMES, TODAY).missing).toEqual(['Parent 1 name'])
  })

  it('imports a row with only the name, programme and a parent', () => {
    const [row, noContact] = checkRows([['Child full name', 'Programme', 'Parent 1 name', 'Parent 1 mobile'], ['Ira Joshi', 'nursery 360', 'Neha Joshi', '98765 11111'], ['Kabir Rao', 'nursery 360', 'Anil Rao', '']], PROGRAMMES, TODAY).rows
    expect(row!.problems).toEqual([])
    expect(row!.child).toMatchObject({ full_name: 'Ira Joshi', date_of_birth: null, programme_id: 'n360' })
    expect(row!.warnings).toEqual(["No date of birth. Add it later on the child's page."])
    // Nobody the school can reach: that row waits.
    expect(noContact!.problems).toEqual(['A parent with a mobile or email is needed, so the school can reach the family.'])
  })

  it('offers a template that reads back cleanly', () => {
    const rows = parseCsv(templateCsv('Nursery · 360°'))
    const { rows: checked, missing } = checkRows(rows, PROGRAMMES, TODAY)
    expect(missing).toEqual([])
    expect(checked[0]!.problems).toEqual([])
    expect(checked[0]!.people).toHaveLength(3)
  })
})
