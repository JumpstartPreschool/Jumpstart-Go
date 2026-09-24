/**
 * The coordinator's announcement queue (ANN-1, ANN-2): one announcement at a time, most urgent first,
 * a chime then speech, repeated every 2 minutes until acknowledged. Muting holds the queue; nothing is dropped.
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
}

export interface AnnouncerOutput {
  chime(kind: ChimeKind): Promise<void>
  speak(text: string): Promise<void>
  /** Cut the current speech short (someone has already handled it). */
  stop?(): void
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
}

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
      if (items.get(next.id) === next) await output.speak(next.text)
    } catch {
      // A failed chime or voice must never stall the gate; the item repeats as usual.
    } finally {
      if (items.get(next.id) === next) next.dueAt = Date.now() + repeatMs
      playing = null
      void pump()
    }
  }

  return {
    announce(a: Announcement) {
      const existing = items.get(a.id)
      items.set(a.id, { ...a, seq: existing?.seq ?? seq++, dueAt: Date.now() })
      void pump()
    },
    /** Someone acknowledged it (on any iPad): stop repeating. */
    acknowledge(id: string) {
      items.delete(id)
      // If it's being said right now, stop: the gate has already dealt with it.
      if (playing?.id === id) output.stop?.()
      emit()
    },
    /** Hold announcements for `ms` (recorded by the caller). They play when the mute ends. */
    mute(ms: number) {
      mutedUntil = Date.now() + ms
      if (!playing) void pump()
      else emit()
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
