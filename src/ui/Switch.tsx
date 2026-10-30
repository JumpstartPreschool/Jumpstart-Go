/**
 * An on/off switch with a 48px target; the state is announced as well as shown. Pair it with visible text that says
 * what it controls and what "on" means.
 */
export function Switch({ on, busy, label, onChange }: { on: boolean; busy?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={() => onChange(!on)}
      className="relative grid h-12 w-[60px] shrink-0 place-items-center disabled:opacity-60">
      <span className={`relative h-8 w-[52px] rounded-full transition-colors duration-200 ${on ? 'bg-live' : 'bg-line-2'}`} aria-hidden>
        <span className={`absolute top-1 left-1 size-6 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-[var(--ease-spring)] ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}
