import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { INK, SERIES, type Box, type ChartModel } from './charts'

const HEIGHT = 220

/** The chart's width in CSS pixels, so it is laid out at 1 unit = 1 pixel and its 11 px labels stay 11 px on a phone. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => { if (e) setW(Math.max(280, Math.round(e.contentRect.width))) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

interface Props {
  title: string
  subtitle?: string
  /** Lays the chart out in a box of the chart's real size. */
  build: (box: Box) => ChartModel
  categories: readonly string[]
  /** One name per series; two or more get a legend. */
  seriesNames: readonly string[]
  /** Values per series, by category, for the tooltip and the table. Null is "no data". */
  values: ReadonlyArray<ReadonlyArray<number | null>>
  format: (v: number | null) => string
  /** A note under the chart (the busiest half hour, say). */
  note?: ReactNode
  empty?: string | null
}

/**
 * One chart card: a solid surface, the title says what is plotted, a legend for two or more series, a tooltip for the
 * category under the pointer or keyboard focus, and the same numbers as a table. Marks only ever wear the series colours.
 */
export function Chart({ title, subtitle, build, categories, seriesNames, values, format, note, empty }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const id = useId()
  const [box, width] = useWidth()
  const VIEW = { w: width, h: HEIGHT }
  const model = build({ x: 0, y: 0, w: VIEW.w, h: VIEW.h })
  const { plot } = model
  const tip = hover === null ? null : model.slots[hover]
  return (
    <figure className="card m-0 flex min-w-0 flex-col rounded-xl p-5" aria-labelledby={`${id}-t`}>
      <figcaption className="mb-3">
        <h3 id={`${id}-t`} className="text-h4">{title}</h3>
        {subtitle && <p className="text-caption font-semibold text-ink-2">{subtitle}</p>}
        {seriesNames.length >= 2 && (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption font-bold text-ink-2" aria-label="Legend">
            {seriesNames.map((n, i) => (
              <li key={n} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: SERIES[i] }} aria-hidden />{n}</li>
            ))}
          </ul>
        )}
      </figcaption>
      {empty ? (
        <p className="grid min-h-[180px] place-items-center rounded-lg bg-sunken px-6 text-center text-small font-semibold text-ink-2">{empty}</p>
      ) : (
        <div className="relative" ref={box}>
          <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="block h-auto w-full" role="img" aria-label={`${title}. The table below has the values.`}
            onMouseLeave={() => setHover(null)}>
            {model.ticks.map((t) => (
              <g key={t.value}>
                <line x1={plot.x} x2={plot.x + plot.w} y1={t.y} y2={t.y} stroke={INK.grid} strokeWidth={1} />
                <text x={plot.x - 6} y={t.y + 4} textAnchor="end" fontSize={11} fill={INK.muted}>{t.label}</text>
              </g>
            ))}
            {model.xLabels.map((l) => (
              <text key={`${l.x}`} x={l.x} y={plot.y + plot.h + 16} textAnchor="middle" fontSize={11} fill={INK.muted}>{l.label}</text>
            ))}
            {tip && <rect x={tip.x} y={plot.y} width={tip.w} height={plot.h} fill={INK.grid} opacity={0.45} />}
            {model.bars.map((b, i) => (
              // 4-unit rounded data end, square at the baseline.
              <path key={i} fill={SERIES[b.series]} d={roundedTop(b.x, b.y, b.w, b.h, Math.min(4, b.w / 2, b.h))} />
            ))}
            {model.line?.segments.map((s, i) => (
              <polyline key={i} points={s.map((p) => p.join(',')).join(' ')} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {model.line?.dots.map((d) => (
              <circle key={d.category} cx={d.x} cy={d.y} r={hover === d.category ? 5 : 4} fill={SERIES[0]} stroke={INK.surface} strokeWidth={2} />
            ))}
            {/* Hit targets: the whole category slot, bigger than any mark. */}
            {model.slots.map((s, i) => (
              <rect key={i} x={s.x} y={plot.y} width={s.w} height={plot.h} fill="transparent" tabIndex={0}
                aria-label={`${categories[i]}: ${seriesNames.map((n, k) => `${n} ${format(values[k]?.[i] ?? null)}`).join(', ')}`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
          </svg>
          {tip && hover !== null && (
            <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md bg-ink px-3 py-2 text-caption font-bold text-canvas shadow-float"
              style={{ left: `${Math.min(88, Math.max(12, ((tip.x + tip.w / 2) / VIEW.w) * 100))}%` }} role="status">
              <p className="opacity-80">{categories[hover]}</p>
              {seriesNames.map((n, k) => (
                <p key={n} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: SERIES[k] }} aria-hidden />{n}: {format(values[k]?.[hover] ?? null)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {note && <p className="mt-2 text-caption font-semibold text-ink-2">{note}</p>}
      {!empty && (
        <details className="mt-3 text-caption">
          <summary className="cursor-pointer font-bold text-accent-ink">Show as a table</summary>
          <div className="mt-2 max-h-56 overflow-auto">
            <table className="w-full text-left tabular-nums">
              <thead><tr><th className="py-1 pr-3 font-bold text-ink-3">Period</th>{seriesNames.map((n) => <th key={n} className="py-1 pr-3 font-bold text-ink-3">{n}</th>)}</tr></thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr key={c} className="border-t border-line"><td className="py-1 pr-3">{c}</td>{seriesNames.map((n, k) => <td key={n} className="py-1 pr-3">{format(values[k]?.[i] ?? null)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  )
}

/** A bar path with its top corners rounded and its base square. */
export function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

/** Horizontal bars for a few labelled values (statuses, classes): the value at the bar's end, in text ink. */
export function BarList({ title, subtitle, items, format, empty }: { title: string; subtitle?: string; items: Array<{ label: string; value: number | null; max?: number; detail?: string }>; format: (v: number | null) => string; empty?: string | null }) {
  const max = Math.max(1e-9, ...items.map((i) => i.max ?? i.value ?? 0))
  return (
    <section className="card flex min-w-0 flex-col rounded-xl p-5">
      <h3 className="text-h4">{title}</h3>
      {subtitle && <p className="mb-3 text-caption font-semibold text-ink-2">{subtitle}</p>}
      {empty ? <p className="grid min-h-[120px] place-items-center rounded-lg bg-sunken px-6 text-center text-small font-semibold text-ink-2">{empty}</p> : (
        <ul className="grid gap-2.5">
          {items.map((i) => (
            <li key={i.label} className="grid grid-cols-[minmax(84px,30%)_1fr_auto] items-center gap-3 text-small">
              <span className="truncate font-bold text-ink" title={i.label}>{i.label}</span>
              <span className="h-3 rounded-r-[4px] bg-sunken" aria-hidden>
                <span className="block h-3 rounded-r-[4px]" style={{ width: `${((i.value ?? 0) / max) * 100}%`, background: SERIES[0] }} />
              </span>
              <span className="text-right font-extrabold tabular-nums text-ink">{format(i.value)}{i.detail && <span className="ml-1 font-semibold text-ink-3">{i.detail}</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
