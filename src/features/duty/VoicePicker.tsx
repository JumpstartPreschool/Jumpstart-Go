import { useEffect, useState } from 'react'
import { AudioLines, Play, Sparkles } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { Sheet } from '../../ui/Sheet'
import { EmptyState, Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { chooseVoice, currentVoice, rankedVoices, soundSupported, speak, stopSound, voiceGender, voiceQuality, type VoiceQuality } from './sound'

const SAMPLE = 'Please get Aarav ready for pickup. His grandfather, Ramesh, arrives at about twelve forty-five.'
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

/** The voice in use, for showing next to the sound check. */
export function useVoiceName(): string | null {
  const voices = useVoices()
  const v = voices.length ? currentVoice() : null
  return v ? voiceLabel(v) : null
}

/**
 * Choose the announcement voice for this iPad, hearing each one first. The most natural voices come first;
 * robotic novelty voices are never offered. Remembered on this device.
 */
export function VoicePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const voices = useVoices()
  const [chosen, setChosen] = useState<string | null>(() => currentVoice()?.name ?? null)
  const [playing, setPlaying] = useState<string | null>(null)
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  // iPadOS reports itself as a Mac; a touch screen tells them apart.
  const mobileApple = /iPad|iPhone/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
  const mac = /Macintosh/.test(ua) && !mobileApple
  const hasNatural = voices.some((v) => ['natural', 'premium', 'enhanced'].includes(voiceQuality(v.name)))

  useEffect(() => { if (open) setChosen(currentVoice()?.name ?? null) }, [open, voices])

  async function play(v: SpeechSynthesisVoice) {
    stopSound()
    setPlaying(v.name)
    await speak(SAMPLE, v)
    setPlaying((p) => (p === v.name ? null : p))
  }

  function use(v: SpeechSynthesisVoice) {
    chooseVoice(v.name)
    setChosen(v.name)
    toast(`Announcements will use ${voiceLabel(v)}.`)
  }

  return (
    <Sheet open={open} onClose={() => { stopSound(); onClose() }} title="Announcement voice" description="Choose the voice that sounds most natural on this device. Tap Play to hear it read a pickup.">
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
                  <Pill tone={q.tone} className="max-[379px]:hidden">{q.label}</Pill>
                </button>
                <Button size="md" variant="secondary" icon={<Play />} aria-label={`Play ${voiceLabel(v)}`} loading={playing === v.name} onClick={() => void play(v)} />
              </li>
            )
          })}
        </ul>
      )}
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
