import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useToast } from '../ui/Toast'

const CHECK_EVERY_MS = 15 * 60_000
// Just opened: nothing typed yet, so the new version can load straight away.
const FRESH_MS = 8_000
// Set by Start duty (useDuty): a gate tablet on duty is never reloaded by itself.
const onDuty = () => { try { return !!localStorage.getItem('jumpstart.dutySince') } catch { return false } }

/**
 * Keeps the installed app (home-screen shortcut) up to date by itself. It looks for a new version when it opens,
 * whenever it comes back to the screen, and every 15 minutes. A new version loads at once if the app has only just
 * opened, or quietly the moment it goes to the background, so nobody loses what they were typing. A gate tablet on
 * duty keeps its announcements running and shows an Update button instead.
 */
export function UpdatePrompt() {
  const toast = useToast()
  const openedAt = useRef(Date.now())
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => { if (navigator.onLine) void registration.update().catch(() => {}) }
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    if (onDuty()) {
      toast('A new version of Jumpstart Go is ready.', { tone: 'info', action: { label: 'Update', run: () => void updateServiceWorker(true) } })
      return
    }
    if (Date.now() - openedAt.current < FRESH_MS || document.visibilityState === 'hidden') {
      void updateServiceWorker(true)
      return
    }
    const whenHidden = () => { if (document.visibilityState === 'hidden') void updateServiceWorker(true) }
    document.addEventListener('visibilitychange', whenHidden)
    return () => document.removeEventListener('visibilitychange', whenHidden)
  }, [needRefresh, toast, updateServiceWorker])

  return null
}
