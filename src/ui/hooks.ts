import { useEffect, useState, useSyncExternalStore } from 'react'
import { now as clockNow } from '../lib/clock'

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

/** The app's current time in ms (see lib/clock), updated every `everyMs`. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(clockNow)
  useEffect(() => {
    const id = setInterval(() => setNow(clockNow()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/** Opened from the Home Screen (installed web app) rather than a browser tab. */
export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}
