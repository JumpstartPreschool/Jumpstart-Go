// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clipKey, clipPath, voiceVersion } from '../../../supabase/functions/_shared/announce'

// MOCK: the school's clip store, the pronounce function, the sign-in and this iPad's Cache Storage are stand-ins.
const VERSION = voiceVersion('en-IN-NeerjaNeural')
const school = new Map<string, string>()
const download = vi.fn(async (path: string) => {
  const text = school.get(path)
  return { data: text === undefined ? null : new Blob([new TextEncoder().encode(text)]), error: null }
})
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    storage: { from: () => ({ download }) },
    rpc: async () => ({ data: VERSION, error: null }),
  },
}))
const kept = new Map<string, Response>()
const live = vi.fn(async (_url: string, init: { body: string }) =>
  new Response(new TextEncoder().encode(JSON.parse(init.body).text), { status: 200, headers: { 'x-voice-version': VERSION } }))
const ctx = { decodeAudioData: vi.fn(async (b: ArrayBuffer) => ({ label: new TextDecoder().decode(b) })) } as unknown as BaseAudioContext
const madeAhead = async (sentence: string) => school.set(clipPath(await clipKey(VERSION, sentence)), sentence)

type Clips = typeof import('./voiceClips')
let clips: Clips
beforeAll(async () => {
  vi.stubGlobal('fetch', live)
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (r: Request) => kept.get(r.url)?.clone(),
      put: async (r: Request, res: Response) => void kept.set(r.url, res),
    }),
    keys: async () => [],
  })
  clips = await import('./voiceClips')
  await clips.loadVoiceVersion()
})
afterAll(() => vi.unstubAllGlobals())
// Braces: a function returned from beforeEach would be run as its cleanup.
beforeEach(() => { live.mockClear(); download.mockClear() })

describe('gate voice clips', () => {
  it('plays a clip made ahead from the school’s store, without making anything live', async () => {
    await madeAhead('Vihaan Kulkarni has arrived for drop-off.')
    const buf = await clips.clipAudio(ctx, 'Vihaan Kulkarni has arrived for drop-off.')
    expect(buf).toEqual({ label: 'Vihaan Kulkarni has arrived for drop-off.' })
    expect(live).not.toHaveBeenCalled()
  })

  it('reuses a clip from memory on repeats: no second download', async () => {
    await madeAhead('New announcement.')
    await clips.clipAudio(ctx, 'New announcement.')
    await clips.clipAudio(ctx, 'New announcement.')
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('copies every child’s clips to the iPad on duty, and never makes a missing one', async () => {
    await madeAhead('Aaradhya Sharma is on the way for drop-off.')
    const result = await clips.warmClips(['Aaradhya Sharma is on the way for drop-off.', 'Nobody made this one.'])
    expect(result).toEqual({ ready: 1, missing: 1 })
    expect(live).not.toHaveBeenCalled()
    expect(kept.has(`${location.origin}/voice/${await clipKey(VERSION, 'Aaradhya Sharma is on the way for drop-off.')}.mp3`)).toBe(true)
  })

  it('makes a sentence live only when nobody made it ahead, and keeps it on the iPad', async () => {
    await clips.clipAudio(ctx, 'Ishaan Deshpande has arrived for drop-off.')
    expect(live).toHaveBeenCalledTimes(1)
    expect(kept.has(`${location.origin}/voice/${await clipKey(VERSION, 'Ishaan Deshpande has arrived for drop-off.')}.mp3`)).toBe(true)
  })

  it('stops asking for live clips for the rest of the month once the cap is reached', async () => {
    live.mockResolvedValueOnce(new Response(JSON.stringify({ reason: 'cap' }), { status: 429 }))
    await expect(clips.clipAudio(ctx, 'Saanvi Joshi has arrived for drop-off.')).rejects.toThrow()
    await expect(clips.clipAudio(ctx, 'Arjun Patil has arrived for drop-off.')).rejects.toThrow()
    expect(live).toHaveBeenCalledTimes(1)
    expect(Number(localStorage.getItem('jumpstart.voicePausedUntil'))).toBeGreaterThan(Date.now())
  })
})
