import { Link } from 'react-router'
import { useState, type ReactNode } from 'react'
import { ChevronDown, Clock, Eye, Lock, MapPin, ShieldCheck, Users } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { Notice } from '../../ui/States'
import { SignOutButton } from '../../ui/SignOutButton'
import { supabase } from '../../lib/supabase'
import { CONSENT_VERSION, useSession } from './session'

/** One point of the notice: its title and a one-line gist; tap to read it in full (nothing is hidden, only folded). */
function Point({ icon, title, gist, children }: { icon: ReactNode; title: string; gist: string; children: ReactNode }) {
  return (
    <li>
      <details className="group rounded-xl bg-sunken/60 open:bg-sunken">
        <summary className="flex cursor-pointer list-none items-center gap-3.5 p-3.5 [&::-webkit-details-marker]:hidden">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface [&_svg]:size-5" aria-hidden>{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-h4">{title}</span>
            <span className="block text-small font-semibold text-ink-2">{gist}</span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <p className="px-3.5 pb-3.5 pl-[68px] text-small text-ink-2">{children}</p>
      </details>
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
      return setError(e.code ? "The school's system couldn't do that. Try again, and call the school if it keeps happening." : "We couldn't save that. Check your connection and try again.")
    }
    await refresh()
    // The parent's Today page opens at the top, not at this page's scroll position (under the floating top bar).
    window.scrollTo({ top: 0 })
  }

  return (
    <main className="gutter mx-auto w-full max-w-[calc(640px+2*var(--gutter))] pt-[max(32px,calc(env(safe-area-inset-top)+20px))] pb-[max(28px,env(safe-area-inset-bottom))]">
      <Logo className="mx-auto h-12" />
      <div className="card page-in mt-6 rounded-2xl p-6 sm:p-8">
        <h1 className="text-h1">Before you start</h1>
        <p className="mt-2 text-body text-ink-2">How Jumpstart looks after your family's information. Tap any point to read it in full.</p>
        <ul className="mt-6 grid gap-2">
          <Point icon={<Users />} title="What we keep" gist="Names, contacts and pickup people. Never photos.">
            Your name and contact details, your children's names, class and timings, and the people you choose to pick them up (name, phone, relation; never photos).
          </Point>
          <Point icon={<MapPin />} title="Location" gist="Only someone you send may share it, and only you see it.">
            You, your family and the school never share or see your location. If you send someone else to collect with a one-time link, they can choose to share where they are on the way, and only you see it. A child's location is never tracked.
          </Point>
          <Point icon={<Eye />} title="Who can see it" gist="You see your children; staff see what the gate needs.">
            You see your own children. School staff see what they need to run the gate and keep records, but never anyone's location. Gate announcements, names included, are made on the school's own computer; no outside voice service hears them.
          </Point>
          <Point icon={<Clock />} title="How long we keep it" gist="Trips 30 days, attendance two years.">
            Trip records and routes for 30 days; attendance for this and last academic year; a log of sensitive actions for one year.
          </Point>
          <Point icon={<Lock />} title="Your say" gist="Ask the school to correct or remove anything.">
            Ask the school at any time to correct or remove your information.
          </Point>
        </ul>
        <p className="mt-5 text-small font-semibold text-ink-2">The full <Link to="/privacy" className="linkbtn px-0">Privacy Policy</Link> and <Link to="/terms" className="linkbtn px-0">Terms of Use</Link> say more.</p>
        {error && <Notice tone="danger" className="mt-6">{error}</Notice>}
        <Button size="xl" className="mt-6 w-full" icon={<ShieldCheck />} loading={busy} onClick={() => void accept()}>
          I agree, continue
        </Button>
        <SignOutButton className="mt-2.5" onClick={() => void signOut()} />
      </div>
    </main>
  )
}
