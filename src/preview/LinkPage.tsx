import { lazy, Suspense, useState, type ReactNode } from 'react'
import { CircleCheck, Clock, KeyRound, MapPin, MonitorSmartphone, ShieldCheck, Timer } from 'lucide-react'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { Mascot } from '../ui/Backdrop'
import { CodeTiles } from '../ui/CodeTiles'
import { FreshnessBadge } from '../ui/FreshnessBadge'
import { PreviewRibbon } from './PreviewShell'
import { SAMPLE_CODE, SAMPLE_PROGRESS_INDEX, SAMPLE_ROUTE, SCHOOL } from './sample'

const TripMap = lazy(() => import('../ui/TripMap'))

type Step = 'invite' | 'location' | 'travelling' | 'gate' | 'home' | 'done'

function Bullet({ icon, color, children }: { icon: ReactNode; color: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3.5 text-[17px] font-semibold leading-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl [&_svg]:size-5" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }} aria-hidden>{icon}</span>
      <span className="pt-2">{children}</span>
    </li>
  )
}

/** Centred column that reads well on a phone and still looks deliberate on an iPad. */
function Column({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <PreviewRibbon />
      <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-5 pt-[max(60px,calc(env(safe-area-inset-top)+48px))] pb-[max(24px,env(safe-area-inset-bottom))] md:justify-center">
        {children}
      </main>
    </div>
  )
}

