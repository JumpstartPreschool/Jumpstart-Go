import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useToast } from '../ui/Toast'

const CHECK_EVERY_MS = 60 * 60_000

/**
 * Safe updates for the installed app: a new version waits until the person taps Update, so a coordinator's iPad is
 * never reloaded in the middle of gate duty. Long-running iPads check for a new version every hour.
 */
export function UpdatePrompt() {
  const toast = useToast()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), CHECK_EVERY_MS)
    },
  })

  useEffect(() => {
    if (needRefresh) toast('A new version of Jumpstart is ready.', { tone: 'info', action: { label: 'Update', run: () => void updateServiceWorker(true) } })
  }, [needRefresh, toast, updateServiceWorker])

  return null
}
