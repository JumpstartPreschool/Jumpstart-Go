import { useEffect, useState } from 'react'
import { AudioLines, Download, Play, Sparkles } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { EmptyState, Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { audioContext, chooseVoice, currentVoice, indianVoice, naturalChoice, rankedVoices, soundSupported, speak, stopSound, voiceGender, voiceQuality, type VoiceQuality } from './sound'
import { NATURAL_VOICES, onNaturalStatus, prepareNaturalVoice, type NaturalStatus, type NaturalVoiceId } from './naturalVoice'

const SAMPLE = 'New announcement. Please get Aarav Kulkarni ready for pickup. His grandfather, Ramesh, arrives at about twelve forty-five.'
const ACCENT: Record<string, string> = {
  'en-in': 'Indian English', 'en-gb': 'British English', 'en-us': 'American English', 'en-au': 'Australian English',
  'en-ie': 'Irish English', 'en-za': 'South African English', 'en-nz': 'New Zealand English', 'en-ca': 'Canadian English',
}

const GENDER = { female: "Woman's voice", male: "Man's voice", unknown: '' }

/** "Microsoft Neerja Online (Natural) - English (India)" → "Neerja". */
export function voiceLabel(v: Pick<SpeechSynthesisVoice, 'name'>): string {
  return v.name.replace(/^(Microsoft|Google)\s+/i, '').replace(/\s*\((Natural|Enhanced|Premium)\)/gi, '').replace(/\s+Online\b/i, '').replace(/\s*-\s*English.*$/i, '').trim() || v.name
}

const QUALITY: Record<VoiceQuality, { label: string; tone: 'live' | 'accent' | 'neutral' }> = {
  natural: { label: 'Natural', tone: 'live' },
  premium: { label: 'Premium', tone: 'live' },
  enhanced: { label: 'Enhanced', tone: 'accent' },
  online: { label: 'Online', tone: 'accent' },
  standard: { label: 'Standard', tone: 'neutral' },
}

/** The English voices on this device, kept up to date as the browser loads them. */
export function useVoices() {
  const [voices, setVoices] = useState(rankedVoices)
  useEffect(() => {
    if (!soundSupported) return
    const update = () => setVoices(rankedVoices())
    speechSynthesis.addEventListener('voiceschanged', update)
    update()
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}

export function useNaturalStatus(): NaturalStatus {
  const [s, setS] = useState<NaturalStatus>({ state: 'idle' })
  useEffect(() => onNaturalStatus(setS), [])
  return s
}

/** The voice in use, for showing next to the sound check: "Heart" (natural), or the device voice. */
export function useVoiceName(): string | null {
  const voices = useVoices()
  const status = useNaturalStatus()
  const natural = naturalChoice()
  if (natural) {
    const name = NATURAL_VOICES.find((v) => v.id === natural)!.name
    return status.state === 'ready' ? `${name} (natural)` : status.state === 'failed' ? `${voices.length ? voiceLabel(currentVoice()!) : 'the device voice'} (natural voice unavailable)` : `${name} (getting ready)`
  }
  const v = voices.length ? currentVoice() : null
  return v ? voiceLabel(v) : null
}

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`

/** Kokoro's women's voices, made on this iPad: download state, a sample, and the choice. */
function NaturalVoices({ chosen, playing, onPlay, onUse }: { chosen: string | null; playing: string | null; onPlay: (id: NaturalVoiceId) => void; onUse: (id: NaturalVoiceId) => void }) {
  const status = useNaturalStatus()
  const ready = status.state === 'ready'
  return (
    <section className="grid gap-2.5" aria-labelledby="natural-voices">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="natural-voices" className="kicker">Natural voices · made on this device</h3>
        {status.state === 'loading' && <Pill tone="accent">{status.total ? `Downloading ${Math.floor((status.loaded / status.total) * 100)}%` : 'Getting ready'}</Pill>}
        {ready && <Pill tone="live">Ready, works offline</Pill>}
      </div>
      {status.state === 'loading' && status.total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor((status.loaded / status.total) * 100)} aria-label="Natural voice download">
          <div className="h-full origin-left rounded-full bg-accent transition-transform duration-300" style={{ transform: `scaleX(${status.loaded / status.total})` }} />
        </div>
      )}
      <ul className="grid gap-2.5">
        {NATURAL_VOICES.map((v) => {
          const on = v.id === chosen
          return (
            <li key={v.id} className="flex items-center gap-2">
              <button type="button" role="radio" aria-checked={on} onClick={() => onUse(v.id)} className="choice flex min-w-0 flex-1 items-center gap-3 p-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-sm [&_svg]:size-5 ${on ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2'}`} aria-hidden>
                  <AudioLines className={playing === v.id ? 'animate-pulse' : ''} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-h4">{v.name}</span>
                  <span className="block truncate text-small font-semibold text-ink-2">Woman's voice · {v.note}</span>
                </span>
                <Pill tone="live" className="max-[379px]:hidden">Natural</Pill>
              </button>
              <Button size="md" variant="secondary" icon={<Play />} aria-label={`Play ${v.name}`} loading={playing === v.id} disabled={!ready} onClick={() => onPlay(v.id)} />
            </li>
          )
        })}
      </ul>
      {status.state === 'idle' && (
        <Button size="md" variant="secondary" icon={<Download />} className="justify-self-start" onClick={prepareNaturalVoice}>Download the natural voice</Button>
      )}
      {status.state === 'failed' && (
        <Notice tone="warning">The natural voice couldn't start on this device{typeof navigator !== 'undefined' && !navigator.onLine ? ' while offline' : ''}. Announcements use the device voice below. <button type="button" className="linkbtn" onClick={prepareNaturalVoice}>Try again</button></Notice>
      )}
      {status.state !== 'ready' && status.state !== 'failed' && (
        <p className="text-caption font-semibold text-ink-2">A one-time download{status.state === 'loading' && status.total ? ` of ${mb(status.total)}` : ''}, best on Wi-Fi. Until it's ready, the device voice speaks.</p>
      )}
    </section>
  )
}

