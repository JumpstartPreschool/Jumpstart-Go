import { useCallback, useEffect, useState } from 'react'
import { createAnnouncer, type AnnouncerState } from './announcer'
import { SOUND_CHECK } from '../../../supabase/functions/_shared/announce.ts'
import { chime, deviceOutput, prepare, SOUND_CHECK_BUDGET_MS, soundSupported, speak, stopSound, unlockSound } from './sound'
import { createWakeLock } from './wakeLock'
import { now } from '../../lib/clock'

export type DutyPhase = 'idle' | 'check' | 'on'

export const MUTE_MS = 5 * 60_000
const SINCE_KEY = 'jumpstart.dutySince'

// Remembers when duty started so a reloaded app offers "Resume duty". Storage can be unavailable; duty still works.
function readSince(): number | null {
  try {
    const v = Number(localStorage.getItem(SINCE_KEY))
    return Number.isFinite(v) && v > 0 && new Date(v).toDateString() === new Date(now()).toDateString() ? v : null
  } catch {
    return null
  }
}
function writeSince(v: number | null) {
  try {
    if (v === null) localStorage.removeItem(SINCE_KEY)
    else localStorage.setItem(SINCE_KEY, String(v))
  } catch {
    /* private mode or blocked storage */
  }
}

export function useDuty() {
  const [phase, setPhase] = useState<DutyPhase>('idle')
  const [since, setSince] = useState<number | null>(readSince)
  const [screenHeld, setScreenHeld] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testsPlayed, setTestsPlayed] = useState(0)
  const [announcer] = useState(() => createAnnouncer(deviceOutput))
  const [wake] = useState(() => createWakeLock(setScreenHeld))
  const [ann, setAnn] = useState<AnnouncerState>({ speaking: null, waiting: 0, mutedUntil: null })

  useEffect(() => announcer.subscribe(setAnn), [announcer])
  // Leaving the duty screen any way at all (End duty, signing out, another page) silences this device at once.
  useEffect(
    () => () => {
      void wake.stop()
      announcer.clear()
      stopSound()
    },
    [wake, announcer],
  )

  const playTest = useCallback(async () => {
    setTesting(true)
    setTestsPlayed((n) => n + 1)
    try {
      // Fetch the school voice's clip while the chime plays, and give it time: this is a test, not the busy gate.
      prepare(SOUND_CHECK)
      await chime('normal')
      await speak(SOUND_CHECK, undefined, SOUND_CHECK_BUDGET_MS)
    } finally {
      setTesting(false)
    }
  }, [])

  /** Must be called directly from the Start duty tap: iPadOS only unlocks sound inside a user gesture. */
  const start = useCallback(() => {
    unlockSound()
    void wake.start()
    setTestsPlayed(0)
    setPhase('check')
    void playTest()
  }, [wake, playTest])

  const confirmHeard = useCallback(() => {
    const t = since ?? now()
    setSince(t)
    writeSince(t)
    setPhase('on')
  }, [since])

  const back = useCallback(() => {
    void wake.stop()
    announcer.clear()
    stopSound()
    setPhase('idle')
  }, [wake, announcer])

  const end = useCallback(() => {
    void wake.stop()
    announcer.clear()
    stopSound()
    setSince(null)
    writeSince(null)
    setPhase('idle')
  }, [wake, announcer])

  return {
    phase,
    since,
    resumable: phase === 'idle' && since !== null,
    soundSupported,
    wakeSupported: wake.supported,
    screenHeld,
    testing,
    testsPlayed,
    ann,
    announcer,
    start,
    confirmHeard,
    back,
    end,
    playTest,
    retryWake: wake.retry,
    mute: () => announcer.mute(MUTE_MS),
    unmute: () => announcer.unmute(),
  }
}

export type Duty = ReturnType<typeof useDuty>
