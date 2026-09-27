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
class FakeAudioContext {
  currentTime = 0
  destination = {}
  resume() { return Promise.resolve() }
  createBufferSource() { return new FakeSource() }
  createOscillator() { return new FakeSource() }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n } }
}
const deviceVoice = { speak: vi.fn((u: { text: string }) => heard.push(`device:${u.text}`)), cancel: vi.fn(), getVoices: () => [{ name: 'Isha', lang: 'en-IN' }] }

// The clips: each test decides when (and whether) a sentence's audio arrives.
const pending = new Map<string, { resolve: (b: { label: string }) => void; reject: (e: Error) => void }>()
vi.mock('./voiceClips', () => ({
  clearRetiredVoiceCaches: async () => {},
  voiceChild: () => null,
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
  sound.stopSound()
  vi.useRealTimers()
})

const arrive = (line: string) => pending.get(line)!.resolve({ label: line })
/** The playing clip reaches its natural end. */
const finish = () => clips.at(-1)!.dispatchEvent(new Event('ended'))

describe('gate sound', () => {
  it('plays the school voice the moment its clips are ready, sentence by sentence', async () => {
    const said = sound.speak('Pickup for Aarav, Nursery. Arriving now.')
    arrive('Pickup for Aarav, Nursery.')
    arrive('Arriving now.')
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual(['start:Pickup for Aarav, Nursery.'])
    finish()
    await vi.advanceTimersByTimeAsync(150)
    expect(heard).toEqual(['start:Pickup for Aarav, Nursery.', 'start:Arriving now.'])
    finish()
    await said
    expect(deviceVoice.speak).not.toHaveBeenCalled()
  })

  it("uses the tablet's own Indian voice when a clip isn't ready in time, so the gate never waits", async () => {
    const said = sound.speak('Reason: dentist.')
    await vi.advanceTimersByTimeAsync(sound.CLIP_BUDGET_MS)
    expect(heard).toEqual(['device:Reason: dentist.'])
    sound.stopSound()
    await said
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

describe("the tablet's own voice", () => {
  const v = (name: string, lang = 'en-IN') => ({ name, lang })
  it('picks the clearest Indian English voice, and Tara (which garbles announcements) only if nothing else exists', async () => {
    const { pickIndianVoice } = await import('./sound')
    expect(pickIndianVoice([v('Tara (English (India))'), v('Aman'), v('Rishi'), v('Samantha', 'en-US')])?.name).toBe('Rishi')
    expect(pickIndianVoice([v('Tara (English (India))'), v('Aman')])?.name).toBe('Aman')
    expect(pickIndianVoice([v('Rishi'), v('Microsoft Neerja Online (Natural) - English (India)', 'en_IN')])?.name).toContain('Neerja')
    expect(pickIndianVoice([v('Tara (English (India))')])?.name).toContain('Tara')
    expect(pickIndianVoice([v('Samantha', 'en-US')])).toBeNull()
  })
})
