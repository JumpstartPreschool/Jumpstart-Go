/**
 * Chart geometry, shared by the dashboard (React SVG, ChartCards.tsx) and the PDFs (jsPDF, exports/pdf.ts): scales, ticks,
 * bar and line positions in any box, so a chart looks and reads the same on screen and on paper. Marks follow the house
 * specs: bars at most 24 units thick with a 2-unit gap between neighbours, lines 2 units, recessive hairline grid.
 */

/** Navy and teal, validated together (CVD and contrast on white, 2026-10-22). Text never wears them. */
export const SERIES = ['#3a5ea8', '#0f9488'] as const
export const INK = { primary: '#16213b', secondary: '#4a5470', muted: '#7a8299', grid: '#e4e7ee', surface: '#ffffff' } as const

export interface Box { x: number; y: number; w: number; h: number }
export interface Tick { value: number; label: string; y: number }
export interface XLabel { x: number; label: string }
export interface BarMark { x: number; y: number; w: number; h: number; series: number; value: number; category: number }
export interface LineModel { segments: Array<Array<[number, number]>>; dots: Array<{ x: number; y: number; value: number; category: number }> }
export interface ChartModel {
  plot: Box
  ticks: Tick[]
  xLabels: XLabel[]
  bars: BarMark[]
  line: LineModel | null
  /** Category slot centres, for hover targets. */
  slots: Array<{ x: number; w: number }>
}

/** Round tick steps (1, 2, 5 × 10^n) covering 0..max with about `count` ticks. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}
export const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v))

function frame(box: Box, categories: readonly string[], maxLabels: number, yLabelW: number, axisH: number) {
  const pad = axisH / 5
  const plot: Box = { x: box.x + yLabelW, y: box.y + pad, w: box.w - yLabelW - pad, h: box.h - axisH - pad }
  const n = Math.max(1, categories.length)
  const slotW = plot.w / n
  const every = Math.max(1, Math.ceil(n / maxLabels))
  const xLabels: XLabel[] = categories.flatMap((label, i) => (i % every === 0 ? [{ x: plot.x + slotW * (i + 0.5), label }] : []))
  const slots = categories.map((_, i) => ({ x: plot.x + slotW * i, w: slotW }))
  return { plot, slotW, xLabels, slots }
}

/**
 * Bars for one or two series: side by side (grouped) or stacked. Values 0 draw nothing. The y axis starts at 0 and ends
 * on a round tick.
 */
export function barChart(o: { box: Box; categories: readonly string[]; series: ReadonlyArray<readonly number[]>; stacked?: boolean; maxLabels?: number; yLabelW?: number; maxBar?: number; gap?: number; axisH?: number }): ChartModel {
  const { plot, slotW, xLabels, slots } = frame(o.box, o.categories, o.maxLabels ?? Math.max(2, Math.floor(o.box.w / 70)), o.yLabelW ?? 28, o.axisH ?? 22)
  const totals = o.categories.map((_, i) => (o.stacked ? o.series.reduce((a, s) => a + (s[i] ?? 0), 0) : Math.max(...o.series.map((s) => s[i] ?? 0))))
  const tickValues = niceTicks(Math.max(0, ...totals))
  const top = tickValues[tickValues.length - 1]!
  const yOf = (v: number) => plot.y + plot.h - (v / top) * plot.h
  const ticks = tickValues.map((value) => ({ value, label: compact(value), y: yOf(value) }))
  const groups = o.stacked ? 1 : o.series.length
  const gap = o.gap ?? 2
  const barW = Math.max(gap / 2, Math.min(o.maxBar ?? 24, (slotW * 0.72 - gap * (groups - 1)) / groups))
  const bars: BarMark[] = []
  o.categories.forEach((_, i) => {
    const groupW = barW * groups + gap * (groups - 1)
    let x0 = plot.x + slotW * i + (slotW - groupW) / 2
    let base = 0
    o.series.forEach((s, k) => {
      const v = s[i] ?? 0
      if (v > 0) {
        const y = yOf(base + v)
        // A 2-unit surface gap between stacked segments.
        const h = Math.max(0.5, yOf(base) - y - (o.stacked && base > 0 ? gap : 0))
        bars.push({ x: x0, y, w: barW, h, series: k, value: v, category: i })
      }
      if (o.stacked) base += v
      else x0 += barW + gap
    })
  })
  return { plot, ticks, xLabels, bars, line: null, slots }
}

/** A line from 0 to 1 (a rate); null values break the line: a period with nobody due is a gap, never a zero. */
export function lineChart(o: { box: Box; categories: readonly string[]; values: ReadonlyArray<number | null>; maxLabels?: number; yLabelW?: number; axisH?: number }): ChartModel {
  const { plot, slotW, xLabels, slots } = frame(o.box, o.categories, o.maxLabels ?? Math.max(2, Math.floor(o.box.w / 70)), o.yLabelW ?? 44, o.axisH ?? 22)
  const yOf = (v: number) => plot.y + plot.h - v * plot.h
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((value) => ({ value, label: `${value * 100}%`, y: yOf(value) }))
  const segments: Array<Array<[number, number]>> = []
  const dots: LineModel['dots'] = []
  let run: Array<[number, number]> = []
  o.values.forEach((v, i) => {
    if (v === null) { if (run.length) segments.push(run); run = []; return }
    const p: [number, number] = [plot.x + slotW * (i + 0.5), yOf(Math.max(0, Math.min(1, v)))]
    run.push(p)
    dots.push({ x: p[0], y: p[1], value: v, category: i })
  })
  if (run.length) segments.push(run)
  return { plot, ticks, xLabels, bars: [], line: { segments, dots }, slots }
}
