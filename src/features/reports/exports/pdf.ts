import { jsPDF } from 'jspdf'
import { barChart, lineChart, type Box, type ChartModel } from '../charts'
import { BIN_MIN, dayLabel, pct, type Row } from '../engine'
import { busiestNote, stamp, type ReportDoc } from './doc'

/** The embedded typeface (Plus Jakarta Sans, OFL) as base64 TTFs, and the school's logo as PNG bytes. */
export interface PdfAssets { regular: string; semibold: string; bold: string; logo: Uint8Array }

// A4 landscape, in millimetres.
const W = 297
const H = 210
const M = 12
const INK = '#16213b'
const INK2 = '#4a5470'
const MUTED = '#7a8299'
const LINE = '#dfe3ec'
const TILE = '#f3f5f9'

function start(a: PdfAssets, d: ReportDoc, title: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  doc.addFileToVFS('PJS-Regular.ttf', a.regular)
  doc.addFileToVFS('PJS-SemiBold.ttf', a.semibold)
  doc.addFileToVFS('PJS-ExtraBold.ttf', a.bold)
  doc.addFont('PJS-Regular.ttf', 'PJS', 'normal')
  doc.addFont('PJS-SemiBold.ttf', 'PJS', 'semibold')
  doc.addFont('PJS-ExtraBold.ttf', 'PJS', 'bold')
  doc.setFont('PJS', 'normal')
  doc.setProperties({
    title: `${title} · ${d.period}`, subject: `Attendance Intelligence · ${d.center}`, author: 'JumpStart Go', creator: 'JumpStart Go',
    keywords: `attendance, ${d.reportId}, confidential`,
  })
  return doc
}

const font = (doc: jsPDF, style: 'normal' | 'semibold' | 'bold', size: number, color = INK) => {
  doc.setFont('PJS', style)
  doc.setFontSize(size)
  doc.setTextColor(color)
}
/** The text cut with an ellipsis to fit the width: nothing ever runs past its box. */
export function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text
  let s = text
  while (s.length > 1 && doc.getTextWidth(`${s}…`) > width) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}
/** At most `lines` lines in the width, the last cut with an ellipsis. */
function wrap(doc: jsPDF, text: string, width: number, lines: number): string[] {
  const all = doc.splitTextToSize(text, width) as string[]
  if (all.length <= lines) return all
  const kept = all.slice(0, lines)
  kept[lines - 1] = fit(doc, `${kept[lines - 1]} ${all.slice(lines).join(' ')}`, width)
  return kept
}

function header(doc: jsPDF, a: PdfAssets, d: ReportDoc, title: string) {
  const logoW = 34
  doc.addImage(a.logo, 'PNG', M, M, logoW, (logoW * 136) / 420)
  doc.setDrawColor(LINE)
  doc.setLineWidth(0.3)
  doc.line(M + logoW + 5, M + 0.5, M + logoW + 5, M + 11)
  const x = M + logoW + 10
  const right = W - M
  font(doc, 'semibold', 8, d.theme.accent)
  doc.text('JumpStart Go · Attendance Intelligence', x, M + 3, { baseline: 'top' })
  font(doc, 'bold', 17)
  doc.text(title, x, M + 7.5, { baseline: 'top' })
  const leftEnd = x + Math.max(doc.getTextWidth(title), 60)
  font(doc, 'normal', 8, INK2)
  doc.text(fit(doc, d.center, right - x - 90), x, M + 16, { baseline: 'top' })
  // The right block never meets the title: whatever room is left, at most 95 mm.
  const room = Math.min(95, right - leftEnd - 6)
  font(doc, 'normal', 6.5, MUTED)
  doc.text('REPORTING PERIOD', right, M + 2.5, { align: 'right', baseline: 'top' })
  font(doc, 'semibold', 9.5)
  doc.text(fit(doc, d.period, room), right, M + 6, { align: 'right', baseline: 'top' })
  font(doc, 'normal', 7, INK2)
  doc.text(fit(doc, d.scope, room), right, M + 11, { align: 'right', baseline: 'top' })
  doc.text(fit(doc, `Generated ${stamp(d.generatedAt)}`, room), right, M + 15, { align: 'right', baseline: 'top' })
  doc.setDrawColor(LINE)
  doc.line(M, M + 21, right, M + 21)
}

