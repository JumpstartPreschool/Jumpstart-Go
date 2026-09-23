import { useState, type ReactNode } from 'react'
import { Clock, Eye, Lock, MapPin, ShieldCheck, Users } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { supabase } from '../../lib/supabase'
import { CONSENT_VERSION, useSession } from './session'

function Point({ icon, color, title, children }: { icon: ReactNode; color: string; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-6" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }} aria-hidden>{icon}</span>
      <div>
        <p className="text-[17px] font-extrabold">{title}</p>
        <p className="mt-0.5 text-[15px] font-semibold leading-[22px] text-ink-2">{children}</p>
      </div>
    </li>
  )
}

/** Shown to parents on first login and whenever the notice changes (AUTH-6, PRD D8–D9). */
export function ConsentScreen() {
  const { refresh, signOut } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.rpc('accept_consent', { p_version: CONSENT_VERSION })
    if (e) {
      setBusy(false)
      return setError("We couldn't save that. Check your connection and try again.")
    }
    await refresh()
  }

  return (
    <main className="mx-auto w-full max-w-[640px] px-5 pt-[max(40px,calc(env(safe-area-inset-top)+24px))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <Logo className="mx-auto h-12" />
      <div className="card relative mt-6 overflow-hidden rounded-[34px] p-6 sm:p-8">
        <span className="rainbow-bar absolute inset-x-0 top-0 h-1.5" aria-hidden />
        <h1 className="text-[32px] font-bold leading-9">Before you start</h1>
        <p className="mt-2 text-[17px] font-semibold leading-6 text-ink-2">How Jumpstart looks after your family's information.</p>
        <ul className="mt-6 grid gap-5">
          <Point icon={<Users />} color="var(--rb-blue)" title="What we keep">
            Your name and contact details, your children's names, class and timings, and the people you choose to pick them up (name, phone, relation; never photos).
          </Point>
          <Point icon={<MapPin />} color="var(--rb-green)" title="Location, only during a trip">
            The phone of the person doing a pickup or drop-off shares its location only while that trip is on, and only if they allow it. A child's location is never tracked.
          </Point>
          <Point icon={<Eye />} color="var(--rb-orange)" title="Who can see it">
            You see your own children. School staff see what they need to run the gate and keep records. The school sees a trip's location only until your child is handed over.
          </Point>
          <Point icon={<Clock />} color="var(--rb-violet)" title="How long we keep it">
            Trip records and routes for 30 days; attendance for this and last academic year; a log of sensitive actions for one year.
          </Point>
          <Point icon={<Lock />} color="var(--rb-red)" title="Your say">
            Ask the school at any time to correct or remove your information.
          </Point>
        </ul>
        {error && <p className="mt-5 text-[15px] font-bold text-danger" role="alert">{error}</p>}
        <Button size="xl" className="mt-7 w-full" icon={<ShieldCheck />} loading={busy} onClick={() => void accept()}>
          I agree, continue
        </Button>
        <Button size="md" variant="quiet" className="mt-2 w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  )
}
