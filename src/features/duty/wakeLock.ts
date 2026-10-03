/**
 * Keeps the iPad screen on while on duty (system-architecture A2).
 * The system drops the lock whenever the app is hidden or the iPad locks, so it is requested again
 * every time the app comes back to the foreground. `onChange` reports whether the screen is being held on.
 */
export function createWakeLock(onChange: (held: boolean) => void) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
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
