import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnnouncer, NEW_LEAD, PRIORITY, REPEAT_LEAD, type Announcement } from './announcer'

function fakeOutput() {
  const played: string[] = []
  return {
    played,
    chime: vi.fn(async (kind: string) => void played.push(`chime:${kind}`)),
    // Speech takes 3 s, like a real sentence.
    speak: vi.fn((text: string) => new Promise<void>((r) => setTimeout(() => (played.push(text), r()), 3000))),
  }
}

const a = (id: string, priority: number, chime: 'normal' | 'flagged' = 'normal'): Announcement => ({ id, text: id, chime, priority })

describe('announcer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('plays one at a time, most urgent first, then in arrival order', async () => {
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    ann.announce(a('arriving', PRIORITY.arriving))
    ann.announce(a('new-1', PRIORITY.newRequest))
    ann.announce(a('flag', PRIORITY.flagged, 'flagged'))
    ann.announce(a('new-2', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(20_000)
    // The first one had already started when the others arrived; after that, priority decides.
    expect(out.played.filter((p) => !p.startsWith('chime'))).toEqual(['arriving', 'flag', 'new-1', 'new-2'].map((t) => NEW_LEAD + t))
    expect(out.played).toContain('chime:flagged')
  })

  it('repeats every 2 minutes until acknowledged', async () => {
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    ann.announce(a('new-1', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(3_000)
    expect(out.speak).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(119_000)
    expect(out.speak).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(out.speak).toHaveBeenCalledTimes(2)
    ann.acknowledge('new-1')
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(out.speak).toHaveBeenCalledTimes(2)
  })

  it('holds announcements while muted and plays them afterwards', async () => {
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    ann.mute(5 * 60_000)
    ann.announce(a('new-1', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(out.speak).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000 + 3_000)
    expect(out.speak).toHaveBeenCalledTimes(1)
  })

  it('keeps going when the speaker fails', async () => {
    const out = fakeOutput()
    out.chime.mockRejectedValueOnce(new Error('audio blocked'))
    const ann = createAnnouncer(out)
    ann.announce(a('one', PRIORITY.newRequest))
    ann.announce(a('two', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(out.speak).toHaveBeenCalledWith(NEW_LEAD + 'two', undefined)
  })

  it("passes the child to the voice (for their approved pronunciation) and readies the audio before the chime ends", async () => {
    const out = { ...fakeOutput(), prepare: vi.fn() }
    const ann = createAnnouncer(out)
    ann.announce({ ...a('Pickup for Aarav.', PRIORITY.newRequest), childId: 'child-1' })
    expect(out.prepare).toHaveBeenCalledWith(NEW_LEAD + 'Pickup for Aarav.', 'child-1')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(out.speak).toHaveBeenCalledWith(NEW_LEAD + 'Pickup for Aarav.', 'child-1')
  })

  it('reports what is speaking and how many are waiting', async () => {
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    const states: Array<{ speaking: string | null; waiting: number }> = []
    ann.subscribe((s) => states.push({ speaking: s.speaking?.id ?? null, waiting: s.waiting }))
    ann.announce(a('one', PRIORITY.newRequest))
    ann.announce(a('two', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(1)
    expect(states.at(-1)).toEqual({ speaking: 'one', waiting: 1 })
  })
})

describe('acknowledging what is being said', () => {
  it('stops the speech at once', async () => {
    let stopped = 0
    let finish: () => void = () => {}
    const out = { chime: async () => {}, speak: () => new Promise<void>((r) => { finish = r }), stop: () => { stopped++; finish() } }
    const a = createAnnouncer(out)
    a.announce({ id: 'trip:1', text: 'Kabir is coming', chime: 'normal', priority: 1 })
    await new Promise((r) => setTimeout(r, 0))
    a.acknowledge('trip:1')
    expect(stopped).toBe(1)
  })

  it('Mute stops the voice at once and replays what was cut off when the mute ends', async () => {
    vi.useFakeTimers()
    const said: string[] = []
    let cut: (() => void) | null = null
    const ann = createAnnouncer({
      chime: async () => {},
      speak: (text: string) => new Promise<void>((r) => {
        const t = setTimeout(() => (said.push(text), r()), 3000)
        cut = () => { clearTimeout(t); r() }
      }),
      stop: () => cut?.(),
    })
    ann.announce(a('new-1', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(1_000)
    ann.mute(300_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(said).toEqual([])
    let muted: number | null = null
    ann.subscribe((st) => { muted = st.mutedUntil })
    expect(muted).not.toBeNull()
    await vi.advanceTimersByTimeAsync(300_000)
    // Cut off by Mute, so it wasn't heard: it's still new when it replays.
    expect(said).toEqual([NEW_LEAD + 'new-1'])
    vi.useRealTimers()
  })

  it('says "New announcement" the first time, "Reminder" on repeats, and new again when the request changes', async () => {
    vi.useFakeTimers()
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    ann.announce(a('trip-1', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(3_000)
    await vi.advanceTimersByTimeAsync(121_000)
    ann.announce({ ...a('trip-1', PRIORITY.runningLate), text: 'running late' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(out.played.filter((p) => !p.startsWith('chime'))).toEqual([NEW_LEAD + 'trip-1', REPEAT_LEAD + 'trip-1', NEW_LEAD + 'running late'])

    vi.useRealTimers()
  })
})
