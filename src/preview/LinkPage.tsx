import { lazy, Suspense, useState, type ReactNode } from 'react'
import { CircleCheck, Clock, KeyRound, MapPin, MonitorSmartphone, ShieldCheck, Timer } from 'lucide-react'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { FreshnessBadge } from '../ui/FreshnessBadge'
import { PhoneColumn } from './PreviewShell'
import { SAMPLE_CODE, SAMPLE_PROGRESS_INDEX, SAMPLE_ROUTE, SCHOOL } from './sample'

const TripMap = lazy(() => import('../ui/TripMap'))

type Step = 'invite' | 'location' | 'travelling' | 'gate' | 'home' | 'done'

function Bullet({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-[16px] leading-6">
      <span className="mt-0.5 text-accent [&_svg]:size-5" aria-hidden>{icon}</span>
      <span>{children}</span>
    </li>
  )
}

/** The third person's one page (J8): large text, one action per step, no login or install. */
export function LinkPage() {
  const [step, setStep] = useState<Step>('invite')

  if (step === 'travelling' || step === 'home') {
    const toSchool = step === 'travelling'
    return (
      <PhoneColumn className="flex flex-col">
        <div className="relative h-[42dvh] shrink-0 md:h-[360px]">
          <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
            <TripMap className="absolute inset-0" route={SAMPLE_ROUTE} progressIndex={SAMPLE_PROGRESS_INDEX} position={SAMPLE_ROUTE[SAMPLE_PROGRESS_INDEX] ?? null}
              freshness="live" destination={SCHOOL.position} padding={{ top: 90, bottom: 40, left: 40, right: 40 }} />
          </Suspense>
        </div>
        <div className="-mt-6 flex-1 rounded-t-[28px] bg-canvas px-5 pt-5 pb-[max(24px,env(safe-area-inset-bottom))] relative">
          <p className="flex items-center gap-2 rounded-[14px] bg-recent-soft px-3.5 py-2.5 text-[15px] font-semibold text-recent">
            <MonitorSmartphone className="size-5 shrink-0" aria-hidden /> Keep this page open so Sneha can see you're on the way.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-[15px] text-ink-2">{toSchool ? 'To Jumpstart, Karve Road' : 'Taking Aarav home'}</p>
              <p className="text-[30px] font-semibold tabular-nums tracking-[-0.02em]">{toSchool ? 'about 3–5 min' : 'Drive safely'}</p>
            </div>
            <FreshnessBadge state="live" />
          </div>
          {toSchool ? (
            <>
              <div className="mt-4 rounded-[22px] bg-surface p-5 text-center shadow-1 ring-1 ring-line">
                <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-2"><KeyRound className="size-4" aria-hidden /> Your handoff code</p>
                <p className="mt-1 text-[48px] font-semibold leading-[56px] tabular-nums tracking-[0.3em]">{SAMPLE_CODE}</p>
                <p className="text-[15px] text-ink-2">Show this to the staff at the gate.</p>
              </div>
              <Button size="xl" className="mt-4 w-full" onClick={() => setStep('gate')}>I'm at the gate</Button>
              <Button size="lg" variant="secondary" className="mt-2.5 w-full" icon={<Timer />}>Running late</Button>
            </>
          ) : (
            <Button size="xl" className="mt-6 w-full" icon={<CircleCheck />} onClick={() => setStep('done')}>Reached home</Button>
          )}
        </div>
      </PhoneColumn>
    )
  }

  return (
    <PhoneColumn>
      <div className="flex min-h-dvh flex-col px-6 pt-[max(64px,calc(env(safe-area-inset-top)+52px))] pb-[max(28px,env(safe-area-inset-bottom))] md:min-h-[860px]">
        {/* A stranger opens this from WhatsApp: the real logo is the first sign it's from the school. */}
        <div className="flex flex-col items-start gap-1.5">
          <Logo className="h-12" />
          <p className="text-[14px] font-semibold text-ink-2">Preschool &amp; Learning Center · Karve Road</p>
        </div>

        {step === 'invite' && (
          <>
            <h1 className="mt-8 text-[34px] font-semibold leading-10 tracking-[-0.02em]">Pick up Aarav K.</h1>
            <p className="mt-2 text-[18px] leading-7 text-ink-2">Sneha (his mother) has asked you to collect Aarav from school today.</p>
            <div className="mt-6 rounded-[22px] bg-surface p-5 shadow-1 ring-1 ring-line">
              <p className="flex items-center gap-2.5 text-[18px] font-semibold"><Clock className="size-5 text-accent" aria-hidden /> Today at 12:45 PM</p>
              <p className="mt-3 flex items-start gap-2.5 text-[16px] leading-6"><MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden /> Jumpstart Preschool, 11/7 Matoshri, Karve Road, Erandwane</p>
            </div>
            <ul className="mt-6 grid gap-3">
              <Bullet icon={<KeyRound />}>You'll get a 4-digit code to show at the gate.</Bullet>
              <Bullet icon={<ShieldCheck />}>This link works only on your phone, and only for this pickup.</Bullet>
            </ul>
            <Button size="xl" className="mt-auto w-full" onClick={() => setStep('location')}>Confirm I'll pick up Aarav</Button>
          </>
        )}

        {step === 'location' && (
          <>
            <div className="mt-10 grid size-16 place-items-center rounded-full bg-accent/10 text-accent"><MapPin className="size-8" aria-hidden /></div>
            <h1 className="mt-6 text-[30px] font-semibold leading-9 tracking-[-0.02em]">Share your location for this trip</h1>
            <ul className="mt-5 grid gap-3">
              <Bullet icon={<CircleCheck />}>Sneha sees where you are, so she knows Aarav is safe.</Bullet>
              <Bullet icon={<CircleCheck />}>The school sees it only until Aarav is handed over.</Bullet>
              <Bullet icon={<CircleCheck />}>Sharing stops by itself when the trip ends.</Bullet>
            </ul>
            <div className="mt-auto grid gap-2.5">
              <Button size="xl" icon={<MapPin />} onClick={() => setStep('travelling')}>Allow location</Button>
              <Button size="md" variant="quiet" onClick={() => setStep('travelling')}>Continue without location</Button>
            </div>
          </>
        )}

        {step === 'gate' && (
          <>
            <h1 className="mt-10 text-center text-[24px] font-semibold">Show this code at the gate</h1>
            <p className="mt-2 text-center text-[17px] text-ink-2">Pickup for Aarav K.</p>
            <p className="my-auto text-center text-[88px] font-semibold leading-none tabular-nums tracking-[0.18em]">{SAMPLE_CODE}</p>
            <p className="text-center text-[13px] text-ink-2">Preview: the next step starts when the coordinator taps Handed over.</p>
            <Button size="lg" variant="secondary" className="mt-3 w-full" onClick={() => setStep('home')}>Preview next step</Button>
          </>
        )}

        {step === 'done' && (
          <div className="my-auto text-center">
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-live-soft text-live"><CircleCheck className="size-10" aria-hidden /></div>
            <h1 className="mt-6 text-[30px] font-semibold tracking-[-0.02em]">Thank you, Ramesh</h1>
            <p className="mt-2 text-[18px] leading-7 text-ink-2">Sneha has been told Aarav is home. Location sharing has stopped, and this link no longer works.</p>
            <Button size="md" variant="quiet" className="mt-8" onClick={() => setStep('invite')}>Restart preview</Button>
          </div>
        )}
      </div>
    </PhoneColumn>
  )
}
