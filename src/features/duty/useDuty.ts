import { useCallback, useEffect, useRef, useState } from 'react'
import { createAnnouncer, type AnnouncerState } from './announcer'
import { SOUND_CHECK } from '../../../supabase/functions/_shared/gateAnnounce.ts'
import { chime, deviceOutput, prepare, releaseSound, SOUND_CHECK_BUDGET_MS, soundReady, soundSupported, speak, stopSound, unlockSound, type Spoken } from './sound'
import { createWakeLock } from './wakeLock'
import { supabase } from '../../lib/supabase'
import { pushTurnedOff } from '../notifications/push'
import { nativeAlive, nativeDutyStart, nativeDutyStop, requestNativeNotifications } from '../../native/duty'
import { useOnline } from '../../ui/hooks'
import { connectivityOf, isDutyConflict, parseDuty, readCachedDuty, writeCachedDuty, type DutyState } from './dutyState'

/**
 * loading: the duty isn't known yet; idle: off duty (Start duty); check: the sound check before starting; on: Active;
 * paused: paused by the person. Only a tap moves between them; the app being hidden, locked, reloaded or offline never.
 */
export type DutyPhase = 'loading' | 'idle' | 'check' | 'on' | 'paused'
/** What the sound check actually played, through the same path as real announcements. */
export interface SoundResult { chime: boolean; voice: Spoken }

export const MUTE_MS = 5 * 60_000
// Paused holds the queue until Resume: nothing is dropped, nothing plays.
const PAUSE_HOLD_MS = 365 * 24 * 60 * 60_000
const REFRESH_MS = 30_000

const TRIP_ID = /^trip:([0-9a-f-]{36})$/i
/** Tells the school a request was spoken on this device (0059), so the delivery report can tell heard from only sent. */
export function reportHeard(id: string): void {
  const trip = TRIP_ID.exec(id)?.[1]
  if (trip) void supabase.rpc('gate_heard', { p_trip: trip }).then(() => undefined, () => undefined)
}

