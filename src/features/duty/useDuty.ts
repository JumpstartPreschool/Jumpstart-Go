import { useCallback, useEffect, useState } from 'react'
import { createAnnouncer, type AnnouncerState } from './announcer'
import { SOUND_CHECK } from '../../../supabase/functions/_shared/gateAnnounce.ts'
import { chime, deviceOutput, prepare, releaseSound, SOUND_CHECK_BUDGET_MS, soundReady, soundSupported, speak, stopSound, unlockSound, type Spoken } from './sound'
import { createWakeLock } from './wakeLock'
import { now } from '../../lib/clock'
import { nativeAlive, nativeDutyStart, nativeDutyStop, requestNativeNotifications } from '../../native/duty'

export type DutyPhase = 'idle' | 'check' | 'on'
/** What the sound check actually played, through the same path as real announcements. */
export interface SoundResult { chime: boolean; voice: Spoken }

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
  const [result, setResult] = useState<SoundResult | null>(null)
  // iOS paused the audio (a call, Siri, the screen locked) and won't give it back without a tap.
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [announcer] = useState(() => createAnnouncer(deviceOutput))
  const [wake] = useState(() => createWakeLock(setScreenHeld))
  const [ann, setAnn] = useState<AnnouncerState>({ speaking: null, waiting: 0, mutedUntil: null })

  useEffect(() => announcer.subscribe(setAnn), [announcer])
  // Leaving the duty screen any way at all (End duty, signing out, another page) silences this device at once.
  useEffect(
    () => {
      // A reloaded page starts idle; a duty service left over from before the reload has nothing to announce.
      void nativeDutyStop()
      return () => {
        void nativeDutyStop()
        void wake.stop()
        announcer.clear()
        stopSound()
        releaseSound()
      }
    },
    [wake, announcer],
  )

  // On duty, coming back to the app (unlock, app switch, restored from memory, back online) checks the sound can still
  // play; if iOS won't resume it, the screen asks for one tap. Also checked every 15 s, since iOS can pause it silently.
  useEffect(() => {
    if (phase !== 'on') return
    const run = () => void soundReady().then((ok) => setSoundBlocked(!ok))
    const check = () => { if (document.visibilityState === 'visible') run() }
    check()
    const events: Array<[EventTarget, string]> = [[document, 'visibilitychange'], [window, 'pageshow'], [window, 'focus'], [window, 'online']]
    events.forEach(([t, e]) => t.addEventListener(e, check))
    const every = setInterval(check, 15_000)
    // Android app: the duty service pokes the page every 5 s, also with the screen off (page hidden), so the check runs then too.
    const tick = () => { run(); void nativeAlive() }
    window.addEventListener('jumpstart-native-tick', tick)
    const alive = setInterval(() => void nativeAlive(), 10_000)
    void nativeAlive()
    return () => { events.forEach(([t, e]) => t.removeEventListener(e, check)); clearInterval(every); window.removeEventListener('jumpstart-native-tick', tick); clearInterval(alive) }
  }, [phase])

  const playTest = useCallback(async () => {
    setTesting(true)
    setTestsPlayed((n) => n + 1)
    try {
      // Fetch the school voice's clip while the chime plays, and give it time: this is a test, not the busy gate.
      prepare(SOUND_CHECK)
      setResult(null)
      const chimed = await chime('normal')
      const voice = await speak(SOUND_CHECK, undefined, SOUND_CHECK_BUDGET_MS)
      setResult({ chime: chimed, voice })
    } finally {
      setTesting(false)
    }
  }, [])

  /** Must be called directly from the Start duty tap: iPadOS only unlocks sound inside a user gesture. */
  const start = useCallback(() => {
    unlockSound()
    void wake.start()
    void nativeDutyStart()
    void requestNativeNotifications()
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
    void nativeDutyStop()
    void wake.stop()
    announcer.clear()
    stopSound()
    releaseSound()
    setPhase('idle')
  }, [wake, announcer])

  const end = useCallback(() => {
    void nativeDutyStop()
    void wake.stop()
    announcer.clear()
    stopSound()
    releaseSound()
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
    result,
    soundBlocked,
    /** From a tap on "turn sound back on": unlocks again inside the gesture, then confirms it can play. */
    resumeSound: () => { unlockSound(); void soundReady().then((ok) => setSoundBlocked(!ok)) },
    mute: () => announcer.mute(MUTE_MS),
    unmute: () => announcer.unmute(),
  }
}

export type Duty = ReturnType<typeof useDuty>
