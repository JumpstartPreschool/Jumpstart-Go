import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnnouncer, type Announcement } from './announcer'

// The default openings (gateAnnounce.ts), as the announcer puts them before each message.
const NEW_LEAD = 'New announcement. '
const REPEAT_LEAD = 'This is a reminder. '
const PRIORITY = { flagged: 50, runningLate: 40, newRequest: 30, arriving: 10 }

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
    // Announced together: all queued before the first plays, so priority decides from the start.
    expect(out.played.filter((p) => !p.startsWith('chime'))).toEqual(['flag', 'new-1', 'new-2', 'arriving'].map((t) => NEW_LEAD + t))
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
    // Asked for before the chime starts, so the clips are ready when it ends.
    expect(out.prepare.mock.invocationCallOrder[0]).toBeLessThan(out.chime.mock.invocationCallOrder[0]!)
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

describe('reminders and settings (0042)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('makes the words when they are spoken, so a reminder says the time left now', async () => {
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    let left = 'fifteen'
    ann.announce({ id: 'trip:1', text: () => `Aarav's mother will arrive for pickup in about ${left} minutes.`, chime: 'normal', priority: 20 })
    await vi.advanceTimersByTimeAsync(3_000)
    left = 'ten'
    // The reminder starts 2 minutes after the first ended, and takes 3 s to say.
    await vi.advanceTimersByTimeAsync(124_000)
    expect(out.played.filter((p) => !p.startsWith('chime'))).toEqual([
      "New announcement. Aarav's mother will arrive for pickup in about fifteen minutes.",
      "This is a reminder. Aarav's mother will arrive for pickup in about ten minutes.",
    ])
  })

  it("uses the admin's openings and reminder interval from the next announcement", async () => {
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    ann.configure({ openings: { new: 'Attention please.', urgent: 'Urgent.', reminder: 'Once more.' }, repeatMs: 60_000 })
    ann.announce({ id: 'a', text: 'Kabir pickup.', chime: 'normal', priority: 20 })
    ann.announce({ id: 'b', text: 'Ira pickup.', chime: 'flagged', priority: 40, urgent: true })
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.advanceTimersByTimeAsync(60_000)
    const said = out.played.filter((p) => !p.startsWith('chime'))
    // Announced together, so the urgent one plays first.
    expect(said.slice(0, 2)).toEqual(['Urgent. Ira pickup.', 'Attention please. Kabir pickup.'])
    expect(said).toContain('Once more. Kabir pickup.')
  })

  it('plays every new announcement before any reminder, and the earlier arrival first within a priority', async () => {
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    ann.announce({ id: 'old', text: 'old', chime: 'normal', priority: 40 })
    await vi.advanceTimersByTimeAsync(3_000)
    // Something is playing when old's reminder falls due and two new, lower-priority announcements arrive.
    await vi.advanceTimersByTimeAsync(119_000)
    ann.announce({ id: 'filler', text: 'filler', chime: 'normal', priority: 10 })
    await vi.advanceTimersByTimeAsync(1_500)
    ann.announce({ id: 'late', text: 'later arrival', chime: 'normal', priority: 20, order: 2000 })
    ann.announce({ id: 'soon', text: 'sooner arrival', chime: 'normal', priority: 20, order: 1000 })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(out.played.filter((p) => !p.startsWith('chime'))).toEqual(['New announcement. old', 'New announcement. filler', 'New announcement. sooner arrival', 'New announcement. later arrival', 'This is a reminder. old'])
  })

  it('says a "once" announcement (a cancellation) one time, even if a mute holds it first', async () => {
    const out = fakeOutput()
    const ann = createAnnouncer(out)
    ann.mute(60_000)
    ann.announce({ id: 'trip:1:cancel', text: 'Pickup for Kabir is cancelled.', chime: 'normal', priority: 0, once: true })
    await vi.advanceTimersByTimeAsync(60_000 + 10 * 60_000)
    expect(out.played.filter((p) => !p.startsWith('chime'))).toEqual(['New announcement. Pickup for Kabir is cancelled.'])
  })

  it('lets the old words finish when a trip is replaced while being said, then says the new ones next', async () => {
    let finish: () => void = () => {}
    const said: string[] = []
    const out = { chime: async () => {}, speak: (t: string) => new Promise<void>((r) => { said.push(t); finish = r }), stop: vi.fn(() => finish()) }
    const ann = createAnnouncer(out)
    ann.announce({ id: 'trip:1', text: 'in about five minutes', chime: 'normal', priority: 20 })
    await vi.advanceTimersByTimeAsync(10)
    ann.announce({ id: 'trip:1', text: 'in about twenty minutes', chime: 'normal', priority: 20 })
    await vi.advanceTimersByTimeAsync(10)
    // Never cut midway: nothing stops the sentence being said, and the new one waits for it.
    expect(out.stop).not.toHaveBeenCalled()
    expect(said).toEqual(['New announcement. in about five minutes'])
    finish()
    await vi.advanceTimersByTimeAsync(10)
    expect(said).toEqual(['New announcement. in about five minutes', 'New announcement. in about twenty minutes'])
  })

  it('does not count a silent announcement as heard: it retries soon, still as new', async () => {
    const played: string[] = []
    const out = { played, chime: vi.fn(async () => {}), speak: null as unknown as (text: string) => Promise<unknown> }
    let silent = true
    out.speak = vi.fn((text: string) => new Promise<'silent' | 'school'>((r) => setTimeout(() => (out.played.push(text), r(silent ? 'silent' : 'school')), 1000)))
    const ann = createAnnouncer(out)
    ann.announce(a('new-1', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(1_000)
    silent = false
    await vi.advanceTimersByTimeAsync(20_000)
    expect(played).toEqual([NEW_LEAD + 'new-1', NEW_LEAD + 'new-1'])
  })

  it('does not count an announcement cut off mid-sentence as heard: it plays again soon as new, not as a reminder', async () => {
    const played: string[] = []
    let cut = true
    const out = { chime: vi.fn(async () => {}), speak: vi.fn((text: string) => new Promise<'cut' | 'school'>((r) => setTimeout(() => (played.push(text), r(cut ? 'cut' : 'school')), 1000))) }
    const ann = createAnnouncer(out)
    ann.announce(a('new-1', PRIORITY.newRequest))
    await vi.advanceTimersByTimeAsync(1_000)
    cut = false
    await vi.advanceTimersByTimeAsync(20_000)
    expect(played).toEqual([NEW_LEAD + 'new-1', NEW_LEAD + 'new-1'])
  })
})
