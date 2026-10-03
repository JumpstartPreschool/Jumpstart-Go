import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// A fake speaker: records what starts and stops, so the tests can hear what the gate would hear.
const heard: string[] = []
const clips: FakeSource[] = []
class FakeSource extends EventTarget {
  buffer: { label: string } | null = null
  frequency = { value: 0 }
  type = ''
  connect(next?: unknown) { return next ?? this }
  start() { heard.push(`start:${this.buffer?.label ?? 'note'}`); if (this.buffer) clips.push(this) }
  // stop(when) schedules the end (the chime's notes); stop() ends now.
  stop(when?: number) { if (when !== undefined) return; heard.push(`stop:${this.buffer?.label ?? 'note'}`); this.dispatchEvent(new Event('ended')) }
}
// `paused` stands for iOS pausing Web Audio (iPad locked, another app took the sound) where resume() can't bring it back.
let paused = false
// `comesBack`: iOS gives the audio back when asked (an interruption that has ended), as after the unlock sentence.
let comesBack = false
let liveCtx: FakeAudioContext | null = null
class FakeAudioContext extends EventTarget {
  currentTime = 0
  destination = {}
  constructor() { super(); liveCtx = this }
  get state() { return paused ? 'interrupted' : 'running' }
  resume() { if (comesBack) paused = false; return Promise.resolve() }
  createBufferSource() { return new FakeSource() }
  createOscillator() { return new FakeSource() }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n } }
}
type FakeUtterance = { text: string; volume?: number; onstart?: () => void; onend?: () => void }
// The silent unlock sentence ends at once, as a real voice ends a one-word sentence; it is not something the gate hears.
const unlockEnds = (u: FakeUtterance) => { if (u.volume === 0) { u.onend?.(); return true } return false }
const deviceVoice = { speak: vi.fn((u: FakeUtterance): unknown => unlockEnds(u) || heard.push(`device:${u.text}`)), cancel: vi.fn(), getVoices: () => [{ name: 'Isha', lang: 'en-IN' }] }

// The clips: each test decides when (and whether) a sentence's audio arrives.
const pending = new Map<string, { resolve: (b: { label: string }) => void; reject: (e: Error) => void }>()
vi.mock('./voiceClips', () => ({
  clearRetiredVoiceCaches: async () => {},
  voiceChild: () => null,
  markVoice: () => {},
  loadVoiceVersion: async () => null,
  clipAudio: (_ctx: unknown, line: string) => new Promise((resolve, reject) => pending.set(line, { resolve, reject })),
}))

type Sound = typeof import('./sound')
let sound: Sound

beforeAll(async () => {
  Object.assign(globalThis, {
    window: globalThis,
    AudioContext: FakeAudioContext,
    speechSynthesis: deviceVoice,
    SpeechSynthesisUtterance: class { constructor(public text: string) {} },
  })
  sound = await import('./sound')
  sound.unlockSound()
})
beforeEach(() => {
  vi.useFakeTimers()
  heard.length = 0
  clips.length = 0
  pending.clear()
})
afterEach(() => {
  paused = false
  comesBack = false
  sound.stopSound()
  vi.useRealTimers()
})

const arrive = (line: string) => pending.get(line)!.resolve({ label: line })
/** The playing clip reaches its natural end. */
const finish = () => clips.at(-1)!.dispatchEvent(new Event('ended'))