function footer(doc: jsPDF, d: ReportDoc, page: number, pages: number) {
  const y = H - 9
  doc.setDrawColor(LINE)
  doc.setLineWidth(0.3)
  doc.line(M, y - 3, W - M, y - 3)
  const right = `CONFIDENTIAL · Page ${page} of ${pages}`
  font(doc, 'bold', 6.5, d.theme.accent)
  const rw = doc.getTextWidth(right)
  doc.text(right, W - M, y, { align: 'right', baseline: 'top' })
  font(doc, 'normal', 6.5, MUTED)
  const left = `Reporting period: ${d.period}  ·  Report ID: ${d.reportId}  ·  Data cutoff: ${d.cutoff}  ·  Generated ${stamp(d.generatedAt)}`
  doc.text(fit(doc, left, W - 2 * M - rw - 8), M, y, { baseline: 'top' })
}

function tile(doc: jsPDF, b: Box, label: string, value: string, detail: string, accent: string) {
  doc.setFillColor(TILE)
  doc.roundedRect(b.x, b.y, b.w, b.h, 2.5, 2.5, 'F')
  doc.setFillColor(accent)
  doc.roundedRect(b.x, b.y + 4, 1.2, b.h - 8, 0.6, 0.6, 'F')
  font(doc, 'semibold', 6.5, MUTED)
  doc.text(fit(doc, label.toUpperCase(), b.w - 8), b.x + 4.5, b.y + 3.6, { baseline: 'top' })
  font(doc, 'bold', value.length > 7 ? 14 : 18)
  doc.text(fit(doc, value, b.w - 8), b.x + 4.5, b.y + 8.6, { baseline: 'top' })
  // A step smaller before anything is cut.
  font(doc, 'normal', 6.5, INK2)
  if (doc.getTextWidth(detail) > b.w - 8) doc.setFontSize(5.8)
  doc.text(fit(doc, detail, b.w - 8), b.x + 4.5, b.y + b.h - 6, { baseline: 'top' })
}

/** Draws a chart model: hairline grid, axis labels in muted ink, bars with a rounded data end, a 0.6 mm line. */
function drawChart(doc: jsPDF, m: ChartModel, colors: readonly string[], highlight?: number) {
  doc.setLineWidth(0.2)
  doc.setDrawColor(LINE)
  font(doc, 'normal', 5.8, MUTED)
  for (const t of m.ticks) {
    doc.line(m.plot.x, t.y, m.plot.x + m.plot.w, t.y)
    doc.text(t.label, m.plot.x - 1.5, t.y, { align: 'right', baseline: 'middle' })
  }
  for (const l of m.xLabels) doc.text(l.label, l.x, m.plot.y + m.plot.h + 2, { align: 'center', baseline: 'top' })
  if (highlight !== undefined && m.slots[highlight]) {
    const s = m.slots[highlight]!
    doc.setFillColor('#eef1f7')
    doc.rect(s.x, m.plot.y, s.w, m.plot.h, 'F')
  }
  for (const b of m.bars) {
    doc.setFillColor(colors[b.series]!)
    const r = Math.min(0.8, b.w / 2, b.h)
    if (b.h > r * 2) {
      doc.roundedRect(b.x, b.y, b.w, b.h, r, r, 'F')
      doc.rect(b.x, b.y + b.h - r, b.w, r, 'F')
    } else doc.rect(b.x, b.y, b.w, b.h, 'F')
  }
  if (m.line) {
    doc.setDrawColor(colors[0]!)
    doc.setLineWidth(0.6)
    doc.setLineJoin('round')
    doc.setLineCap('round')
    for (const s of m.line.segments) for (let i = 1; i < s.length; i++) doc.line(s[i - 1]![0], s[i - 1]![1], s[i]![0], s[i]![1])
    doc.setLineWidth(0.5)
    doc.setDrawColor('#ffffff')
    doc.setFillColor(colors[0]!)
    for (const p of m.line.dots) doc.circle(p.x, p.y, m.line.dots.length > 20 ? 0.6 : 0.9, 'FD')
  }
}