/**
 * Choose the announcement voice for this iPad, hearing each one first. The most natural voices come first;
 * robotic novelty voices are never offered. Remembered on this device.
 */
export function VoicePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const voices = useVoices()
  const chosenNow = () => naturalChoice() ?? currentVoice()?.name ?? null
  const [chosen, setChosen] = useState<string | null>(chosenNow)
  const [playing, setPlaying] = useState<string | null>(null)
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  // iPadOS reports itself as a Mac; a touch screen tells them apart.
  const mobileApple = /iPad|iPhone/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
  const mac = /Macintosh/.test(ua) && !mobileApple
  const hasNatural = voices.some((v) => ['natural', 'premium', 'enhanced'].includes(voiceQuality(v.name)))
  const hasIndian = voices.length > 0 && !!indianVoice()

  useEffect(() => { if (open) { setChosen(chosenNow()); if (naturalChoice()) prepareNaturalVoice() } }, [open, voices])

  async function play(v: SpeechSynthesisVoice | NaturalVoiceId) {
    const key = typeof v === 'string' ? v : v.name
    stopSound()
    audioContext() // this tap allows sound
    setPlaying(key)
    await speak(SAMPLE, v)
    setPlaying((p) => (p === key ? null : p))
  }

  function use(v: SpeechSynthesisVoice | NaturalVoiceId) {
    const key = typeof v === 'string' ? v : v.name
    chooseVoice(key)
    setChosen(key)
    toast(`Announcements will use ${typeof v === 'string' ? NATURAL_VOICES.find((x) => x.id === v)!.name : voiceLabel(v)}.`)
  }

  return (
    <Sheet open={open} onClose={() => { stopSound(); onClose() }} title="Announcement voice" description="Tap Play to hear one, then choose.">
      {!hasIndian && voices.length > 0 && (
        <Notice tone="warning" className="mb-5" icon={<Sparkles aria-hidden />}>
          For children's names said the Indian way, add an Indian English voice for free: {mobileApple
            ? 'Settings, then Accessibility, then Spoken Content, then Voices, then English, then English (India)'
            : 'System Settings, then Accessibility, then Spoken Content, then System voice, then Manage Voices, then English (India)'}
          . Download Isha (Enhanced), then reopen this list.
        </Notice>
      )}
      <h3 className="kicker mb-2.5">This device's voices</h3>
      {voices.length === 0 ? (
        <EmptyState title="No English voices yet">This browser hasn't loaded its voices. Try again in a moment, or open Jumpstart in Safari.</EmptyState>
      ) : (
        <ul className="grid gap-2.5">
          {voices.slice(0, 12).map((v) => {
            const q = QUALITY[voiceQuality(v.name)]
            const on = v.name === chosen
            return (
              <li key={v.name} className="flex items-center gap-2">
                <button type="button" role="radio" aria-checked={on} onClick={() => use(v)} className="choice flex min-w-0 flex-1 items-center gap-3 p-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-sm [&_svg]:size-5 ${on ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2'}`} aria-hidden>
                    <AudioLines className={playing === v.name ? 'animate-pulse' : ''} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-h4">{voiceLabel(v)}</span>
                    <span className="block truncate text-small font-semibold text-ink-2">
                      {[GENDER[voiceGender(v.name) ?? 'unknown'], ACCENT[v.lang.replace('_', '-').toLowerCase()] ?? 'English'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {v.lang.replace('_', '-').toLowerCase() === 'en-in'
                    ? <Pill tone="accent" className="max-[379px]:hidden">Says Indian names clearly</Pill>
                    : <Pill tone={q.tone} className="max-[379px]:hidden">{q.label}</Pill>}
                </button>
                <Button size="md" variant="secondary" icon={<Play />} aria-label={`Play ${voiceLabel(v)}`} loading={playing === v.name} onClick={() => void play(v)} />
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-7"><NaturalVoices chosen={chosen} playing={playing} onPlay={(id) => void play(id)} onUse={use} /></div>
      {(mobileApple || mac) && (
        <Notice className="mt-5" icon={<Sparkles aria-hidden />} tone={hasNatural ? 'info' : 'warning'}>
          {hasNatural ? 'Voices marked Premium or Enhanced sound most like a person.' : 'This device has only its basic voices, which can sound mechanical.'}{' '}
          For a human-sounding voice, download one for free: {mobileApple
            ? 'Settings, then Accessibility, then Spoken Content, then Voices, then English'
            : 'System Settings, then Accessibility, then Spoken Content, then System voice, then Manage Voices'}
          . Choose a woman's Enhanced or Premium voice, such as Isha (India), then reopen this list and pick it.
        </Notice>
      )}
    </Sheet>
  )
}
