import { describe, expect, it, vi } from 'vitest'
import { voiceVersion } from '../_shared/announce'
import { azureSpeech, ssml, TtsBusy, type TTSProvider } from '../_shared/tts'
import { handle, type Deps } from './handler'

// MOCK: Azure, the database and the store are stand-ins; nothing here reaches any service.
const mp3 = new TextEncoder().encode('ID3fake-mp3') as Uint8Array<ArrayBuffer>
function provider(): TTSProvider & { synthesize: ReturnType<typeof vi.fn> } {
  return { voice: 'en-IN-NeerjaNeural', version: voiceVersion('en-IN-NeerjaNeural'), synthesize: vi.fn(async () => mp3) }
}
function deps(spend: Awaited<ReturnType<Deps['spend']>> = { data: true, error: null }) {
  return {
    origin: 'https://app.example',
    provider: provider(),
    spend: vi.fn(async () => spend),
    stored: vi.fn(async () => null as Uint8Array<ArrayBuffer> | null),
    keep: vi.fn(async () => {}),
  }
}
const ask = (body: unknown, auth: string | null = 'Bearer staff-token') =>
  new Request('https://fn.example/pronounce', { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(body) })

describe('the pronounce function (a live request)', () => {
  it('makes a sentence nobody made ahead, counting its characters first and keeping it for everyone', async () => {
    const d = deps()
    const res = await handle(ask({ text: 'Vihaan Kulkarni has arrived for drop-off.' }), d)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(res.headers.get('x-voice-version')).toBe(d.provider.version)
    expect(d.spend).toHaveBeenCalledWith('Bearer staff-token', 41)
    expect(d.provider.synthesize).toHaveBeenCalledWith('Vihaan Kulkarni has arrived for drop-off.')
    expect(d.keep).toHaveBeenCalledTimes(1)
  })

  it('answers from the store when the clip was made ahead, without calling Azure', async () => {
    const d = deps()
    d.stored.mockResolvedValueOnce(mp3)
    const res = await handle(ask({ text: 'New announcement.' }), d)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-voice-cache')).toBe('hit')
    expect(d.provider.synthesize).not.toHaveBeenCalled()
    // Checked (staff, hourly limit) but not counted: nothing went to Azure.
    expect(d.spend).toHaveBeenCalledWith('Bearer staff-token', 0)
  })

  it('needs a sign-in', async () => {
    const d = deps()
    expect((await handle(ask({ text: 'Hello.' }, null), d)).status).toBe(401)
    expect(d.spend).not.toHaveBeenCalled()
    expect(d.provider.synthesize).not.toHaveBeenCalled()
  })

  it('refuses anyone who isn’t staff without calling Azure', async () => {
    const d = deps({ data: null, error: { code: '42501', message: 'Only school staff can make announcements.' } })
    expect((await handle(ask({ text: 'Hello.' }), d)).status).toBe(403)
    expect(d.provider.synthesize).not.toHaveBeenCalled()
  })

  it('refuses empty, too long or unspeakable text before counting anything', async () => {
    for (const text of ['', '   ', 'a'.repeat(401), '<speak>', 42]) {
      const d = deps()
      expect((await handle(ask({ text }), d)).status).toBe(400)
      expect(d.spend).not.toHaveBeenCalled()
    }
  })

  it('stops at the monthly cap with 429 and never calls Azure, so it stays free', async () => {
    const d = deps({ data: false, error: null })
    const res = await handle(ask({ text: 'Vihaan Kulkarni.' }), d)
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ reason: 'cap' })
    expect(d.provider.synthesize).not.toHaveBeenCalled()
  })

  it('limits each person per hour', async () => {
    const d = deps({ data: null, error: { code: 'P0001', message: 'rate_limited: voice:abc' } })
    const res = await handle(ask({ text: 'Hello.' }), d)
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ reason: 'rate' })
  })

  it('reports Azure busy or failing as unavailable, so the iPad uses its own voice', async () => {
    const d = deps()
    d.provider.synthesize.mockRejectedValueOnce(new TtsBusy('azure 429'))
    expect((await handle(ask({ text: 'Hello.' }), d)).status).toBe(503)
    d.provider.synthesize.mockRejectedValueOnce(new Error('azure 400'))
    expect((await handle(ask({ text: 'Hello.' }), d)).status).toBe(502)
  })

  it('says the voice isn’t set up when the Azure secrets are missing', async () => {
    expect((await handle(ask({ text: 'Hello.' }), { ...deps(), provider: null })).status).toBe(503)
  })
})