function card(doc: jsPDF, b: Box, title: string, subtitle: string) {
  doc.setDrawColor(LINE)
  doc.setLineWidth(0.3)
  doc.roundedRect(b.x, b.y, b.w, b.h, 2.5, 2.5, 'S')
  font(doc, 'bold', 9)
  doc.text(fit(doc, title, b.w - 8), b.x + 4, b.y + 3.8, { baseline: 'top' })
  font(doc, 'normal', 6.2, INK2)
  doc.text(fit(doc, subtitle, b.w - 8), b.x + 4, b.y + 8.4, { baseline: 'top' })
}
function legend(doc: jsPDF, x: number, y: number, names: readonly string[], colors: readonly string[]) {
  font(doc, 'semibold', 6.2, INK2)
  let cx = x
  names.forEach((n, i) => {
    doc.setFillColor(colors[i]!)
    doc.roundedRect(cx, y - 1.1, 2.2, 2.2, 0.5, 0.5, 'F')
    doc.text(n, cx + 3.2, y, { baseline: 'middle' })
    cx += 3.2 + doc.getTextWidth(n) + 5
  })
}
function emptyChart(doc: jsPDF, b: Box, text: string) {
  doc.setFillColor(TILE)
  doc.roundedRect(b.x, b.y, b.w, b.h, 2, 2, 'F')
  font(doc, 'semibold', 7.5, INK2)
  doc.text(text, b.x + b.w / 2, b.y + b.h / 2, { align: 'center', baseline: 'middle' })
}

