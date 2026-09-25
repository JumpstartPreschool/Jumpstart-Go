import { useEffect, useRef, useState } from 'react'
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre finds its worker relative to its own file at runtime, which bundlers can't follow; let Vite bundle it instead.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { LocateFixed, MapPinOff } from './icons'
import type { Freshness } from '../domain/freshness'

type LngLat = [number, number]

export interface TripMapProps {
  /** A planned route, or just the path travelled so far (then `progressIndex` is its last index). May be empty. */
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

/** Follows the app's theme (light for now; tokens.css switches on data-theme), not the device setting. */
function useDark() {
  const read = () => document.documentElement.dataset.theme === 'dark'
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const watch = new MutationObserver(() => setDark(read()))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => watch.disconnect()
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
  el.innerHTML = '<img src="/brand/star.webp" width="30" height="30" alt="">'
  el.setAttribute('aria-hidden', 'true')
  return el
}

/** Position the map with `className` (e.g. "absolute inset-0" or "relative h-60"); it fills that box. */
export default function TripMap({ route, progressIndex, position, freshness, destination, padding, className = 'relative h-full w-full' }: TripMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const person = useRef<Marker | null>(null)
  const [moved, setMoved] = useState(false)
  // No WebGL, or the map style never loads (offline, tile service down): say so instead of a blank box.
  const [failed, setFailed] = useState(false)
  const dark = useDark()
  const pad = padding ?? { top: 80, bottom: 80, left: 48, right: 48 }

  // Everything that matters in view: the path, the traveller and the school.
  const bounds = (): LngLatBoundsLike => {
    const b = new LngLatBounds(destination, destination)
    route.forEach((p) => b.extend(p))
    if (position) b.extend(position)
    return b
  }

  useEffect(() => {
    if (!container.current) return
    let m: MapLibre
    try {
      m = new MapLibre({
        container: container.current,
        style: dark ? STYLE.dark : STYLE.light,
        bounds: bounds(),
        fitBoundsOptions: { padding: pad },
        attributionControl: { compact: true },
        pitchWithRotate: false,
        dragRotate: false,
      })
    } catch {
      setFailed(true) // WebGL isn't available on this device
      return
    }
    setFailed(false)
    m.touchZoomRotate.disableRotation()
    map.current = m
    m.on('dragstart', () => setMoved(true))
    // A tile that fails now and then is normal; the style not loading at all is not.
    let loaded = false
    const giveUp = setTimeout(() => { if (!loaded) setFailed(true) }, 15_000)
    m.on('error', (e) => { if (!loaded && !(e as { sourceId?: string }).sourceId) setFailed(true) })

    m.on('load', () => {
      // Credits stay one tap away behind the (i) button, instead of opening across small maps.
      container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      loaded = true
      clearTimeout(giveUp)
      setFailed(false)
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
      clearTimeout(giveUp)
      person.current = null
      map.current = null
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
      {failed && (
        <div role="status" className="absolute inset-0 grid place-items-center bg-sunken p-6 text-center">
          <div className="grid max-w-[300px] justify-items-center gap-2">
            <MapPinOff className="size-7 text-ink-2" aria-hidden />
            <p className="text-h4">The map can't load right now</p>
            <p className="text-small font-semibold text-ink-2">Arrival updates and the distance still work without it.</p>
          </div>
        </div>
      )}
      {moved && !failed && (
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
