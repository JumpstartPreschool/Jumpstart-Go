import { useRef, useState, type ReactNode } from 'react'
import { Bluetooth, TabletSmartphone } from 'lucide-react'
import { ChevronRight, Volume2 } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Notice } from '../../ui/States'
import { Sheet, SheetFooter } from '../../ui/Sheet'

type Output = 'bluetooth' | 'ipad'
type PickerAudio = HTMLAudioElement & { webkitShowPlaybackTargetPicker?: () => void }

// Safari's own list of speakers (the AirPlay picker: this iPad, paired Bluetooth speakers, AirPlay). Web pages can't
// pick a speaker themselves (AudioContext.setSinkId isn't in Safari), but the choice made in this list moves all of the
// iPad's sound, the gate voice and the tablet's own voice included.
const hasPicker = typeof HTMLMediaElement !== 'undefined' && 'webkitShowPlaybackTargetPicker' in HTMLMediaElement.prototype

const OPTIONS: Record<Output, { icon: ReactNode; title: string; text: string; tap: string }> = {
  bluetooth: {
    icon: <Bluetooth />,
    title: 'Bluetooth speaker',
    text: 'Loudest, for a busy gate. Turn it on and pair it in Settings → Bluetooth first.',
    tap: 'In the list, tap your speaker’s name.',
  },
  ipad: {
    icon: <TabletSmartphone />,
    title: 'iPad speaker',
    text: 'This iPad’s own speaker. Use it when there is no Bluetooth speaker.',
    tap: 'In the list, tap iPad.',
  },
}

/**
 * Where announcements play (the coordinator's Speaker button). A connected Bluetooth speaker is used automatically:
 * iPadOS sends all sound to it, so there is nothing to switch in the app. This sheet lets the coordinator move it back to
 * the iPad, or on to a speaker, through Apple's own speaker list, then hear a test.
 */
export function SpeakerSheet({ open, onClose, onTest, testing }: { open: boolean; onClose: () => void; onTest: () => void; testing: boolean }) {
  const media = useRef<PickerAudio>(null)
  const [picked, setPicked] = useState<Output | null>(null)

  function choose(output: Output) {
    setPicked(output)
    media.current?.webkitShowPlaybackTargetPicker?.()
  }

  return (
    <Sheet open={open} onClose={() => { setPicked(null); onClose() }} title="Where announcements play"
      description="A connected Bluetooth speaker is used automatically. To change it, choose below.">
      {/* Only here so Safari can open its speaker list; it never plays. */}
      <audio ref={media} src="/sounds/route.mp3" preload="auto" x-webkit-airplay="allow" hidden />
      <div className="grid gap-3">
        {(Object.keys(OPTIONS) as Output[]).map((o) => (
          <button key={o} type="button" className="choice flex items-center gap-3.5 p-3.5" aria-pressed={picked === o}
            disabled={!hasPicker} onClick={() => choose(o)}>
            <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent [&_svg]:size-[22px]" aria-hidden>{OPTIONS[o].icon}</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-h4">{OPTIONS[o].title}</span>
              <span className="block text-small font-semibold text-ink-2">{OPTIONS[o].text}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
          </button>
        ))}
      </div>
      <div className="mt-4" aria-live="polite">
        {!hasPicker ? (
          <Notice tone="info">This browser can’t open the speaker list. On the iPad, swipe down from the top-right corner, tap the AirPlay icon on the music tile, and choose the speaker.</Notice>
        ) : picked ? (
          <Notice tone="info">{OPTIONS[picked].tap} Then play a test to hear where announcements go.</Notice>
        ) : null}
      </div>
      <SheetFooter>
        <Button variant="secondary" icon={<Volume2 />} loading={testing} onClick={onTest}>Play a test</Button>
        <Button onClick={() => { setPicked(null); onClose() }}>Done</Button>
      </SheetFooter>
    </Sheet>
  )
}