describe('gate sound', () => {
  it('plays the opening at once, then the rest as one recording that arrived while the opening played', async () => {
    const said = sound.speak('New announcement. Vihaan Kulkarni. Pickup by his father, Rohan, arriving now.')
    arrive('New announcement.')
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual(['start:New announcement.'])
    arrive('Vihaan Kulkarni. Pickup by his father, Rohan, arriving now.')
    finish()
    await vi.advanceTimersByTimeAsync(200)
    expect(heard).toEqual(['start:New announcement.', 'start:Vihaan Kulkarni. Pickup by his father, Rohan, arriving now.'])
    finish()
    await said
    expect(deviceVoice.speak).not.toHaveBeenCalled()
  })

  it("says only the message in the tablet's voice when it isn't ready after the opening", async () => {
    const said = sound.speak('New announcement. Vihaan Kulkarni. Pickup by his father, Rohan, arriving now.')
    arrive('New announcement.')
    await vi.advanceTimersByTimeAsync(0)
    finish()
    await vi.advanceTimersByTimeAsync(150 + sound.CLIP_BUDGET_MS)
    expect(heard).toEqual(['start:New announcement.', 'device:Vihaan Kulkarni. Pickup by his father, Rohan, arriving now.'])
    sound.stopSound()
    await said
  })

  it("uses the tablet's own Indian voice when a clip isn't ready in time, so the gate never waits", async () => {
    const said = sound.speak('Reason: dentist.')
    await vi.advanceTimersByTimeAsync(sound.CLIP_BUDGET_MS)
    expect(heard).toEqual(['device:Reason: dentist.'])
    sound.stopSound()
    await said
  })

  it('gives the sound check time to fetch the school voice, instead of the tablet voice after the usual budget', async () => {
    const said = sound.speak('Sound check.', undefined, sound.SOUND_CHECK_BUDGET_MS)
    await vi.advanceTimersByTimeAsync(3000)
    arrive('Sound check.')
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual(['start:Sound check.'])
    finish()
    await said
    expect(heard.some((h) => h.startsWith('device'))).toBe(false)
  })

  it("uses the tablet's voice at once when the school voice is refused (monthly cap) or the network fails, without waiting the budget", async () => {
    for (const reason of ['pronounce 429', 'Failed to fetch']) {
      heard.length = 0
      const said = sound.speak('Reason: dentist.')
      pending.get('Reason: dentist.')!.reject(new Error(reason))
      await vi.advanceTimersByTimeAsync(0)
      expect(heard).toEqual(['device:Reason: dentist.'])
      sound.stopSound()
      await said
    }
  })

  it("waits long enough for the school's Indian woman's voice that the gate nearly always hears it, but never long", () => {
    expect(sound.CLIP_BUDGET_MS).toBeGreaterThanOrEqual(2000)
    expect(sound.CLIP_BUDGET_MS).toBeLessThanOrEqual(3000)
  })

  it('says nothing after Stop (End duty or Mute), even when a clip arrives later', async () => {
    const said = sound.speak('Pickup for Aarav, Nursery.')
    sound.stopSound()
    arrive('Pickup for Aarav, Nursery.')
    await vi.advanceTimersByTimeAsync(sound.CLIP_BUDGET_MS * 2)
    await said
    expect(heard.filter((h) => h.startsWith('start') || h.startsWith('device'))).toEqual([])
  })

  it('says nothing after Stop while waiting for the budget: no fallback voice either', async () => {
    const said = sound.speak('Pickup for Aarav, Nursery.')
    await vi.advanceTimersByTimeAsync(sound.CLIP_BUDGET_MS / 2)
    sound.stopSound()
    await vi.advanceTimersByTimeAsync(sound.CLIP_BUDGET_MS)
    await said
    expect(deviceVoice.speak).not.toHaveBeenCalled()
  })

  it('cuts a chime and a playing clip at once on Stop', async () => {
    void sound.chime('flagged')
    expect(heard.filter((h) => h === 'start:note')).toHaveLength(3)
    const said = sound.speak('Arriving now.')
    arrive('Arriving now.')
    await vi.advanceTimersByTimeAsync(0)
    heard.length = 0
    sound.stopSound()
    expect(heard).toEqual(expect.arrayContaining(['stop:note', 'stop:Arriving now.']))
    await said
  })

  it("uses the tablet's voice when iOS has paused the audio, instead of a silent chime and clip", async () => {
    paused = true
    const chimed = sound.chime('normal')
    await vi.advanceTimersByTimeAsync(600)
    await chimed
    const said = sound.speak('Arriving now.')
    await vi.advanceTimersByTimeAsync(1000)
    expect(heard).toEqual(['device:Arriving now.'])
    sound.stopSound()
    await said
  })

  it('moves on when a clip never reports its end (audio paused mid-clip), so the gate queue never stops', async () => {
    const said = sound.speak('Arriving now.')
    pending.get('Arriving now.')!.resolve({ label: 'Arriving now.', duration: 1 } as { label: string })
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual(['start:Arriving now.'])
    let done = false
    void said.then(() => { done = true })
    await vi.advanceTimersByTimeAsync(2600)
    expect(done).toBe(true)
  })

  it("won't play a preview that was stopped while it was being made", async () => {
    const onStart = vi.fn()
    const preview = sound.playSentence('Aaradhya Sharma.', onStart)
    sound.stopSound()
    arrive('Aaradhya Sharma.')
    await preview
    expect(onStart).not.toHaveBeenCalled()
    expect(heard).toEqual([])
  })
})

