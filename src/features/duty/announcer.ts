/**
 * The coordinator's announcement queue (ANN-1, ANN-2): one announcement at a time, most urgent first,
 * a chime then speech, repeated every 2 minutes until acknowledged. Muting holds the queue; nothing is dropped.
 * The first time something is said it starts "New announcement." ("Urgent." when it needs acting on now); each repeat starts "Reminder.",
 * so the gate can tell a new request from one it has already heard.
 * Output is injected so the queue can be tested without a speaker.
 */

export type ChimeKind = 'normal' | 'flagged'

/** Higher plays first. */
export const PRIORITY = {
  flagged: 50,
  runningLate: 40,
  newRequest: 30,
  getReady: 20,
  arriving: 10,
  info: 0,
} as const

export interface Announcement {
  /** Stable id, e.g. "trip:123:new". Announcing the same id again replaces it. */
  id: string
  text: string
  chime: ChimeKind
  priority: number
  /** Said with "Urgent." first and shown in red: outside the usual time, or someone arriving within minutes. */
  urgent?: boolean
}

export interface AnnouncerOutput {
  chime(kind: ChimeKind): Promise<void>
  speak(text: string): Promise<void>
  /** Cut the current speech short (someone has already handled it, or Mute). */
  stop?(): void
  /** Get the words ready ahead of time (the natural voice takes a moment to make them). */
  prepare?(text: string): void
}

export interface AnnouncerState {
  speaking: Announcement | null
  waiting: number
  mutedUntil: number | null
}

export const REPEAT_MS = 120_000

interface Item extends Announcement {
  seq: number
  dueAt: number
  /** Said in full at least once (a sentence cut off by Mute doesn't count). */
  heard: boolean
}

export const NEW_LEAD = 'New announcement. '
export const URGENT_LEAD = 'Urgent. '
export const REPEAT_LEAD = 'Reminder. '
/** The words actually spoken for an item: urgent ones say so first, so the gate knows to act now. */
const spokenFor = (item: Pick<Item, 'text' | 'heard' | 'urgent'>) => (item.heard ? REPEAT_LEAD : item.urgent ? URGENT_LEAD : NEW_LEAD) + item.text

export function createAnnouncer(output: AnnouncerOutput, repeatMs = REPEAT_MS) {
  const items = new Map<string, Item>()
  const listeners = new Set<(s: AnnouncerState) => void>()
  let seq = 0
  let playing: Item | null = null
  let mutedUntil = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const state = (): AnnouncerState => ({
    speaking: playing,
    waiting: items.size - (playing && items.has(playing.id) ? 1 : 0),
    mutedUntil: mutedUntil > Date.now() ? mutedUntil : null,
  })
  const emit = () => listeners.forEach((fn) => fn(state()))

  const wakeAt = (at: number) => {
    clearTimeout(timer)
    timer = setTimeout(pump, Math.max(0, at - Date.now()))
  }

  async function pump(): Promise<void> {
    if (playing) return emit()
    clearTimeout(timer)
    const now = Date.now()
    if (now < mutedUntil) {
      wakeAt(mutedUntil)
      return emit()
    }
    let next: Item | undefined
    let soonest = Infinity
    for (const item of items.values()) {
      if (item.dueAt > now) soonest = Math.min(soonest, item.dueAt)
      else if (!next || item.priority > next.priority || (item.priority === next.priority && item.seq < next.seq)) next = item
    }
    if (!next) {
      if (soonest < Infinity) wakeAt(soonest)
      return emit()
    }

    playing = next
    emit()
    try {
      await output.chime(next.chime)
      // Muted during the chime: say nothing now; it plays when the mute ends.
      if (items.get(next.id) === next && Date.now() >= mutedUntil) {
        await output.speak(spokenFor(next))
        // Heard unless Mute or an acknowledgement cut it short.
        if (items.get(next.id) === next && Date.now() >= mutedUntil) {
          next.heard = true
          output.prepare?.(spokenFor(next))
        }
      }
    } catch {
      // A failed chime or voice must never stall the gate; the item repeats as usual.
    } finally {
      // Cut off by Mute: it wasn't heard, so it plays as soon as the mute ends rather than in 2 minutes.
      if (items.get(next.id) === next) next.dueAt = Date.now() < mutedUntil ? mutedUntil : Date.now() + repeatMs
      playing = null
      void pump()
    }
  }

  return {
    announce(a: Announcement) {
      const existing = items.get(a.id)
      // Announcing again (the trip changed) makes it new again: it's news the gate hasn't heard.
      const item = { ...a, seq: existing?.seq ?? seq++, dueAt: Date.now(), heard: false }
      items.set(a.id, item)
      output.prepare?.(spokenFor(item))
      void pump()
    },
    /** Someone acknowledged it (on any iPad): stop repeating. */
    acknowledge(id: string) {
      items.delete(id)
      // If it's being said right now, stop: the gate has already dealt with it.
      if (playing?.id === id) output.stop?.()
      emit()
    },
    /** Silence now and hold announcements for `ms`. Whatever was cut off plays first when the mute ends. */
    mute(ms: number) {
      mutedUntil = Date.now() + ms
      if (playing) output.stop?.()
      void pump()
    },
    unmute() {
      mutedUntil = 0
      void pump()
    },
    clear() {
      items.clear()
      mutedUntil = 0
      clearTimeout(timer)
      emit()
    },
    subscribe(fn: (s: AnnouncerState) => void) {
      listeners.add(fn)
      fn(state())
      return () => void listeners.delete(fn)
    },
  }
}

export type Announcer = ReturnType<typeof createAnnouncer>