describe('Azure AI Speech', () => {
  it('escapes everything XML could read as markup, so a name can never inject SSML', () => {
    const out = ssml('en-IN-NeerjaNeural', `D'Souza & <break time="9s"/> "Aarav"`)
    expect(out).toContain('D&apos;Souza &amp; &lt;break time=&quot;9s&quot;/&gt; &quot;Aarav&quot;')
    expect(out).toMatch(/^<speak version="1.0" xmlns="http:\/\/www.w3.org\/2001\/10\/synthesis" xml:lang="en-IN"><voice name="en-IN-NeerjaNeural">/)
    expect(out.match(/</g)).toHaveLength(4)
  })

  it('sends the key only in a header, asks for 24 kHz MP3, and treats 429 and 5xx as busy', async () => {
    const f = vi.fn(async () => new Response(mp3, { status: 200 }))
    const tts = azureSpeech({ key: 'secret-key', region: 'centralindia', voice: 'en-IN-NeerjaNeural', fetch: f as unknown as typeof fetch })
    expect(await tts.synthesize('Hello.')).toEqual(mp3)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://centralindia.tts.speech.microsoft.com/cognitiveservices/v1')
    expect(url).not.toContain('secret-key')
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('secret-key')
    expect(init.headers['X-Microsoft-OutputFormat']).toBe('audio-24khz-48kbitrate-mono-mp3')
    for (const status of [429, 503]) {
      f.mockResolvedValueOnce(new Response('', { status }))
      await expect(tts.synthesize('Hello.')).rejects.toBeInstanceOf(TtsBusy)
    }
    f.mockResolvedValueOnce(new Response('bad', { status: 401 }))
    await expect(tts.synthesize('Hello.')).rejects.not.toBeInstanceOf(TtsBusy)
  })

  it('refuses a missing key, a malformed region or a voice that isn’t a neural voice name', () => {
    expect(() => azureSpeech({ key: '', region: 'centralindia', voice: 'en-IN-NeerjaNeural' })).toThrow(/KEY/)
    expect(() => azureSpeech({ key: 'k', region: 'central india', voice: 'en-IN-NeerjaNeural' })).toThrow(/REGION/)
    expect(() => azureSpeech({ key: 'k', region: 'centralindia', voice: 'Neerja"><evil' })).toThrow(/VOICE/)
    expect(() => azureSpeech({ key: 'k', region: 'centralindia', voice: 'en-IN-NeerjaNeural', style: 'angry' })).toThrow(/STYLE/)
    expect(() => azureSpeech({ key: 'k', region: 'centralindia', voice: 'en-IN-NeerjaNeural', rate: '-50%' })).toThrow(/RATE/)
    expect(() => azureSpeech({ key: 'k', region: 'centralindia', voice: 'en-IN-NeerjaNeural', rate: '"/><x' })).toThrow(/RATE/)
    expect(() => azureSpeech({ key: 'k', region: 'centralindia', voice: 'en-IN-Neerja:DragonHDLatestNeural' })).not.toThrow()
  })
})

describe('a softer voice, chosen on the server', () => {
  it('sends the same request as before when no style or rate is set, so nothing is re-recorded', () => {
    expect(ssml('en-IN-NeerjaNeural', 'Hello.')).toBe('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-IN"><voice name="en-IN-NeerjaNeural">Hello.</voice></speak>')
    expect(azureSpeech({ key: 'k', region: 'centralindia', voice: 'en-IN-NeerjaNeural' }).version).toBe(voiceVersion('en-IN-NeerjaNeural'))
  })
  it('wraps the sentence in the style and rate, and changes the clip version so the iPads get the new voice', () => {
    expect(ssml('en-IN-NeerjaNeural', 'Hello.', 'empathetic', '-5%')).toBe('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-IN"><voice name="en-IN-NeerjaNeural"><mstts:express-as style="empathetic"><prosody rate="-5%">Hello.</prosody></mstts:express-as></voice></speak>')
    const soft = azureSpeech({ key: 'k', region: 'centralindia', voice: 'en-IN-NeerjaNeural', style: 'empathetic', rate: '-5%' })
    expect(soft.version).not.toBe(voiceVersion('en-IN-NeerjaNeural'))
    expect(soft.version).toContain('+empathetic@-5%')
  })
})
