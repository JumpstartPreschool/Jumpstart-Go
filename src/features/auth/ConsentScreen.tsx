import { useState, type ReactNode } from 'react'
import { Clock, Eye, Lock, MapPin, ShieldCheck, Users } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { Notice } from '../../ui/States'
import { supabase } from '../../lib/supabase'
import { CONSENT_VERSION, useSession } from './session'

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent [&_svg]:size-[22px]" aria-hidden>{icon}</span>
      <div>
        <h2 className="text-h4">{title}</h2>
        <p className="mt-0.5 text-body text-ink-2">{children}</p>
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
    <main className="gutter mx-auto w-full max-w-[calc(640px+2*var(--gutter))] pt-[max(32px,calc(env(safe-area-inset-top)+20px))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <Logo className="mx-auto h-12" />
      <div className="card page-in mt-6 rounded-2xl p-6 sm:p-8">
        <h1 className="text-h1">Before you start</h1>
        <p className="mt-2 text-lead text-ink-2">How Jumpstart looks after your family's information.</p>
        <ul className="mt-7 grid gap-6">
          <Point icon={<Users />} title="What we keep">
            Your name and contact details, your children's names, class and timings, and the people you choose to pick them up (name, phone, relation; never photos).
          </Point>
          <Point icon={<MapPin />} title="Location, only during a trip">
            The phone of the person doing a pickup or drop-off shares its location only while that trip is on, and only if they allow it. A child's location is never tracked.
          </Point>
          <Point icon={<Eye />} title="Who can see it">
            You see your own children. School staff see what they need to run the gate and keep records. The school sees a trip's location only until your child is handed over.
          </Point>
          <Point icon={<Clock />} title="How long we keep it">
            Trip records and routes for 30 days; attendance for this and last academic year; a log of sensitive actions for one year.
          </Point>
          <Point icon={<Lock />} title="Your say">
            Ask the school at any time to correct or remove your information.
          </Point>
        </ul>
        {error && <Notice tone="danger" className="mt-6">{error}</Notice>}
        <Button size="xl" className="mt-8 w-full" icon={<ShieldCheck />} loading={busy} onClick={() => void accept()}>
          I agree, continue
        </Button>
        <Button size="md" variant="quiet" className="mt-2 w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  )
}