/** A4 landscape, exactly one page: header, six KPIs, three charts, insights and exceptions, footer. */
export function executivePdf(d: ReportDoc, a: PdfAssets): ArrayBuffer {
  const title = 'Executive Summary'
  const doc = start(a, d, title)
  header(doc, a, d, title)
  const colors = d.theme.series

  // Six KPIs.
  const kTop = M + 25
  const kH = 24
  const kW = (W - 2 * M - 5 * 4) / 6
  d.tiles.forEach((t, i) => tile(doc, { x: M + i * (kW + 4), y: kTop, w: kW, h: kH }, t.label, t.value, t.detail, d.theme.accent))

  // Three charts.
  const cTop = kTop + kH + 5
  const cH = 79
  const cW = (W - 2 * M - 2 * 5) / 3
  const box = (i: number): Box => ({ x: M + i * (cW + 5) + 3, y: cTop + 17, w: cW - 6, h: cH - 20 })
  const cats = d.points.map((p) => p.label)
  const labels = cats.length > 16 ? 5 : 7

  card(doc, { x: M, y: cTop, w: cW, h: cH }, 'Attendance trend', `${d.grainWord} attendance rate: present and late of recorded child-days`)
  const rates = d.points.map((p) => p.rate)
  if (rates.some((r) => r !== null)) drawChart(doc, lineChart({ box: box(0), categories: cats, values: rates, maxLabels: labels, yLabelW: 9, axisH: 6 }), colors)
  else emptyChart(doc, box(0), 'No recorded attendance in this period')

  card(doc, { x: M + cW + 5, y: cTop, w: cW, h: cH }, 'Pickup vs drop-off activity', `${d.grainWord} verified events (gate or admin correction)`)
  legend(doc, M + cW + 5 + 4, cTop + 14, ['Drop-offs', 'Pickups'], colors)
  if (d.kpis.verifiedDropoffs + d.kpis.verifiedPickups) {
    drawChart(doc, barChart({ box: box(1), categories: cats, series: [d.points.map((p) => p.dropoffs), d.points.map((p) => p.pickups)], maxLabels: labels, yLabelW: 7, axisH: 6, maxBar: 4, gap: 0.4 }), colors)
  } else emptyChart(doc, box(1), 'No verified drop-offs or pickups')

  card(doc, { x: M + 2 * (cW + 5), y: cTop, w: cW, h: cH }, 'Peak gate activity', `Verified events per ${BIN_MIN} minutes (IST) · ${busiestNote(d)}`)
  legend(doc, M + 2 * (cW + 5) + 4, cTop + 14, ['Arrivals', 'Departures'], colors)
  if (d.gate.busiest) {
    const bins = d.gate.bins
    const hourly = bins.map((b) => (b.from % 120 === 0 ? `${((b.from / 60 + 11) % 12) + 1} ${b.from < 720 ? 'AM' : 'PM'}` : ''))
    const m = barChart({ box: box(2), categories: hourly, series: [bins.map((b) => b.dropoffs), bins.map((b) => b.pickups)], stacked: true, maxLabels: bins.length, yLabelW: 7, axisH: 6, maxBar: 4, gap: 0.3 })
    m.xLabels = m.xLabels.filter((l) => l.label)
    drawChart(doc, m, colors, bins.indexOf(d.gate.busiest))
  } else emptyChart(doc, box(2), 'No verified gate events')

  // Insights and exceptions.
  const bTop = cTop + cH + 5
  const bH = H - 13 - bTop - 3
  const iW = 168
  card(doc, { x: M, y: bTop, w: iW, h: bH }, 'Management insights', 'From the figures in this report only')
  font(doc, 'normal', 7.6)
  let y = bTop + 14
  const list = d.insights.length ? d.insights : ['Not enough recorded data in this period for an observation.']
  for (const text of list) {
    const lines = wrap(doc, text, iW - 14, 2)
    doc.setFillColor(d.theme.accent)
    doc.circle(M + 5.2, y + 1.3, 0.7, 'F')
    font(doc, 'normal', 7.6)
    doc.text(lines, M + 8, y, { baseline: 'top', lineHeightFactor: 1.3 })
    y += lines.length * 3.6 + 2.2
  }
  const eX = M + iW + 5
  const eW = W - M - eX
  card(doc, { x: eX, y: bTop, w: eW, h: bH }, 'Exceptions summary', `${d.exceptions.length} child-days need attention`)
  const lines: Array<[string, number]> = [
    ['No attendance record', d.kpis.notRecorded],
    ['Missing verified drop-off or pickup', d.kpis.missingVerification],
    ['Late pickups', d.kpis.latePickups],
    ['Late arrivals', d.kpis.lateArrivals],
  ]
  y = bTop + 13.5
  for (const [label, n] of lines) {
    font(doc, 'normal', 7.2, INK2)
    doc.text(fit(doc, label, eW - 22), eX + 4, y, { baseline: 'top' })
    font(doc, 'bold', 7.2)
    doc.text(String(n), eX + eW - 4, y, { align: 'right', baseline: 'top' })
    y += 3.9
  }
  const recent = d.exceptions.slice(0, 2)
  if (recent.length) {
    doc.setDrawColor(LINE)
    doc.line(eX + 4, y + 0.3, eX + eW - 4, y + 0.3)
    y += 1.8
    font(doc, 'normal', 6.4, MUTED)
    for (const r of recent) {
      doc.text(fit(doc, `${dayLabel(r.day)} · ${r.child} · ${r.issues[0]}`, eW - 8), eX + 4, y, { baseline: 'top' })
      y += 3.2
    }
  }
  footer(doc, d, 1, 1)
  return doc.output('arraybuffer')
}

