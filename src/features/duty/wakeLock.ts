/**
 * Keeps the iPad screen on while on duty (system-architecture A2).
 * The system drops the lock whenever the app is hidden or the iPad locks, so it is requested again
 * every time the app comes back to the foreground. `onChange` reports whether the screen is being held on.
 */
export function createWakeLock(onChange: (held: boolean) => void) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator && !brokenOnApple(navigator.userAgent)
  let sentinel: WakeLockSentinel | null = null
  let wanted = false
  let pending = false

  async function acquire() {
    if (!supported || !wanted || sentinel || pending || document.visibilityState !== 'visible') return
    pending = true
    try {
      const lock = await navigator.wakeLock.request('screen')
      // Ended while the request was in flight: don't keep the screen on.
      if (!wanted) { await lock.release(); return }
      sentinel = lock
      onChange(true)
      lock.addEventListener('release', () => {
        if (sentinel !== lock) return
        sentinel = null
        onChange(false)
      })
    } catch {
      onChange(false)
    } finally {
      pending = false
    }
  }

  const onVisibility = () => void acquire()

  return {
    supported,
    async start() {
      wanted = true
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('pageshow', onVisibility)
      await acquire()
    },
    /** From a tap on the "screen may turn off" banner. */
    retry: acquire,
    async stop() {
      wanted = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onVisibility)
      const lock = sentinel
      sentinel = null
      await lock?.release()
    },
  }
}

/**
 * iPhone and iPad apps opened from the Home Screen accept a wake lock but don't hold it before iOS 18.4 (a WebKit bug):
 * the screen still locks (after 30 seconds on an iPhone) and the page stops, so nothing is announced. On those versions
 * the duty screen asks for Auto-Lock → Never instead of saying the screen stays on.
 */
export function brokenOnApple(ua: string, standalone = isStandalone()): boolean {
  const m = /(?:iPhone|iPad|iPod).* OS (\d+)_(\d+)/.exec(ua)
  if (!m || !standalone) return false
  const [major, minor] = [Number(m[1]), Number(m[2])]
  return major < 18 || (major === 18 && minor < 4)
}
const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
