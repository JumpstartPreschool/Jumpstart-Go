import ExcelJS from 'exceljs'
import { indiaClock, toMinutes } from '../../../domain/time'
import { binRange, pct, timeOf } from '../engine'
import { stamp, type ReportDoc } from './doc'

const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D3461' } } as const
const BAND = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F9' } } as const

/**
 * A cell value as it is. Text goes in as a text cell, which Excel never evaluates, so a name starting with "=" can't run
 * as a formula here (the CSV, which Excel parses, has its own guard: safeCell).
 */
const cell = (v: string | number | null) => v

function headerRow(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row)
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  r.fill = HEAD
  r.alignment = { vertical: 'middle', wrapText: true }
  r.height = 30
}

/** Summary, Register (filters, frozen header, real dates and times), Gate activity and Classes: the same figures as the PDF. */
export async function workbook(d: ReportDoc): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'JumpStart Go'
  wb.title = `Attendance report ${d.period}`
  wb.subject = d.reportId
  wb.created = new Date(d.generatedAt)

  const s = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  s.columns = [{ width: 34 }, { width: 18 }, { width: 40 }, { width: 14 }, { width: 14 }, { width: 14 }]
  s.addRow(['JumpStart Go · Attendance Intelligence']).font = { bold: true, size: 16, color: { argb: 'FF1D3461' } }
  s.addRow([d.center]).font = { size: 11 }
  const meta: Array<[string, string]> = [['Reporting period', d.period], ['Scope', d.scope], ['Report ID', d.reportId], ['Data cutoff', d.cutoff], ['Generated', stamp(d.generatedAt)], ['Classification', 'Confidential']]
  for (const [k, v] of meta) { const r = s.addRow([k, v]); r.getCell(1).font = { bold: true, color: { argb: 'FF4A5470' } } }
  s.addRow([])
  if (d.sections.kpis) {
    const h = s.addRow(['Measure', 'Value', 'Detail'])
    headerRow(s, h.number)
    for (const t of d.tiles) s.addRow([t.label, t.value, t.detail])
    s.addRow([])
  }
  if (d.sections.insights) {
    s.addRow(['Management insights']).font = { bold: true, size: 12 }
    for (const i of d.insights.length ? d.insights : ['Not enough recorded data in this period for an observation.']) s.addRow([cell(i)]).getCell(1).alignment = { wrapText: false }
    s.addRow([])
  }
  const ph = s.addRow(['Period', 'Attendance rate', 'Due child-days', 'Verified drop-offs', 'Verified pickups', 'Late pickups'])
  headerRow(s, ph.number)
  for (const p of d.points) {
    const r = s.addRow([p.label, p.rate, p.due, p.dropoffs, p.pickups, p.latePickups])
    r.getCell(2).numFmt = '0.0%'
  }

  if (d.sections.register) {
    const ws = wb.addWorksheet('Register', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] })
    ws.columns = d.columns.map((c) => ({ header: c.label, key: c.key, width: c.width }))
    headerRow(ws, 1)
    const timeCols = new Set(['dropoff', 'pickup', 'announced', 'ready', 'sched_in', 'sched_out'])
    for (const r of d.rows) {
      const row = ws.addRow(d.columns.map((c) => {
        const v = c.value(r)
        if (c.key === 'day') return new Date(`${r.day}T00:00:00Z`)
        // Times as real times of day (a fraction of a day), so they sort and filter as times.
        if (timeCols.has(c.key)) {
          const min = c.key === 'dropoff' ? r.dropoffMin : c.key === 'pickup' ? r.pickupMin : c.key === 'sched_in' ? toMin(r.sched_in) : c.key === 'sched_out' ? toMin(r.sched_out)
            : c.key === 'announced' ? isoMin(r.pickup_announced_at) : isoMin(r.ready_at)
          return min === null ? null : min / 1440
        }
        return cell(v)
      }))
      d.columns.forEach((c, i) => {
        if (c.key === 'day') row.getCell(i + 1).numFmt = 'd mmm yyyy'
        else if (timeCols.has(c.key)) row.getCell(i + 1).numFmt = 'h:mm AM/PM'
      })
      if (r.issues.length) row.getCell(d.columns.findIndex((c) => c.key === 'issues') + 1).font = { color: { argb: 'FFA3361D' } }
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: d.columns.length } }
  }

  const g = wb.addWorksheet('Gate activity', { views: [{ state: 'frozen', ySplit: 1 }] })
  g.columns = [{ header: 'Half hour (IST)', width: 22 }, { header: 'Verified drop-offs', width: 18 }, { header: 'Verified pickups', width: 18 }, { header: 'Total', width: 10 }]
  headerRow(g, 1)
  for (const b of d.gate.bins) g.addRow([binRange(b), b.dropoffs, b.pickups, b.dropoffs + b.pickups])
  if (d.gate.busiest) g.addRow([`Busiest: ${binRange(d.gate.busiest)}`]).font = { bold: true }

  const k = wb.addWorksheet('Classes', { views: [{ state: 'frozen', ySplit: 1 }] })
  k.columns = [{ header: 'Class', width: 30 }, { header: 'Attendance rate', width: 16 }, { header: 'Present child-days', width: 18 }, { header: 'Due child-days', width: 16 }, { header: 'Late pickups', width: 14 }, { header: 'Incomplete records', width: 18 }]
  headerRow(k, 1)
  for (const c of d.classes) k.addRow([cell(c.name), c.rate, c.present, c.due, c.latePickups, c.incomplete]).getCell(2).numFmt = '0.0%'

  const n = wb.addWorksheet('Definitions')
  n.columns = [{ width: 28 }, { width: 110 }]
  const defs: Array<[string, string]> = [
    ['Attendance rate', '(Present + Late) ÷ (Present + Late + Absent), over child-days with a record.'],
    ['Verified drop-off / pickup', "A coordinator's Check in or Hand over at the gate (a pickup only to a registered guardian, or to a collector with their code), or an admin's correction with a reason."],
    ['Late', 'A verified drop-off or pickup more than 10 minutes after the scheduled time.'],
    ['Not recorded', 'Expected (enrolled, programme running, not a holiday) but with no attendance record.'],
    ['Expected days', "Worked out from each child's current programmes, terms and regular times: a change made since (a new programme, a new pickup time) also applies to earlier days in this report."],
    ['Incomplete', 'Present, but without a verified drop-off or pickup (today: still on campus is not incomplete).'],
    ['Over 30 days', 'Gate details are kept for 30 days: earlier days keep their recorded times only, so they are neither verified, incomplete nor late.'],
    ['Times', 'India Standard Time (Asia/Kolkata).'],
    ['Average arrival', `Mean time of verified drop-offs: ${timeOf(d.kpis.avgArrivalMin)}. Coverage of recorded child-days: ${pct(d.kpis.coverage)}.`],
  ]
  for (const [a, b] of defs) { const r = n.addRow([a, b]); r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { wrapText: true } }
  n.getRow(1).fill = BAND
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

const toMin = (hhmm: string | null) => { try { return hhmm ? toMinutes(hhmm) : null } catch { return null } }
const isoMin = (iso: string | null) => (iso ? indiaClock(new Date(iso)).minutes : null)