// The detailed register: every row, as many A4 landscape pages as it takes ------------------------------------------------

const COLS: Array<{ label: string; w: number; value: (r: Row) => string }> = [
  { label: 'Date', w: 21, value: (r) => dayLabel(r.day) },
  { label: 'Child', w: 38, value: (r) => r.child },
  { label: 'Class', w: 26, value: (r) => r.class },
  { label: 'Status', w: 19, value: (r) => r.attendance.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()) },
  { label: 'Record', w: 19, value: (r) => (r.record === 'none' ? '—' : r.record.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())) },
  { label: 'Sched. in', w: 14, value: (r) => r.sched_in ?? '' },
  { label: 'Drop-off', w: 24, value: (r) => (r.dropoffMin === null ? '' : `${hm(r.dropoffMin)} ${src(r.dropoff_source)}`) },
  { label: 'Sched. out', w: 15, value: (r) => r.sched_out ?? '' },
  { label: 'Pickup', w: 24, value: (r) => (r.pickupMin === null ? '' : `${hm(r.pickupMin)} ${src(r.pickup_source)}`) },
  { label: 'Late in / out (min)', w: 22, value: (r) => (r.lateArrivalMin ?? r.latePickupMin) === null ? '' : `${r.lateArrivalMin ?? '—'} / ${r.latePickupMin ?? '—'}` },
  { label: 'Exceptions', w: 51, value: (r) => r.issues.join('; ') },
]
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const src = (s: Row['dropoff_source']) => (s === 'gate' ? '· gate' : s === 'corrected' ? '· corr.' : s === 'record' ? '· unverif.' : '')

export function detailedPdf(d: ReportDoc, a: PdfAssets): ArrayBuffer {
  const title = 'Attendance Register'
  const doc = start(a, d, title)
  const rowH = 5.6
  const top = M + 41
  const perPage = Math.floor((H - 16 - top) / rowH)
  const pages = Math.max(1, Math.ceil(d.rows.length / perPage))
  const scale = (W - 2 * M) / COLS.reduce((s, c) => s + c.w, 0)
  for (let p = 0; p < pages; p++) {
    if (p > 0) doc.addPage()
    header(doc, a, d, title)
    if (p === 0) {
      font(doc, 'normal', 7.2, INK2)
      const k = d.kpis
      doc.text(fit(doc, `${d.rows.length} child-days · attendance ${pct(k.attendanceRate)} · ${k.verifiedDropoffs} verified drop-offs · ${k.verifiedPickups} verified pickups · ${k.incomplete} incomplete records. Times are India Standard Time.`, W - 2 * M), M, M + 25, { baseline: 'top' })
    }
    let x = M
    const hy = top - 7
    doc.setFillColor(TILE)
    doc.rect(M, hy - 1.5, W - 2 * M, 6, 'F')
    font(doc, 'semibold', 6.6, INK2)
    for (const c of COLS) { doc.text(c.label, x + 1.5, hy + 1.5, { baseline: 'middle' }); x += c.w * scale }
    font(doc, 'normal', 6.8)
    const slice = d.rows.slice(p * perPage, (p + 1) * perPage)
    slice.forEach((r, i) => {
      const y = top + i * rowH
      if (i % 2 === 1) { doc.setFillColor('#fafbfd'); doc.rect(M, y - 2.6, W - 2 * M, rowH, 'F') }
      let cx = M
      for (const c of COLS) {
        doc.setTextColor(c.label === 'Exceptions' && r.issues.length ? '#a3361d' : INK)
        doc.text(fit(doc, c.value(r), c.w * scale - 3), cx + 1.5, y, { baseline: 'middle' })
        cx += c.w * scale
      }
    })
    if (!d.rows.length) { font(doc, 'semibold', 8, INK2); doc.text('No attendance rows in this period.', M, top) }
    footer(doc, d, p + 1, pages)
  }
  return doc.output('arraybuffer')
}
