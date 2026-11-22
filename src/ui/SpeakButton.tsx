import { LoaderCircle, PlayLine } from './icons'

export type SpeakState = 'idle' | 'loading' | 'playing'

/**
 * Plays a name (styles: `.speakbtn` in app.css). Idle shows Play; loading a spinner while the audio is fetched or made;
 * playing three level bars, and a tap stops it. The label says what a tap does, for screen readers and on hover.
 */
export function SpeakButton({ state, name, onPlay, onStop, disabled }: { state: SpeakState; name: string; onPlay: () => void; onStop: () => void; disabled?: boolean }) {
  const label = state === 'playing' ? `Stop playing ${name}` : state === 'loading' ? `Getting ${name} ready to play` : `Play pronunciation for ${name}`
  return (
    <button type="button" className="speakbtn" data-state={state} aria-label={label} title={label} aria-busy={state === 'loading' || undefined}
      disabled={disabled} onClick={state === 'idle' ? onPlay : onStop}>
      {state === 'loading' ? <LoaderCircle className="animate-spin" aria-hidden />
        : state === 'playing' ? <span className="speakbtn-bars" aria-hidden><span /><span /><span /></span>
        : <PlayLine className="translate-x-px" aria-hidden />}
    </button>
  )
}