/** The third person's one page (J8): large text, one action per step, no login or install. */
export function LinkPage() {
  const [step, setStep] = useState<Step>('invite')

  if (step === 'travelling' || step === 'home') {
    const toSchool = step === 'travelling'
    return (
      <Column>
        <div className="relative h-[40dvh] min-h-[260px] overflow-hidden rounded-[32px] ring-1 ring-line md:h-[360px]">
          <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
            <TripMap className="absolute inset-0" route={SAMPLE_ROUTE} progressIndex={SAMPLE_PROGRESS_INDEX} position={SAMPLE_ROUTE[SAMPLE_PROGRESS_INDEX] ?? null}
              freshness="live" destination={SCHOOL.position} padding={{ top: 50, bottom: 40, left: 40, right: 40 }} />
          </Suspense>
        </div>
        <p className="mt-4 flex items-center gap-3 rounded-[22px] bg-recent-soft px-4 py-3 text-[16px] font-extrabold text-recent">
          <MonitorSmartphone className="size-6 shrink-0" aria-hidden /> Keep this page open so Sneha can see you're on the way.
        </p>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-[14px] font-extrabold uppercase tracking-[0.07em] text-ink-2">{toSchool ? 'To Jumpstart, Karve Road' : 'Taking Aarav home'}</p>
            <p className="font-display text-[38px] font-bold leading-[44px] tabular-nums">{toSchool ? 'about 3–5 min' : 'Drive safely'}</p>
          </div>
          <FreshnessBadge state="live" />
        </div>
        {toSchool ? (
          <>
            <div className="card mt-4 rounded-[30px] p-5 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-2"><KeyRound className="size-4" aria-hidden /> Your handoff code</p>
              <div className="mt-3"><CodeTiles code={SAMPLE_CODE} /></div>
              <p className="mt-3 text-[15px] font-semibold text-ink-2">Show this to the staff at the gate.</p>
            </div>
            <Button size="xl" className="mt-5 w-full" onClick={() => setStep('gate')}>I'm at the gate</Button>
            <Button size="lg" variant="sunshine" className="mt-3 w-full" icon={<Timer />}>Running late</Button>
          </>
        ) : (
          <Button size="xl" className="mt-6 w-full" icon={<CircleCheck />} onClick={() => setStep('done')}>Reached home</Button>
        )}
      </Column>
    )
  }

  return (
    <Column>
      {/* A stranger opens this from WhatsApp: the real logo is the first sign it's from the school. */}
      <div className="flex flex-col items-center text-center">
        <Logo className="h-14" />
        <p className="mt-1.5 text-[14px] font-extrabold text-ink-2">Preschool &amp; Learning Center · Karve Road</p>
      </div>

      {step === 'invite' && (
        <>
          <div className="card relative mt-7 overflow-hidden rounded-[34px] p-6 text-center">
            <span className="rainbow-bar absolute inset-x-0 top-0 h-1.5" aria-hidden />
            <Mascot size={112} className="mx-auto" />
            <h1 className="mt-1 text-[38px] font-bold leading-[42px]">Pick up Aarav K.</h1>
            <p className="mt-2 text-[18px] font-semibold leading-7 text-ink-2">Sneha (his mother) has asked you to collect Aarav from school today.</p>
            <div className="mt-5 grid gap-2.5 text-left">
              <p className="flex items-center gap-3 rounded-[20px] bg-sunken px-4 py-3 text-[18px] font-extrabold"><Clock className="size-6 text-accent-ink" aria-hidden /> Today at 12:45 PM</p>
              <p className="flex items-start gap-3 rounded-[20px] bg-sunken px-4 py-3 text-[16px] font-bold leading-6"><MapPin className="mt-0.5 size-6 shrink-0 text-rb-red" aria-hidden /> Jumpstart Preschool, 11/7 Matoshri, Karve Road, Erandwane</p>
            </div>
          </div>
          <ul className="mt-6 grid gap-3">
            <Bullet icon={<KeyRound />} color="var(--rb-orange)">You'll get a 4-digit code to show at the gate.</Bullet>
            <Bullet icon={<ShieldCheck />} color="var(--rb-green)">This link works only on your phone, and only for this pickup.</Bullet>
          </ul>
          <Button size="xl" className="mt-8 w-full md:mt-10" onClick={() => setStep('location')}>Confirm I'll pick up Aarav</Button>
        </>
      )}

      {step === 'location' && (
        <>
          <div className="card mt-7 rounded-[34px] p-6">
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-[linear-gradient(135deg,var(--rb-teal),var(--rb-blue))] text-white shadow-[0_14px_30px_-12px_var(--rb-blue)]"><MapPin className="size-10" aria-hidden /></div>
            <h1 className="mt-5 text-center text-[32px] font-bold leading-9">Share your location for this trip</h1>
            <ul className="mt-5 grid gap-3">
              <Bullet icon={<CircleCheck />} color="var(--rb-blue)">Sneha sees where you are, so she knows Aarav is safe.</Bullet>
              <Bullet icon={<CircleCheck />} color="var(--rb-green)">The school sees it only until Aarav is handed over.</Bullet>
              <Bullet icon={<CircleCheck />} color="var(--rb-orange)">Sharing stops by itself when the trip ends.</Bullet>
            </ul>
          </div>
          <div className="mt-8 grid gap-2.5">
            <Button size="xl" icon={<MapPin />} onClick={() => setStep('travelling')}>Allow location</Button>
            <Button size="md" variant="quiet" onClick={() => setStep('travelling')}>Continue without location</Button>
          </div>
        </>
      )}

      {step === 'gate' && (
        <div className="card mt-7 rounded-[34px] p-7 text-center">
          <h1 className="text-[28px] font-bold">Show this code at the gate</h1>
          <p className="mt-1 text-[17px] font-semibold text-ink-2">Pickup for Aarav K.</p>
          <div className="my-8"><CodeTiles code={SAMPLE_CODE} size="xl" /></div>
          <p className="text-[13px] font-semibold text-ink-2">Preview: the next step starts when the coordinator taps Handed over.</p>
          <Button size="lg" variant="secondary" className="mt-3 w-full" onClick={() => setStep('home')}>Preview next step</Button>
        </div>
      )}

      {step === 'done' && (
        <div className="card mt-7 rounded-[34px] p-8 text-center">
          <Mascot size={150} className="mx-auto" />
          <h1 className="mt-2 text-[36px] font-bold">Thank you, Ramesh!</h1>
          <p className="mt-2 text-[18px] font-semibold leading-7 text-ink-2">Sneha has been told Aarav is home. Location sharing has stopped, and this link no longer works.</p>
          <Button size="md" variant="quiet" className="mt-6" onClick={() => setStep('invite')}>Restart preview</Button>
        </div>
      )}
    </Column>
  )
}
