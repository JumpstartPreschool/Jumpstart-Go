/**
 * The school's recordings for an alert a phone announces in the background (push-send). The words are the duty screen's
 * (gateTrip.ts) at the moment of sending, so the recording is the very clip the pronounce function made ahead for that
 * child, in the same voice version, and the phone plays the same audio the duty screen would.
 */
import { clipKey, clipPath, voiceParts } from './announce.ts'
import { SOUND_CHECK, type GateSettings } from './gateAnnounce.ts'
import { phoneAnnouncement, type GateTrip, type SpokenChild } from './gateTrip.ts'
import { isGateAlert, type Claimed, type PhoneVoice } from './push.ts'

/** A trip with its child, and how the school says the child's name. */
export interface VoiceTrip extends GateTrip { child: SpokenChild & { spoken: string | null } }

export interface VoiceSources {
  /** The clips' voice version (voice_meta 'voice'); null before the first clips exist. */
  version: string | null
  settings: GateSettings
  trip(id: string): Promise<VoiceTrip | null>
  /** A link to one stored clip that stops working after `seconds`, or null. */
  sign(path: string, seconds: number): Promise<string | null>
}

const TRIP_TAG = /^trip-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
const MAX_LINK_S = 600

/**
 * The phone's recordings for one alert, or null when there is nothing to say in the school's voice: a web device, a
 * parent's alert, a silent-device warning (no recording exists for it) or a trip that has gone. A test alert plays the
 * sound check, so a test proves the background voice end to end. All the recordings or none: an announcement never
 * switches voice halfway because one link couldn't be made; the phone's own voice then reads the title instead.
 */
export async function phoneVoiceFor(r: Pick<Claimed, 'platform' | 'tag' | 'url' | 'title' | 'expires_at'>, src: VoiceSources, nowMs: number): Promise<PhoneVoice | null> {
  if (r.platform === 'web') return null
  let text: string
  let child: VoiceTrip['child'] | null = null
  let rest: Omit<PhoneVoice, 'clips'>
  if (r.tag?.startsWith('test-')) {
    text = SOUND_CHECK
    rest = { chime: 'normal', priority: 0, order: nowMs }
  } else {
    const id = isGateAlert(r) ? TRIP_TAG.exec(r.tag ?? '')?.[1] : undefined
    const trip = id ? await src.trip(id) : null
    if (!trip) return null
    child = trip.child
    // Reminders are the database's own wording (send_gate_reminders); the delivery report reads them the same way.
    const { text: words, ...place } = phoneAnnouncement(trip, trip.child, nowMs, src.settings, r.title.startsWith('Reminder'))
    text = words
    rest = place
  }
  const s = src.settings
  const parts = voiceParts(text, child, [s.opening_new, s.opening_urgent, s.opening_reminder])
  const seconds = Math.max(60, Math.min(MAX_LINK_S, Math.floor((Date.parse(r.expires_at) - nowMs) / 1000) || MAX_LINK_S))
  const version = src.version
  const clips = version
    ? await Promise.all(parts.map(async (p) => {
      const key = await clipKey(version, p)
      const url = await src.sign(clipPath(key), seconds)
      return url ? { key, url } : null
    }))
    : []
  return { ...rest, clips: clips.every(Boolean) ? (clips as PhoneVoice['clips']) : [] }
}
