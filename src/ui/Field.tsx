import { Children, isValidElement, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check, ChevronDown, CircleAlert, EyeLine, EyeOffLine, Search } from './icons'
import { Sheet } from './Sheet'

type Extra = { label: string; hint?: ReactNode; error?: string | null; icon?: ReactNode }

/** Label above, the control, then either the error (announced) or a hint below. */
function Wrapper({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    // content-start: beside a taller field (one with a hint or an error), the control stays level instead of sliding down.
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="px-0.5 text-small font-bold text-ink-2">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="flex items-start gap-1.5 px-0.5 text-small font-bold text-danger" role="alert">
          <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />{error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="px-0.5 text-caption font-semibold text-ink-2">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextField({ label, hint, error, icon, className = '', ...input }: InputHTMLAttributes<HTMLInputElement> & Extra) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <div className={`input ${className}`}>
        {icon}
        <input id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} {...input} />
      </div>
    </Wrapper>
  )
}

/**
 * A real password input with Show/Hide beside it. The button never takes focus from the field on a press (so the
 * phone keyboard stays up) and puts the caret back where it was, since switching the type can move it.
 */
export function PasswordField({ label, hint, error, icon, className = '', ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & Extra) {
  const id = useId()
  const ref = useRef<HTMLInputElement>(null)
  const [shown, setShown] = useState(false)
  function toggle() {
    const el = ref.current
    const [start, end] = [el?.selectionStart ?? null, el?.selectionEnd ?? null]
    setShown((s) => !s)
    if (el && document.activeElement === el && start !== null && end !== null) requestAnimationFrame(() => el.setSelectionRange(start, end))
  }
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <div className={`input input--reveal ${className}`}>
        {icon}
        <input ref={ref} id={id} type={shown ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} {...input} />
        <button type="button" className="input__reveal" aria-controls={id} aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'} onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
          {shown ? <EyeOffLine aria-hidden /> : <EyeLine aria-hidden />}
        </button>
      </div>
    </Wrapper>
  )
}

interface Choice { value: string; label: string; disabled: boolean }
type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean }
const textOf = (n: ReactNode): string => Children.toArray(n).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join('')
/** The <option> children as choices: an option without a value uses its text, as a native select does. */
function choicesOf(children: ReactNode): Choice[] {
  return Children.toArray(children).flatMap((c) => {
    if (!isValidElement<OptionProps>(c) || c.type !== 'option') return []
    const label = textOf(c.props.children)
    return [{ value: String(c.props.value ?? label), label, disabled: !!c.props.disabled }]
  })
}

/**
 * A choice from a list, written with <option> children like a native select, but shown as the app's own field and a
 * sheet of large options (never the browser's dropdown), so it looks and works the same everywhere. Many short
 * choices (times) are a grid of chips; others are rows with a check on the chosen one.
 */
export function SelectField({ label, hint, error, icon, children, value, onValue, className = '' }: Extra & {
  children: ReactNode; value: string | number; onValue: (value: string) => void; className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const choices = choicesOf(children)
  const current = choices.find((c) => c.value === String(value))
  const chips = choices.length > 8 && choices.every((c) => c.label.length <= 12)
  const pick = (v: string) => { onValue(v); setOpen(false) }
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <div className={`input ${className}`}>
        {icon}
        <button id={id} type="button" className="input__value" aria-haspopup="dialog" aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined} onClick={() => setOpen(true)}>
          {current ? current.label : <span className="text-ink-3">Choose</span>}
        </button>
        <ChevronDown aria-hidden />
      </div>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title={label}>
          <div role="listbox" aria-label={label} className={chips ? 'grid grid-cols-3 gap-2 sm:grid-cols-4' : 'grid gap-2'}>
            {choices.map((c) => {
              const chosen = c.value === String(value)
              return chips ? (
                <button key={c.value} type="button" role="option" aria-selected={chosen} disabled={c.disabled} onClick={() => pick(c.value)}
                  className={`h-12 rounded-full text-small font-bold tabular-nums transition-[background-color,transform] duration-150 active:scale-95 disabled:opacity-30 ${chosen ? 'bg-accent text-white shadow-[0_2px_0_var(--accent-lip)]' : 'bg-sunken hover:bg-accent-soft'}`}>
                  {c.label}
                </button>
              ) : (
                <button key={c.value} type="button" role="option" aria-selected={chosen} disabled={c.disabled} onClick={() => pick(c.value)}
                  className="choice flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-40">
                  <span className="min-w-0 flex-1 text-h4">{c.label}</span>
                  {chosen && <Check className="size-6 shrink-0" aria-hidden />}
                </button>
              )
            })}
          </div>
        </Sheet>
      )}
    </Wrapper>
  )
}

/** A search box without a visible label (the placeholder says what it searches; the label is for screen readers). */
export function SearchField({ label, className = '', ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`input ${className}`}>
      <Search aria-hidden />
      <input type="search" enterKeyHint="search" aria-label={label} autoComplete="off" spellCheck={false} {...input} />
    </label>
  )
}
