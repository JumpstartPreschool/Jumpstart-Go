// Gate voice lag test (D50). Dev server only: open /scripts/qa/voice-lag/ on the machine or iPad to test.
// Drives the app's real announcer, chime, clip cache and fallback, and reports how long after the chime speech starts.
// Simulated mode is a MOCK of the school voice (Azure): the pronounce request is answered locally, after a set delay, with opening.mp3 or
// message.mp3 (Indian English recordings made with macOS `say`).
import { createAnnouncer } from '../../../src/features/duty/announcer'
import { PRIORITY } from '../../../src/features/duty/gate'
import { deviceOutput, unlockSound, CLIP_BUDGET_MS } from '../../../src/features/duty/sound'
import { voiceTimings } from '../../../src/features/duty/voiceClips'
import { supabase } from '../../../src/lib/supabase'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]! : NaN
}

let opening: ArrayBuffer | null = null
let message: ArrayBuffer | null = null
const realFetch = window.fetch.bind(window)
let delayMs = 900

/** MOCK: answers the pronounce function locally, after the chosen delay, with a real MP3 for the opening or message. */
function simulate(on: boolean): void {
  window.fetch = on
    ? async (input, init) => {
      if (String(input instanceof Request ? input.url : input).endsWith('/functions/v1/pronounce')) {
        const { text } = JSON.parse(String(init?.body ?? '{}')) as { text?: string }
        await wait(delayMs)
        const bytes = /announcement\.$|reminder\.$/.test(text ?? '') ? opening! : message!
        return new Response(bytes.slice(0), { headers: { 'Content-Type': 'audio/mpeg' } })
      }
      return realFetch(input, init)
    }
    : realFetch
  if (on) supabase.auth.getSession = (async () => ({ data: { session: { access_token: 'lag-test' } }, error: null })) as typeof supabase.auth.getSession
}

async function run(): Promise<void> {
  const button = $<HTMLButtonElement>('run')
  button.disabled = true
  unlockSound()
  const live = (document.querySelector('input[name=mode]:checked') as HTMLInputElement).value === 'live'
  delayMs = Number($<HTMLInputElement>('delay').value) || 0
  const count = Math.max(1, Math.min(50, Number($<HTMLInputElement>('count').value) || 20))
  opening ??= await (await realFetch(new URL('./opening.mp3', import.meta.url))).arrayBuffer()
  message ??= await (await realFetch(new URL('./message.mp3', import.meta.url))).arrayBuffer()
  simulate(!live)

  const announcer = createAnnouncer(deviceOutput)
  const rows: Array<{ n: number; afterChime: number | null; pauseBeforeMessage: number | null; fallback: boolean; askedBeforeChimeEnd: number }> = []
  // A fresh message each time, so nothing is cached (the worst case). Real Indian names, as the gate would say them.
  const kids = ['Vihaan Kulkarni', 'Aaradhya Sharma', 'Ishaan Deshpande', 'Saanvi Joshi', 'Arjun Patil', 'Anaya Iyer', 'Reyansh Gupta', 'Myra Nair', 'Kabir Mehta', 'Diya Reddy']
  const adults = ['Rohan', 'Priya', 'Sneha', 'Amit', 'Neha', 'Rahul', 'Pooja', 'Vikram', 'Kavya', 'Suresh']
  const run = Date.now() % 1000
  for (let n = 1; n <= count; n++) {
    $('status').textContent = `Announcement ${n} of ${count}…`
    const id = `lag-${n}`
    const kid = kids[(n - 1) % kids.length]!
    const text = `${kid}. Pickup by ${adults[(n - 1) % adults.length]}, arriving about ${1 + (n % 5)}:${String((run + n * 5) % 60).padStart(2, '0')} PM. Please get ${kid.split(' ')[0]} ready.`
    const start = voiceTimings.length
    await new Promise<void>((done) => {
      let seen = false
      const stop = announcer.subscribe((s) => {
        if (s.speaking?.id === id) seen = true
        else if (seen && !s.speaking) { stop(); announcer.acknowledge(id); done() }
      })
      announcer.announce({ id, text, chime: 'normal', priority: PRIORITY.normal })
    })
    const marks = voiceTimings.slice(start)
    const at = (stage: string) => marks.find((m) => m.stage === stage)?.at
    const chimeEnd = at('chime-end')!
    const speech = at('speech-start')
    const openingEnd = at('opening-end')
    const messageStart = at('message-start')
    rows.push({
      n, afterChime: speech != null ? speech - chimeEnd : null,
      pauseBeforeMessage: openingEnd != null && messageStart != null ? messageStart - openingEnd : null,
      fallback: at('device-voice') != null, askedBeforeChimeEnd: chimeEnd - at('prepare')!,
    })
    await wait(300)
  }
  simulate(false)

  const google = rows.filter((r) => r.afterChime != null).map((r) => r.afterChime!)
  const result = {
    mode: live ? 'live' : `simulated ${delayMs} ms`,
    budgetMs: CLIP_BUDGET_MS,
    announcements: rows.length,
    googleVoice: google.length,
    iPadVoiceFallback: rows.filter((r) => r.fallback).length,
    speechAfterChimeMs: { p50: pct(google, 50), p95: pct(google, 95), max: Math.max(...google) },
    pauseBeforeMessageMs: (() => { const g = rows.flatMap((r) => (r.pauseBeforeMessage == null ? [] : [r.pauseBeforeMessage])); return { p50: pct(g, 50), p95: pct(g, 95) } })(),
    askedBeforeChimeEndMs: { p50: pct(rows.map((r) => r.askedBeforeChimeEnd), 50) },
    userAgent: navigator.userAgent,
    rows,
  }
  ;(window as unknown as { __voiceLagResult: unknown }).__voiceLagResult = result
  $('status').textContent = google.length
    ? `School voice ${google.length}/${rows.length}: speech ${result.speechAfterChimeMs.p50} ms after the chime (p50), ${result.speechAfterChimeMs.p95} ms (p95)`
    : `iPad voice for all ${rows.length}: the school voice wasn't ready within ${CLIP_BUDGET_MS} ms of the chime`
  $('out').textContent = JSON.stringify(result, null, 2)
  button.disabled = false
}

// ?count=6&delay=900 in the address sets the fields (handy on an iPad, where typing is slow).
const params = new URLSearchParams(location.search)
for (const key of ['count', 'delay']) if (params.get(key)) $<HTMLInputElement>(key).value = params.get(key)!
$('run').addEventListener('click', () => void run())
