import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, PageOrientation, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import { ChartRun } from 'docx/charts'
import { binRange, dayLabel } from '../engine'
import { stamp, type ReportDoc } from './doc'

const FONT = 'Calibri'
const hex = (c: string) => c.replace('#', '').toUpperCase()

function cell(text: string, o: { head?: boolean; width?: number; right?: boolean; accent?: string } = {}) {
  return new TableCell({
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    shading: o.head ? { type: ShadingType.CLEAR, fill: hex(o.accent ?? '#1d3461'), color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: o.head, color: o.head ? 'FFFFFF' : undefined, size: o.head ? 18 : 18, font: FONT })] })],
  })
}
function table(head: string[], rows: string[][], widths: number[], accent: string, rightFrom = Infinity) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: line, bottom: line, left: none, right: none, insideHorizontal: line, insideVertical: none },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { head: true, width: widths[i], right: i >= rightFrom, accent })) }),
      ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, { width: widths[i], right: i >= rightFrom })) })),
    ],
  })
}
const line = { style: BorderStyle.SINGLE, size: 4, color: 'DFE3EC' }
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) => new Paragraph({ heading: level, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, font: FONT })] })
const p = (text: string, o: { size?: number; color?: string; bold?: boolean } = {}) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, font: FONT, size: o.size ?? 20, color: o.color, bold: o.bold })] })

/** An editable Word document (A4 landscape): the same figures, native Word charts and tables, and the register when chosen. */
export async function wordDocument(d: ReportDoc, logo: Uint8Array): Promise<ArrayBuffer> {
  const accent = d.theme.accent
  const [c1, c2] = d.theme.series.map(hex) as [string, string]
  const cats = d.points.map((x) => x.label)
  const body: Array<Paragraph | Table> = [
    new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 150, height: 49 }, altText: { name: 'Jumpstart', description: 'Jumpstart logo', title: 'Jumpstart' } })] }),
    p('JumpStart Go · Attendance Intelligence', { color: hex(accent), bold: true, size: 20 }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Attendance report', font: FONT })] }),
    p(`${d.center} · ${d.period}`, { size: 22 }),
    p(`${d.scope} · Report ID ${d.reportId} · Data cutoff ${d.cutoff} · Generated ${stamp(d.generatedAt)}`, { size: 16, color: '7A8299' }),
  ]
  if (d.sections.kpis) {
    body.push(h('Key figures'), table(['Measure', 'Value', 'Detail'], d.tiles.map((t) => [t.label, t.value, t.detail]), [30, 18, 52], accent))
  }
  if (d.sections.charts && d.points.length) {
    const size = { width: 620, height: 260 }
    const chartFont = { name: FONT }
    body.push(h('Charts'))
    if (d.points.some((x) => x.rate !== null)) {
      body.push(new Paragraph({ children: [new ChartRun({
        type: 'line', title: `${d.grainWord} attendance rate`, categories: cats, markers: true, legend: false, font: chartFont, transformation: size,
        series: [{ name: 'Attendance rate', values: d.points.map((x) => x.rate), color: c1 }],
        valueAxis: { minimum: 0, maximum: 1, numberFormat: '0%' }, emptyValues: 'gap',
      })] }))
    }
    body.push(new Paragraph({ children: [new ChartRun({
      type: 'column', title: `${d.grainWord} verified drop-offs and pickups`, categories: cats, font: chartFont, transformation: size,
      series: [{ name: 'Drop-offs', values: d.points.map((x) => x.dropoffs), color: c1 }, { name: 'Pickups', values: d.points.map((x) => x.pickups), color: c2 }],
    })] }))
    body.push(new Paragraph({ children: [new ChartRun({
      type: 'column', title: 'Peak gate activity (IST, per 30 minutes)', categories: d.gate.bins.map((b) => b.label), stacking: 'stacked', gapWidth: 40, font: chartFont, transformation: size,
      series: [{ name: 'Arrivals', values: d.gate.bins.map((b) => b.dropoffs), color: c1 }, { name: 'Departures', values: d.gate.bins.map((b) => b.pickups), color: c2 }],
    })] }))
    if (d.gate.busiest) body.push(p(`Busiest recorded half hour: ${binRange(d.gate.busiest)}.`, { size: 18, color: '4A5470' }))
  }
  if (d.sections.insights) {
    body.push(h('Management insights'))
    for (const i of d.insights.length ? d.insights : ['Not enough recorded data in this period for an observation.']) body.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: i, font: FONT, size: 20 })] }))
  }
  if (d.classes.length) {
    body.push(h('Classes'), table(['Class', 'Attendance rate', 'Present / due', 'Late pickups', 'Incomplete'],
      d.classes.map((c) => [c.name, c.rate === null ? '—' : `${(c.rate * 100).toFixed(1)}%`, `${c.present} / ${c.due}`, String(c.latePickups), String(c.incomplete)]), [36, 16, 18, 15, 15], accent, 1))
  }
  if (d.sections.exceptions) {
    const list = d.exceptions.slice(0, 50)
    body.push(h('Exceptions'), p(`${d.exceptions.length} child-days need attention${d.exceptions.length > list.length ? `; the ${list.length} most recent are listed` : ''}.`, { size: 18 }))
    if (list.length) body.push(table(['Date', 'Child', 'Class', 'Exception'], list.map((r) => [dayLabel(r.day), r.child, r.class, r.issues.join('; ')]), [16, 28, 18, 38], accent))
  }
  if (d.sections.register) {
    body.push(h('Attendance register'), table(d.columns.map((c) => c.label), d.rows.map((r) => d.columns.map((c) => String(c.value(r) ?? ''))), d.columns.map(() => 100 / d.columns.length), accent))
  }
  const doc = new Document({
    creator: 'JumpStart Go', title: `Attendance report ${d.period}`, description: `${d.center} · ${d.reportId} · Confidential`, keywords: 'attendance, confidential',
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      headers: { default: new Header({ children: [p(`${d.center} · Attendance report · ${d.period}`, { size: 16, color: '7A8299' })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: `${d.reportId} · CONFIDENTIAL · Page `, font: FONT, size: 16, color: '7A8299' }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '7A8299' }),
        new TextRun({ text: ' of ', font: FONT, size: 16, color: '7A8299' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: '7A8299' }),
      ] })] }) },
      children: body,
    }],
  })
  return Packer.toArrayBuffer(doc)
}
