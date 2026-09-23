import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

const control =
  'card h-14 w-full rounded-[20px] px-4 text-[17px] font-semibold text-ink placeholder:text-ink-3 ' +
  'outline-none transition-shadow focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_45%,transparent)] ' +
  'aria-[invalid=true]:shadow-[0_0_0_2px_var(--danger)] disabled:opacity-50'

function Wrapper({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block px-1 text-[14px] font-extrabold text-ink-2">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="mt-1.5 px-1 text-[14px] font-bold text-danger" role="alert">{error}</p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1.5 px-1 text-[13px] font-semibold text-ink-2">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextField({ label, hint, error, className = '', ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <input id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} className={`${control} ${className}`} {...input} />
    </Wrapper>
  )
}

export function SelectField({ label, hint, error, children, className = '', ...select }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <select id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} className={`${control} appearance-none bg-[length:20px] ${className}`} {...select}>
        {children}
      </select>
    </Wrapper>
  )
}