export function useDuty() {
  // undefined until known; null when off duty. Always the server's answer (or its last answer, cached for this person).
  const [duty, setDutyState] = useState<DutyState | null | undefined>(undefined)
  // When the server last confirmed it in this session; null while showing the cached answer from an earlier session.
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null)
  const [lastFailAt, setLastFailAt] = useState<number | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [changing, setChanging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screenHeld, setScreenHeld] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testsPlayed, setTestsPlayed] = useState(0)
  const [result, setResult] = useState<SoundResult | null>(null)
  // The sound can't play without a tap: iOS paused it (a call, Siri, the screen locked), or the page was reloaded.
  // That is about sound only: duty stays as it is.
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [announcer] = useState(() => createAnnouncer({ ...deviceOutput, heard: reportHeard }))
  const [wake] = useState(() => createWakeLock(setScreenHeld))
  const [ann, setAnn] = useState<AnnouncerState>({ speaking: null, waiting: 0, mutedUntil: null })
  const online = useOnline()
  // Bumped by every tap's change: a read that started before it may predate it and is dropped.
  const changes = useRef(0)
  // Gone (signed out, left the page): a read still on its way must not write the cache back.
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])

  const accept = useCallback((d: DutyState | null, who: string | null) => {
    setDutyState(d)
    setConfirmedAt(Date.now())
    if (who) writeCachedDuty(who, d, Date.now())
  }, [])

  /** Reads the duty from the server. Never changes it: a failed read keeps what is shown and only marks the connection. */
  const refresh = useCallback(async (who: string | null = uid) => {
    const seen = changes.current
    const { data, error: e } = await supabase.rpc('my_duty')
    if (seen !== changes.current || !live.current) return
    if (e) { setLastFailAt(Date.now()); return }
    accept(parseDuty(data), who)
  }, [uid, accept])

  // The duty as the school has it, on opening and every time the app comes back; the cached answer meanwhile.
  useEffect(() => {
    let gone = false
    void supabase.auth.getSession().then(({ data }) => {
      if (gone) return
      const who = data.session?.user.id ?? null
      setUid(who)
      const cached = who ? readCachedDuty(who) : undefined
      if (cached) setDutyState((d) => (d === undefined ? cached.duty : d))
      void refresh(who)
    })
    return () => { gone = true }
  // Once per mount; the effect below keeps it current.
  }, [])
  useEffect(() => {
    if (!uid) return
    const again = () => { if (document.visibilityState === 'visible') void refresh() }
    const events: Array<[EventTarget, string]> = [[document, 'visibilitychange'], [window, 'pageshow'], [window, 'online']]
    events.forEach(([t, e]) => t.addEventListener(e, again))
    const every = setInterval(again, REFRESH_MS)
    return () => { events.forEach(([t, e]) => t.removeEventListener(e, again)); clearInterval(every) }
  }, [uid, refresh])

  const status = duty?.status ?? null
  const phase: DutyPhase = checking ? 'check' : duty === undefined ? 'loading' : status === 'active' ? 'on' : status === 'paused' ? 'paused' : 'idle'

  const off = duty === null && !checking
  useEffect(() => announcer.subscribe(setAnn), [announcer])
  // What duty means for this device follows the duty, not the app's lifecycle: Active keeps the screen on, holds the
  // Android duty service and lets the queue speak; Paused holds the queue; off clears it. Only a change of status runs
  // it: a refresh with the same answer must not undo Mute 5 min or restart the duty service.
  useEffect(() => {
    if (status === 'active') {
      announcer.unmute()
      void wake.start()
      if (!pushTurnedOff()) void nativeDutyStart()
    } else if (status === 'paused') {
      announcer.mute(PAUSE_HOLD_MS)
      void nativeDutyStop()
      void wake.stop()
    } else if (off) {
      void nativeDutyStop()
      void wake.stop()
      announcer.clear()
    }
  }, [status, off, announcer, wake])
  // Leaving the duty screen (another page, signing out) silences this device. Duty itself stays as it is on the server.
  useEffect(
    () => () => {
      void nativeDutyStop()
      void wake.stop()
      announcer.clear()
      stopSound()
      releaseSound()
    },
    [wake, announcer],
  )

  // Active, coming back to the app (unlock, app switch, restored from memory, back online) checks the sound can still
  // play; if it can't, the screen asks for one tap to turn sound on. Also checked every 15 s, since iOS can pause it.
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

  /**
   * The only way duty changes: an explicit tap, sent with the version this device last saw. Refused when another device
   * changed it since; then the newest is read and shown, and nothing is overwritten. Resolves true when it changed.
   */
  const change = useCallback(async (next: 'active' | 'paused' | 'off', reason?: string): Promise<boolean> => {
    setChanging(true)
    setError(null)
    changes.current++
    try {
      const { data, error: e } = await supabase.rpc('set_duty', { p_status: next, p_version: duty?.version ?? null, p_reason: reason ?? null })
      changes.current++
      if (e) {
        if (isDutyConflict(e)) {
          await refresh()
          setError('Your duty was changed on another device. This is the latest.')
        } else {
          setLastFailAt(Date.now())
          setError(online ? "Couldn't reach the school. Your duty hasn't changed. Try again." : "You're offline. Your duty hasn't changed. Try again once you're connected.")
        }
        return false
      }
      accept(parseDuty(data), uid)
      return true
    } finally {
      setChanging(false)
    }
  }, [duty, refresh, accept, uid, online])

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
    setError(null)
    setChecking(true)
    void playTest()
  }, [wake, playTest])

  /** "Yes, I heard it": duty starts on the server. Without a connection it doesn't start, and the screen says so. */
  const confirmHeard = useCallback(async () => {
    if (await change('active')) setChecking(false)
  }, [change])

  const back = useCallback(() => {
    void nativeDutyStop()
    void wake.stop()
    stopSound()
    releaseSound()
    setChecking(false)
  }, [wake])

  const end = useCallback(async () => {
    if (!(await change('off'))) return
    stopSound()
    releaseSound()
  }, [change])

  return {
    phase,
    duty: duty ?? null,
    since: duty ? Date.parse(duty.started_at) : null,
    /** Shown from the last session's answer: the school hasn't confirmed it yet on this opening. */
    unconfirmed: duty !== undefined && confirmedAt === null,
    /** The duty couldn't be read at all (first opening on this device with no connection). */
    loadFailed: duty === undefined && lastFailAt !== null,
    retry: () => void refresh(),
    connectivity: connectivityOf({ browserOnline: online, lastOkAt: confirmedAt, lastFailAt, nowMs: Date.now() }),
    changing,
    error,
    clearError: () => setError(null),
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
    /** From the Pause duty tap. */
    pause: (reason?: string) => change('paused', reason),
    /** From the Resume duty tap: also unlocks sound inside the gesture, so the queue can speak at once. */
    resume: () => { unlockSound(); void soundReady().then((ok) => setSoundBlocked(!ok)); return change('active') },
    playTest,
    retryWake: wake.retry,
    result,
    soundBlocked,
    /** From a tap on "turn sound on": unlocks again inside the gesture, then confirms it can play. */
    resumeSound: () => { unlockSound(); void soundReady().then((ok) => setSoundBlocked(!ok)) },
    mute: () => announcer.mute(MUTE_MS),
    unmute: () => announcer.unmute(),
  }
}

export type Duty = ReturnType<typeof useDuty>