describe('what the sound check can report (it uses the same path as real announcements)', () => {
  const speaksAloud = (on: boolean) => deviceVoice.speak.mockImplementation((u: FakeUtterance) => {
    if (unlockEnds(u)) return true
    heard.push(`device:${u.text}`)
    if (on) { u.onstart?.(); setTimeout(() => u.onend?.(), 10) }
  })
  afterEach(() => speaksAloud(false))

  it('unlocked the device voice with a real (silent) sentence: iOS drops an empty one', () => {
    sound.unlockSound()
    const first = deviceVoice.speak.mock.calls.at(-1)![0] as { text: string; volume?: number }
    expect(first.text.trim().length).toBeGreaterThan(0)
    expect(first.volume).toBe(0)
  })

  it("reports the school's voice when the clips played", async () => {
    const said = sound.speak('Sound check.', undefined, sound.SOUND_CHECK_BUDGET_MS)
    arrive('Sound check.')
    await vi.advanceTimersByTimeAsync(0)
    finish()
    expect(await said).toBe('school')
  })

  it("reports the device voice only when it actually started speaking, and never plays the late clip after it", async () => {
    speaksAloud(true)
    const said = sound.speak('Reason: dentist.')
    await vi.advanceTimersByTimeAsync(sound.CLIP_BUDGET_MS + 20)
    arrive('Reason: dentist.') // the school's clip turns up after the device voice took over
    await vi.advanceTimersByTimeAsync(50)
    expect(await said).toBe('device')
    expect(heard).toEqual(['device:Reason: dentist.'])
  })

  it('reports silence when the device voice never started (blocked), so a silent tablet is never called working', async () => {
    const said = sound.speak('Reason: dentist.')
    await vi.advanceTimersByTimeAsync(sound.CLIP_BUDGET_MS + 10_000)
    expect(await said).toBe('silent')
  })

  it("reports a chime that couldn't sound because iOS paused the audio", async () => {
    paused = true
    const chimed = sound.chime('normal')
    await vi.advanceTimersByTimeAsync(600)
    expect(await chimed).toBe(false)
    paused = false
    const again = sound.chime('normal')
    await vi.advanceTimersByTimeAsync(1500)
    expect(await again).toBe(true)
  })
})

describe("the tablet's own voice", () => {
  const v = (name: string, lang = 'en-IN') => ({ name, lang })
  it("picks only an Indian English woman's voice: a clear one first, Tara (which garbles announcements) last, never a man's", async () => {
    const { pickIndianVoice } = await import('./sound')
    expect(pickIndianVoice([v('Rishi'), v('Aman'), v('Isha')])?.name).toBe('Isha')
    expect(pickIndianVoice([v('Isha'), v('Isha (Enhanced)')])?.name).toBe('Isha (Enhanced)')
    expect(pickIndianVoice([v('Rishi'), v('Microsoft Neerja Online (Natural) - English (India)', 'en_IN')])?.name).toContain('Neerja')
    expect(pickIndianVoice([v('Tara (English (India))'), v('Veena')])?.name).toBe('Veena')
    expect(pickIndianVoice([v('Tara (English (India))'), v('Rishi')])?.name).toContain('Tara')
    expect(pickIndianVoice([v('Rishi'), v('Aman'), v('Prabhat')])).toBeNull()
    expect(pickIndianVoice([v('Samantha', 'en-US'), v('Isha', 'en-GB')])).toBeNull()
  })
})

