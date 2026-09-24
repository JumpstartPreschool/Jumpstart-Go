import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ChevronDown, CircleAlert, Search } from 'lucide-react'

type Extra = { label: string; hint?: ReactNode; error?: string | null; icon?: ReactNode }

/** Label above, the control, then either the error (announced) or a hint below. */
function Wrapper({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
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

export function SelectField({ label, hint, error, icon, children, className = '', ...select }: SelectHTMLAttributes<HTMLSelectElement> & Extra) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <div className={`input ${className}`}>
        {icon}
        <select id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} {...select}>
          {children}
        </select>
        <ChevronDown aria-hidden />
      </div>
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
