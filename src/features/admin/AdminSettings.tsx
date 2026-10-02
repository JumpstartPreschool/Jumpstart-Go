import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, CircleCheck, Globe, Lock, Mail, Phone, Save, TriangleAlert } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { ErrorState, Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatMobile } from '../../domain/contact'
import { supabase } from '../../lib/supabase'
import { AreaShell } from '../auth/AreaShell'
import { checkEmailSetup, explainDbError, type EmailSetup } from './api'
import { PronunciationList } from './PronunciationList'

interface Settings { get_ready_lead_min: number; late_threshold_min: number; school_phone: string | null; app_url: string | null }

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
 * Admin → Settings (Screen Book v3, ADM-2): the few things the school tunes. School hours are shown locked; each
 * programme's drop-off and pickup are set in People → Classes (D35). Every change is written to the audit log.
 */
export function AdminSettings() {
  const toast = useToast()
  const [s, setS] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [emailCheck, setEmailCheck] = useState<EmailSetup | null>(null)
  async function checkEmail() {
    setBusy('email')
    setEmailCheck(await checkEmailSetup())
    setBusy(null)
  }

  // A load that finishes after a newer one (or after leaving) is dropped, so a late reply never overwrites what the
  // admin is typing.
  const current = useRef(0)
  const load = () => {
    const mine = ++current.current
    setError(null)
    void supabase.from('settings').select('get_ready_lead_min, late_threshold_min, school_phone, app_url').single().then(({ data, error: e }) => {
      if (mine !== current.current) return
      if (e) return setError(explainDbError(e))
      setS(data as Settings)
      setPhone(data?.school_phone ? formatMobile(data.school_phone) : '')
      setUrl(data?.app_url ?? '')
    })
  }
  useEffect(() => { load(); return () => { current.current++ } }, [])

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

  function saveUrl() {
    // The address in invitations (D36): https only, no trailing slash, like https://app.jumpstartpreschool.in.
    let v = url.trim().replace(/\/+$/, '')
    if (v && !/^[a-z]+:\/\//i.test(v)) v = `https://${v}`
    if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/\S*)?$/.test(v)) return setUrlError('Enter the https address people open the app at, like https://app.jumpstartpreschool.in.')
    setUrlError(null)
    setUrl(v)
    void save({ app_url: v }, 'url')
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
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
      <section>
        {error ? <ErrorState title="Couldn't load the settings" onRetry={load}>{error}</ErrorState> : !s ? (
          <div className="card h-[420px] animate-pulse rounded-2xl" aria-label="Loading" />
        ) : (
          <div className="card divide-y divide-line rounded-2xl p-5 sm:p-6">
            <Row title={'"Get ready" reminder'} control={chips('get_ready_lead_min')}>The gate team hears it this long before the time someone arrives.</Row>
            <Row title="Running-late alert" control={chips('late_threshold_min')}>When someone will be at least this late, or the time passes this far with nobody here.</Row>
            <Row title="Drop-off and pickup times" control={<Link to="/admin" className="btn btn--secondary btn--md">Classes<ChevronRight aria-hidden /></Link>}>Set for each programme in People → Classes. New ones start 15 minutes either side of the class.</Row>
            <Row title="School hours" control={locked('Fixed')}>9:00 AM to 7:00 PM. Parents can set a drop-off or pickup for any time.</Row>
            <Row title="Call the school number" control={
              <form className="flex w-full items-center gap-2" onSubmit={(e) => { e.preventDefault(); savePhone() }}>
                <label className="input min-w-0 flex-1 sm:w-[210px] sm:flex-none"><Phone aria-hidden /><input type="tel" inputMode="tel" aria-label="Call the school number" value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneError(null) }} placeholder="020 2545 1234" /></label>
                <Button type="submit" size="md" variant="secondary" icon={<Save />} loading={busy === 'phone'} aria-label="Save the school number">Save</Button>
              </form>
            }>Shown to parents, and on the page of someone collecting a child.</Row>
            {phoneError && <Notice tone="danger" className="mt-1">{phoneError}</Notice>}
            <Row title="App web address" control={
              <form noValidate className="flex w-full items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveUrl() }}>
                <label className="input min-w-0 flex-1 sm:w-[260px] sm:flex-none"><Globe aria-hidden /><input type="url" inputMode="url" autoCapitalize="none" spellCheck={false} aria-label="App web address" value={url} onChange={(e) => { setUrl(e.target.value); setUrlError(null) }} placeholder="https://app.jumpstartpreschool.in" /></label>
                <Button type="submit" size="md" variant="secondary" icon={<Save />} loading={busy === 'url'} aria-label="Save the web address">Save</Button>
              </form>
            }>The link in invitations. Invites can't be sent until it's set.</Row>
            {urlError && <Notice tone="danger" className="mt-1">{urlError}</Notice>}
            <Row title="Invitation emails" control={<Button size="md" variant="secondary" icon={<Mail />} loading={busy === 'email'} onClick={() => void checkEmail()}>Check email setup</Button>}>
              Asks Brevo whether invitations can be sent, without sending one.
            </Row>
            {emailCheck && (() => {
              const ok = emailCheck.key === 'ok' && emailCheck.sender === 'verified'
              return <Notice tone={ok ? 'success' : 'danger'} icon={ok ? <CircleCheck aria-hidden /> : <TriangleAlert aria-hidden />} className="mt-1"><span>{emailCheck.error ?? emailCheck.message}{emailCheck.detail && <span className="mt-1 block text-caption font-semibold opacity-80">{emailCheck.detail}</span>}</span></Notice>
            })()}
          </div>
        )}
      </section>
      <PronunciationList />
      </div>
    </AreaShell>
  )
}