describe('a sentence is never cut short (the sound check stopped after "This is a…")', () => {
  const clip = (label: string, duration: number) => ({ label, duration }) as { label: string }
  /** iOS takes the audio away mid-clip: the context leaves "running" and says so. */
  const interrupt = () => { paused = true; liveCtx!.dispatchEvent(new Event('statechange')) }

  it('waits for the silent unlock sentence to end before the chime, since its end interrupts Web Audio on iOS', async () => {
    let endUnlock: (() => void) | undefined
    deviceVoice.speak.mockImplementationOnce((u: FakeUtterance) => { endUnlock = u.onend })
    sound.unlockSound()
    const chimed = sound.chime('normal')
    await vi.advanceTimersByTimeAsync(400)
    expect(heard).toEqual([])
    endUnlock!()
    await vi.advanceTimersByTimeAsync(1000)
    expect(heard.filter((h) => h === 'start:note')).toHaveLength(2)
    expect(await chimed).toBe(true)
  })

  it('never lets an unlock sentence that reports no end hold the gate for more than 1.5 s', async () => {
    deviceVoice.speak.mockImplementationOnce(() => undefined)
    sound.unlockSound()
    const chimed = sound.chime('normal')
    await vi.advanceTimersByTimeAsync(1400)
    expect(heard).toEqual([])
    await vi.advanceTimersByTimeAsync(1100)
    expect(await chimed).toBe(true)
  })

  it('says the whole sentence again when iOS cut it off and gives the audio back, and reports the school voice', async () => {
    comesBack = true
    const said = sound.speak('This is a sound check. Jumpstart Go gate announcements are working correctly.', undefined, sound.SOUND_CHECK_BUDGET_MS)
    pending.get('This is a sound check. Jumpstart Go gate announcements are working correctly.')!.resolve(clip('check', 4))
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual(['start:check'])
    interrupt()
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual(['start:check', 'stop:check', 'start:check'])
    liveCtx!.currentTime += 4
    finish()
    expect(await said).toBe('school')
    expect(heard.some((h) => h.startsWith('device'))).toBe(false)
  })

  it("hands the rest to the tablet's voice when iOS won't give the audio back, instead of reporting it played", async () => {
    const said = sound.speak('This is a reminder. Aarav Sharma. Pickup by his mother in about ten minutes.')
    pending.get('This is a reminder.')!.resolve(clip('opening', 1.2))
    await vi.advanceTimersByTimeAsync(0)
    interrupt()
    await vi.advanceTimersByTimeAsync(600)
    expect(heard.at(-1)).toBe('device:This is a reminder. Aarav Sharma. Pickup by his mother in about ten minutes.')
    sound.stopSound()
    expect(await said).not.toBe('school')
  })

  it('counts a clip that ends well before its length as cut, and plays it again', async () => {
    const said = sound.speak('This is a sound check. Jumpstart Go gate announcements are working correctly.', undefined, sound.SOUND_CHECK_BUDGET_MS)
    pending.get('This is a sound check. Jumpstart Go gate announcements are working correctly.')!.resolve(clip('check', 4))
    await vi.advanceTimersByTimeAsync(0)
    liveCtx!.currentTime += 0.7 // "This is a…"
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual(['start:check', 'start:check'])
    liveCtx!.currentTime += 4
    finish()
    expect(await said).toBe('school')
  })

  it('plays a clip that ran its full length only once', async () => {
    const said = sound.speak('This is a sound check. Jumpstart Go gate announcements are working correctly.', undefined, sound.SOUND_CHECK_BUDGET_MS)
    pending.get('This is a sound check. Jumpstart Go gate announcements are working correctly.')!.resolve(clip('check', 4))
    await vi.advanceTimersByTimeAsync(0)
    liveCtx!.currentTime += 4
    finish()
    expect(await said).toBe('school')
    expect(heard).toEqual(['start:check'])
  })

  it("reports a device-voice sentence that iOS stopped part-way as cut, so it is never called heard", async () => {
    deviceVoice.speak.mockImplementation((u: FakeUtterance & { onerror?: () => void }) => {
      if (unlockEnds(u)) return true
      heard.push(`device:${u.text}`)
      u.onstart?.()
      setTimeout(() => u.onerror?.(), 600)
    })
    const said = sound.speak('Reason: dentist.')
    await vi.advanceTimersByTimeAsync(sound.CLIP_BUDGET_MS + 700)
    expect(await said).toBe('cut')
    deviceVoice.speak.mockImplementation((u: FakeUtterance) => unlockEnds(u) || heard.push(`device:${u.text}`))
  })
})
