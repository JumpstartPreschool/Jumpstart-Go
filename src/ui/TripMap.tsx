import { useEffect, useRef, useState } from 'react'
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre finds its worker relative to its own file at runtime, which bundlers can't follow; let Vite bundle it instead.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { LocateFixed } from 'lucide-react'
import type { Freshness } from '../domain/freshness'

type LngLat = [number, number]

export interface TripMapProps {
  route: LngLat[]
  /** Index in `route` of the last point travelled. */
  progressIndex: number
  position: LngLat | null
  freshness: Freshness
  destination: LngLat
  /** Space kept clear for overlays (e.g. the bottom sheet), in px. */
  padding?: { top: number; bottom: number; left: number; right: number }
  className?: string
}

// Free vector tiles (services.md). Light and dark are separate map styles, like the app themes.
const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

setWorkerUrl(mapWorkerUrl)

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const line = (coords: LngLat[]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } })

function useDark() {
  const query = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

function personElement() {
  const el = document.createElement('div')
  el.className = 'trip-person'
  el.innerHTML = '<span class="trip-person__pulse"></span><span class="trip-person__dot"></span>'
  el.setAttribute('aria-hidden', 'true')
  return el
}

function schoolElement() {
  const el = document.createElement('div')
  el.className = 'trip-school'
  el.innerHTML =
    '<svg viewBox="0 0 32 32" width="22" height="22"><path d="M16 3.2l3.7 7.6 8.3 1.2-6 5.9 1.4 8.3L16 22.3l-7.4 3.9L10 17.9 4 12l8.3-1.2z" fill="var(--brand-orange)" stroke="var(--brand-red)" stroke-width="1.8" stroke-linejoin="round"/></svg>'
  el.setAttribute('aria-hidden', 'true')
  return el
}

/** Position the map with `className` (e.g. "absolute inset-0" or "relative h-60"); it fills that box. */
export default function TripMap({ route, progressIndex, position, freshness, destination, padding, className = 'relative h-full w-full' }: TripMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const person = useRef<Marker | null>(null)
  const [moved, setMoved] = useState(false)
  const dark = useDark()
  const pad = padding ?? { top: 80, bottom: 80, left: 48, right: 48 }

  const bounds = (): LngLatBoundsLike => {
    const b = new LngLatBounds(route[0], route[0])
    route.forEach((p) => b.extend(p))
    return b
  }

  useEffect(() => {
    if (!container.current) return
    const m = new MapLibre({
      container: container.current,
      style: dark ? STYLE.dark : STYLE.light,
      bounds: bounds(),
      fitBoundsOptions: { padding: pad },
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
    })
    m.touchZoomRotate.disableRotation()
    map.current = m
    m.on('dragstart', () => setMoved(true))

    m.on('load', () => {
      const accent = cssVar('--accent')
      const travelled = [...route.slice(0, progressIndex + 1), ...(position ? [position] : [])]
      const remaining = [...(position ? [position] : []), ...route.slice(progressIndex + 1)]
      m.addSource('travelled', { type: 'geojson', data: line(travelled) })
      m.addSource('remaining', { type: 'geojson', data: line(remaining) })
      m.addLayer({ id: 'remaining', type: 'line', source: 'remaining', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': accent, 'line-width': 4, 'line-opacity': 0.5, 'line-dasharray': [0.1, 2] } })
      m.addLayer({ id: 'travelled-casing', type: 'line', source: 'travelled', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': dark ? '#0f1115' : '#ffffff', 'line-width': 9 } })
      m.addLayer({ id: 'travelled', type: 'line', source: 'travelled', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': accent, 'line-width': 5 } })
    })

    new Marker({ element: schoolElement() }).setLngLat(destination).addTo(m)
    return () => {
      person.current = null
      m.remove()
    }
    // The map is rebuilt only when the theme changes; trip data updates in the effect below.
  }, [dark])

  // Keep the traveller marker honest: it only exists with a position, and fades when not live (TRK-3).
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!position || freshness === 'unavailable') {
      person.current?.remove()
      person.current = null
      return
    }
    person.current ??= new Marker({ element: personElement() }).setLngLat(position).addTo(m)
    person.current.setLngLat(position)
    person.current.getElement().dataset.freshness = freshness
    const src = m.getSource('travelled') as GeoJSONSource | undefined
    src?.setData(line([...route.slice(0, progressIndex + 1), position]))
  }, [position, freshness, route, progressIndex, dark])

  return (
    <div className={className}>
      {/* maplibre-gl.css makes its container position: relative, so size it rather than positioning it. */}
      <div ref={container} className="h-full w-full" />
      {moved && (
        <button
          type="button"
          onClick={() => {
            map.current?.fitBounds(bounds(), { padding: pad, duration: 600 })
            setMoved(false)
          }}
          className="glass absolute right-4 flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-ink transition-transform duration-200 ease-spring active:scale-95"
          style={{ top: pad.top - 56 > 12 ? pad.top - 56 : 12 }}
        >
          <LocateFixed className="size-[18px]" aria-hidden /> Recenter
        </button>
      )}
    </div>
  )
}
