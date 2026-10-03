import { useId, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { CircleAlert, Lock } from '../../ui/icons'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; hint?: string; error?: string | null }

/** A password with Show built in, so people on a phone can check what they typed. Paste and password managers work. */
export function PasswordField({ label, hint, error, ...input }: Props) {
  const id = useId()
  const [shown, setShown] = useState(false)
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="px-0.5 text-small font-bold text-ink-2">{label}</label>
      <div className="input">
        <Lock aria-hidden />
        <input id={id} type={shown ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} {...input} />
        <button type="button" className="input__reveal" aria-pressed={shown} aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((s) => !s)}>
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      </div>
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
