import { useId, useState } from 'react'
import { Check, ChevronDown, CircleAlert, Search } from '../../ui/icons'
import { Sheet } from '../../ui/Sheet'
import { COUNTRIES, formatRest, nationalPart, type Country } from '../../domain/countries'

/**
 * The sign-in mobile number: the country code fixed at +91, with a picker of every country for numbers outside India,
 * and only the digits after it typed here. India takes exactly 10 digits.
 */
export function PhoneField({ country, onCountry, value, onChange, error }: {
  country: Country; onCountry: (c: Country) => void; value: string; onChange: (v: string) => void; error: string | null
}) {
  const id = useId()
  const [picking, setPicking] = useState(false)
  const india = country.iso === 'IN'
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-center text-small font-bold text-ink-2">Mobile number</label>
      <div className="input pl-1.5!">
        <button type="button" onClick={() => setPicking(true)} aria-haspopup="dialog" aria-label={`Country code: ${country.name}, +${country.dial}. Change`}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[17px] font-bold tabular-nums transition-colors duration-150 hover:bg-sunken active:bg-sunken">
          <span className="text-[20px] leading-none" aria-hidden>{country.flag}</span>
          <span>+{country.dial}</span>
          <ChevronDown className="size-4 text-ink-3" aria-hidden />
        </button>
        <span className="h-6 w-px shrink-0 bg-line-2" aria-hidden />
        <input id={id} name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" enterKeyHint="send" autoFocus
          placeholder={india ? '98765 43210' : 'Mobile number'} value={value}
          onChange={(e) => {
            // A leading 0 or the country code is taken off as they type or paste (nationalPart): never "retype it".
            const digits = nationalPart(country, e.target.value)
            onChange(india && digits.length <= 10 ? formatRest(country, digits) : digits)
          }}
          className="tabular-nums tracking-[0.02em]"
          aria-invalid={!!error || undefined} aria-describedby={`${id}-msg`} />
      </div>
      {error ? (
        <p id={`${id}-msg`} className="flex items-start justify-center gap-1.5 text-center text-small font-bold text-danger" role="alert">
          <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />{error}
        </p>
      ) : (
        <p id={`${id}-msg`} className="text-center text-caption font-semibold text-ink-2">
          {india ? 'Outside India? Tap +91 to choose your country.' : `Type the number without +${country.dial}.`}
        </p>
      )}
      {picking && <CountrySheet current={country} onClose={() => setPicking(false)} onPick={(c) => { onCountry(c); setPicking(false) }} />}
    </div>
  )
}

function CountrySheet({ current, onClose, onPick }: { current: Country; onClose: () => void; onPick: (c: Country) => void }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase().replace(/^\+/, '')
  const shown = term ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(term) || c.dial.startsWith(term) || c.iso.toLowerCase() === term) : COUNTRIES
  return (
    <Sheet open onClose={onClose} title="Your country" description="The code goes in front of your mobile number.">
      <div className="input mb-3">
        <Search aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a country or code" aria-label="Search a country or code" autoComplete="off" />
      </div>
      <ul role="listbox" aria-label="Countries" className="grid gap-1">
        {shown.map((c) => {
          const chosen = c.iso === current.iso
          return (
            <li key={c.iso}>
              <button type="button" role="option" aria-selected={chosen} onClick={() => onPick(c)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-[12px] px-3 text-left transition-colors duration-150 hover:bg-sunken ${chosen ? 'bg-accent-soft' : ''}`}>
                <span className="text-[22px] leading-none" aria-hidden>{c.flag}</span>
                <span className="min-w-0 flex-1 truncate text-body font-semibold">{c.name}</span>
                <span className="text-small font-bold tabular-nums text-ink-2">+{c.dial}</span>
                {chosen && <Check className="size-5 text-accent" aria-hidden />}
              </button>
            </li>
          )
        })}
        {!shown.length && <li className="px-3 py-4 text-center text-small font-semibold text-ink-2">No country matches “{q.trim()}”.</li>}
      </ul>
    </Sheet>
  )
}
