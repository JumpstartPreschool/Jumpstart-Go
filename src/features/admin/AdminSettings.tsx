import { useEffect, useState, type ReactNode } from 'react'
import { Lock, Phone, Save } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { ErrorState, Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatMobile } from '../../domain/contact'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import { explainDbError } from './api'

interface Settings { get_ready_lead_min: number; late_threshold_min: number; school_phone: string | null }

function Row({ title, children, control }: { title: string; children: ReactNode; control: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="text-h4">{title}</p>
        <p className="text-small font-semibold text-ink-2">{children}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{control}</div>
    </div>
  )
}

/**
 * Admin → Settings (Screen Book v3, ADM-2): the few things the school tunes. Timing rules that are the school's own
 * (the 15-minute windows, school hours) are shown locked. Every change is written to the audit log by the database.
 */
export function AdminSettings() {
  const toast = useToast()
  const [s, setS] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    setError(null)
    void supabase.from('settings').select('get_ready_lead_min, late_threshold_min, school_phone').single().then(({ data, error: e }) => {
      if (e) return setError(explainDbError(e))
      setS(data as Settings)
      setPhone(data?.school_phone ? formatMobile(data.school_phone) : '')
    })
  }
  useEffect(load, [])

  async function save(patch: Partial<Settings>, key: string) {
    setBusy(key)
    try {
      const { error: e } = await supabase.from('settings').update(patch).eq('id', true)
      if (e) throw e
      setS((x) => (x ? { ...x, ...patch } : x))
      toast('Saved.')
    } catch (e) {
      toast(explainDbError(e as { code?: string; message?: string }))
    } finally {
      setBusy(null)
    }
  }

  function savePhone() {
    // The number parents and the person collecting call: any Indian number, landline or mobile, stored as +91 and 10 digits.
    const d = phone.replace(/\D/g, '').replace(/^(0091|91(?=\d{10}$)|0)/, '')
    const v = /^[1-9]\d{9}$/.test(d) ? `+91${d}` : null
    if (!v) return setPhoneError('Enter a 10-digit Indian number, for example 020 2545 1234.')
    setPhoneError(null)
    void save({ school_phone: v }, 'phone')
  }

  const chips = (key: 'get_ready_lead_min' | 'late_threshold_min') => (
    <div className="flex gap-2" role="radiogroup" aria-label={key === 'get_ready_lead_min' ? 'Get ready reminder' : 'Running-late alert'}>
      {[5, 10, 15].map((v) => (
        <button key={v} type="button" role="radio" aria-checked={s?.[key] === v} disabled={busy === key} onClick={() => s?.[key] !== v && void save({ [key]: v }, key)}
          className="choice h-12 min-w-[84px] px-4 text-h4 tabular-nums">{v} min</button>
      ))}
    </div>
  )
  const locked = (t: string) => <Pill icon={<Lock />}>{t}</Pill>

  return (
    <AreaShell area="admin" title="Settings" subtitle="Changes apply at once and are written to the audit log.">
      <section className="mt-6">
        {error ? <ErrorState title="Couldn't load the settings" onRetry={load}>{error}</ErrorState> : !s ? (
          <div className="card h-[420px] animate-pulse rounded-2xl" aria-label="Loading" />
        ) : (
          <div className="card divide-y divide-line rounded-2xl p-5 sm:p-6">
            <Row title={'"Get ready" reminder'} control={chips('get_ready_lead_min')}>Coordinators hear it this long before the time someone arrives.</Row>
            <Row title="Running-late alert" control={chips('late_threshold_min')}>When someone will be at least this late, or the time passes this far with nobody here.</Row>
            <Row title="Drop-off window" control={locked('School rule')}>Opens 15 minutes before each class starts. Jr KG Half day: 8:45 to 9:00 AM.</Row>
            <Row title="Pickup window" control={locked('School rule')}>Runs until 15 minutes after each class ends. Jr KG Half day: 1:00 to 1:15 PM.</Row>
            <Row title="Extended day" control={locked('School rule')}>360°+ and the Learning Center: in school for the core hours, then collected any time until 7:00 PM.</Row>
            <Row title="School hours" control={locked('Fixed')}>9:00 AM to 7:00 PM. The gate opens at 8:45 AM and closes at 7:15 PM.</Row>
            <Row title="Call the school number" control={
              <form className="flex w-full items-center gap-2" onSubmit={(e) => { e.preventDefault(); savePhone() }}>
                <label className="input min-w-0 flex-1 sm:w-[210px] sm:flex-none"><Phone aria-hidden /><input type="tel" inputMode="tel" aria-label="Call the school number" value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneError(null) }} placeholder="020 2545 1234" /></label>
                <Button type="submit" size="md" variant="secondary" icon={<Save />} loading={busy === 'phone'}>Save</Button>
              </form>
            }>Shown to parents, and on the page of someone collecting a child.</Row>
            {phoneError && <Notice tone="danger" className="mt-1">{phoneError}</Notice>}
          </div>
        )}
      </section>
    </AreaShell>
  )
}
