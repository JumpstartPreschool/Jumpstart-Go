import { useCallback, useEffect, useState } from 'react'
import { createAnnouncer, type AnnouncerState } from './announcer'
import { SOUND_CHECK } from '../../../supabase/functions/_shared/gateAnnounce.ts'
import { chime, deviceOutput, prepare, releaseSound, SOUND_CHECK_BUDGET_MS, soundReady, soundSupported, speak, stopSound, unlockSound, type Spoken } from './sound'
import { createWakeLock } from './wakeLock'
import { now } from '../../lib/clock'
import { supabase } from '../../lib/supabase'
import { pushTurnedOff } from '../notifications/push'
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

const TRIP_ID = /^trip:([0-9a-f-]{36})$/i
/** Tells the school a request was spoken on this device (0059), so the delivery report can tell heard from only sent. */
export function reportHeard(id: string): void {
  const trip = TRIP_ID.exec(id)?.[1]
  if (trip) void supabase.rpc('gate_heard', { p_trip: trip }).then(() => undefined, () => undefined)
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
  const [announcer] = useState(() => createAnnouncer({ ...deviceOutput, heard: reportHeard }))
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
    // Android app: "alive" tells the phone this page is speaking the announcements, so the phone's own voice stays quiet.
    // Said only while this page's sound can really play: a page that is running but silenced leaves them to the phone.
    const run = () => void soundReady().then((ok) => { setSoundBlocked(!ok); if (ok) void nativeAlive() })
    const check = () => { if (document.visibilityState === 'visible') run() }
    check()
    const events: Array<[EventTarget, string]> = [[document, 'visibilitychange'], [window, 'pageshow'], [window, 'focus'], [window, 'online']]
    events.forEach(([t, e]) => t.addEventListener(e, check))
    const every = setInterval(check, 15_000)
    // The duty service pokes the page every 5 s, also with the screen off (page hidden), so the check runs then too.
    const tick = () => run()
    window.addEventListener('jumpstart-native-tick', tick)
    // The phone said a request aloud while this page couldn't (GateVoice): this page doesn't say it again at once.
    const spoke = (e: Event) => {
      const tag = (e as CustomEvent<{ tag?: string }>).detail?.tag ?? ''
      if (tag.startsWith('trip-')) announcer.heardElsewhere(`trip:${tag.slice(5)}`)
    }
    window.addEventListener('jumpstart-native-spoke', spoke)
    const alive = setInterval(run, 10_000)
    return () => {
      events.forEach(([t, e]) => t.removeEventListener(e, check)); clearInterval(every); clearInterval(alive)
      window.removeEventListener('jumpstart-native-tick', tick); window.removeEventListener('jumpstart-native-spoke', spoke)
    }
  }, [phase, announcer])

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
    // Android app: the duty service keeps the announcements speaking with the screen off, unless that was switched off.
    if (!pushTurnedOff()) {
      void nativeDutyStart()
      void requestNativeNotifications()
    }
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
