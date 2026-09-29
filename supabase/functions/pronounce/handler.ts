// A staff member's live request (D50): a pronunciation preview, or a sentence nobody made ahead. Kept free of Deno and
// npm imports so it can be tested; index.ts wires in the database, the TTS provider and the store.
import { checkSpeech, clipKey } from '../_shared/announce.ts'
import { TtsBusy, type TTSProvider } from '../_shared/tts.ts'

export interface DbError { code?: string; message: string }

export interface Deps {
  /** public.voice_spend as the caller: true = counted, false = this month's cap is reached. */
  spend(authorization: string, chars: number): Promise<{ data: boolean | null; error: DbError | null }>
  /** The configured provider, or null when its secrets aren't set. */
  provider: TTSProvider | null
  /** The clip already in the school's store, if any (no characters spent). */
  stored?(key: string): Promise<Uint8Array<ArrayBuffer> | null>
  /** Keeps a newly made clip in the school's store, so nobody pays for it twice. */
  keep?(key: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>
  /** The app's origin, the only site allowed to call this; '*' when not set. */
  origin: string
  log?(event: string, extra?: Record<string, unknown>): void
}

/**
 * POST { text } with the staff member's sign-in → the sentence as audio/mpeg. Refuses before the provider is called
 * when the caller isn't staff (403), the text isn't 1–400 speakable characters (400), they asked for more than 300 this
 * hour (429 "rate"), or the month has reached its cap (429 "cap": the iPad uses its own voice).
 */
export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': deps.origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'x-voice-version, x-voice-cache',
    Vary: 'Origin',
  }
  const reply = (body: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const log = deps.log ?? (() => {})

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)
  const authorization = req.headers.get('Authorization') ?? ''
  if (!/^Bearer \S+$/.test(authorization)) return reply({ error: 'Sign in again.' }, 401)

  let body: { text?: unknown } = {}
  try { body = await req.json() } catch { /* checked below */ }
  const text = checkSpeech(body.text)
  if (!text) return reply({ error: 'That can’t be spoken.' }, 400)
  const provider = deps.provider
  if (!provider) return reply({ error: 'The school voice is not set up yet.' }, 503)

  const audio = (bytes: Uint8Array<ArrayBuffer>, cache: 'hit' | 'miss') => new Response(bytes, {
    headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'x-voice-version': provider.version, 'x-voice-cache': cache },
  })
  const key = await clipKey(provider.version, text)
  // Made ahead already (or by someone else's preview): free, and no staff check needed beyond the sign-in's own rules.
  const ready = await deps.stored?.(key).catch(() => null)

  // One database call: the staff check, the hourly limit and the monthly count, all before the provider.
  const { data: counted, error } = await deps.spend(authorization, ready ? 1 : text.length)
  if (error) {
    if (error.code === '42501') return reply({ error: 'Only school staff can make announcements.' }, 403)
    if (error.message.startsWith('rate_limited')) return reply({ error: 'Too many announcements. Try again in a while.', reason: 'rate' }, 429)
    if (error.message.startsWith('bad_length')) return reply({ error: 'That can’t be spoken.' }, 400)
    if (error.code === 'PGRST301' || error.code === 'PGRST303' || /jwt/i.test(error.message)) return reply({ error: 'Sign in again.' }, 401)
    log('spend_failed')
    return reply({ error: 'The school voice is unavailable right now.' }, 503)
  }
  if (ready) {
    log('cache_hit')
    return audio(ready, 'hit')
  }
  if (!counted) {
    log('monthly_cap')
    return reply({ error: 'The school voice has used this month’s free allowance.', reason: 'cap' }, 429)
  }

  const started = Date.now()
  try {
    const bytes = await provider.synthesize(text)
    // Counts, sizes and timings only, never the words or who asked.
    log('generation_succeeded', { chars: text.length, bytes: bytes.length, ms: Date.now() - started })
    await deps.keep?.(key, bytes).catch(() => log('cache_write_failed'))
    return audio(bytes, 'miss')
  } catch (e) {
    log('generation_failed', { busy: e instanceof TtsBusy, ms: Date.now() - started })
    return reply({ error: 'The school voice is unavailable right now.' }, e instanceof TtsBusy ? 503 : 502)
  }
}
