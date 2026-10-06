/**
 * Text to speech behind one small interface, so the gate never depends on a provider directly (D50). The pronounce
 * function is the only caller; keys stay in its secrets and never reach a browser.
 */
import { voiceVersion } from './announce.ts'

export interface TTSProvider {
  /** The voice's name, e.g. en-IN-NeerjaNeural. */
  readonly voice: string
  /** The clips' version (provider, voice, format, wording): part of every clip key. */
  readonly version: string
  /** One sentence as MP3. Throws TtsBusy when the provider asks us to slow down or is briefly unavailable. */
  synthesize(text: string): Promise<Uint8Array<ArrayBuffer>>
}

/** Rate-limited, quota-exhausted or briefly down: try later. Not the sentence's fault. */
export class TtsBusy extends Error {}

const XML: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
/** Text made safe inside SSML: every character that means something to XML is escaped, so nothing can inject tags. */
export const xmlText = (s: string) => s.replace(/[&<>"']/g, (c) => XML[c]!)

/**
 * The SSML Azure is given: one voice, Indian English, the escaped sentence. A speaking style (only en-IN-NeerjaNeural has
 * them: cheerful, empathetic, newscast) and a rate change are added only when set, so without them the request is as before.
 */
export const ssml = (voice: string, text: string, style = '', rate = '') => {
  let body = xmlText(text)
  if (rate) body = `<prosody rate="${xmlText(rate)}">${body}</prosody>`
  if (style) body = `<mstts:express-as style="${xmlText(style)}">${body}</mstts:express-as>`
  const ns = style ? ' xmlns:mstts="https://www.w3.org/2001/mstts"' : ''
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"${ns} xml:lang="en-IN"><voice name="${xmlText(voice)}">${body}</voice></speak>`
}

const VOICE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+(:[A-Za-z0-9]+)?Neural$/
/**
 * The gate always speaks in an Indian English woman's voice (owner, 2026-10-04). Azure's en-IN women's voices; any other
 * setting, a man's voice such as en-IN-PrabhatNeural included, is replaced by the default and logged by the caller.
 */
export const DEFAULT_VOICE = 'en-IN-NeerjaNeural'
export const INDIAN_WOMEN_VOICES: readonly string[] = ['en-IN-NeerjaNeural', 'en-IN-AartiNeural', 'en-IN-AashiNeural', 'en-IN-AnanyaNeural', 'en-IN-KavyaNeural']
// The same women's voices, or their HD versions (en-IN-Neerja:DragonHDLatestNeural).
const INDIAN_WOMAN = /^en-IN-(Neerja|Aarti|Aashi|Ananya|Kavya)(:[A-Za-z0-9]+)?Neural$/
export const isIndianWomanVoice = (voice: string) => INDIAN_WOMAN.test(voice)
export const indianWomanVoice = (voice: string | undefined): { voice: string; replaced: boolean } => {
  const v = (voice ?? '').trim()
  return isIndianWomanVoice(v) ? { voice: v, replaced: false } : { voice: DEFAULT_VOICE, replaced: v !== '' }
}
const REGION = /^[a-z0-9]{3,30}$/
const STYLE = /^(|cheerful|empathetic|newscast)$/
// A gentle change only: from 20% slower to 10% faster.
const RATE = /^(|-(1?[0-9]|20)%|\+?([0-9]|10)%)$/

export interface AzureConfig { key: string; region: string; voice: string; style?: string; rate?: string; fetch?: typeof fetch; timeoutMs?: number }

/**
 * Microsoft Azure AI Speech (REST, cognitiveservices/v1), MP3 at 24 kHz. Checks its settings when made, so a typo in a
 * secret fails loudly instead of sending bad requests.
 */
export function azureSpeech({ key, region, voice, style = '', rate = '', fetch: f = fetch, timeoutMs = 15_000 }: AzureConfig): TTSProvider {
  if (!key) throw new Error('AZURE_SPEECH_KEY is not set')
  if (!REGION.test(region)) throw new Error('AZURE_SPEECH_REGION must be a region name such as centralindia')
  if (!VOICE.test(voice)) throw new Error('AZURE_SPEECH_VOICE must be a neural voice name such as en-IN-NeerjaNeural')
  if (!isIndianWomanVoice(voice)) throw new Error(`AZURE_SPEECH_VOICE must be one of ${INDIAN_WOMEN_VOICES.join(', ')}`)
  if (!STYLE.test(style)) throw new Error('AZURE_SPEECH_STYLE must be empty, cheerful, empathetic or newscast')
  if (!RATE.test(rate)) throw new Error('AZURE_SPEECH_RATE must be empty or a percentage from -20% to +10%')
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
  return {
    voice,
    version: voiceVersion(voice, style, rate),
    async synthesize(text) {
      let res: Response
      try {
        res = await f(url, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            'User-Agent': 'jumpstart-go',
          },
          body: ssml(voice, text, style, rate),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        throw new TtsBusy('unreachable')
      }
      if (res.status === 429 || res.status >= 500) throw new TtsBusy(`azure ${res.status}`)
      // Azure's error body is never passed on: it can echo request details.
      if (!res.ok) throw new Error(`azure ${res.status}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!bytes.length) throw new TtsBusy('empty audio')
      return bytes
    },
  }
}
