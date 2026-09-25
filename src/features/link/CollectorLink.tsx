import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router'
import { Check, CircleCheck, Clock, FlaskConical, Hand, House, KeyRound, Link2, Lock, MapPin, MonitorSmartphone, Navigation, Phone, RotateCcw, ShieldCheck, Timer } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { CodeTiles } from '../../ui/CodeTiles'
import { Logo, Mascot } from '../../ui/Logo'
import { Pill } from '../../ui/Pill'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { formatTime, indiaClock } from '../../domain/time'
import { DEMO_AVAILABLE, enterDemo, isDemo } from '../../demo/demo'
import { explainTripError } from '../trips/api'
import { clockTime } from '../trips/rules'
import { distanceM, formatDistance, SCHOOL, type Point } from '../trips/geo'
import { linkConfirm, linkHome, linkLate, linkOpen, linkShare, linkStatus, locationHelp, useSendLocation, useSimulatedTrip, type LinkSummary } from '../trips/tracking'

const TripMap = lazy(() => import('../../ui/TripMap'))

type Load =
  | { kind: 'loading' }
  | { kind: 'ended'; reason: 'expired' | 'in_use' }
  | { kind: 'offline' }
  | { kind: 'open'; link: LinkSummary; mine: boolean }

/** What this phone remembers about the trip (the server keeps the rest): whether they chose location, and started. */
interface Local { loc: boolean | null; started: boolean; atGate: boolean; closed: boolean }
const localKey = (token: string) => `jumpstart-link:${token.slice(-12)}`
function readLocal(token: string): Local {
  try {
    return { loc: null, started: false, atGate: false, closed: false, ...(JSON.parse(localStorage.getItem(localKey(token)) ?? '{}') as Partial<Local>) }
  } catch {
    return { loc: null, started: false, atGate: false, closed: false }
  }
}

const errCode = (e: unknown) => String((e as { message?: string } | null)?.message ?? '').split(':')[0]

/** The trip behind the link, checked every 10 s (this page has no sign-in, so no live connection) and on return. */
function useLink(token: string) {
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const load = useCallback(async () => {
    try {
      setState({ kind: 'open', link: await linkStatus(token), mine: true })
    } catch (e) {
      if (errCode(e) !== 'link_expired') return setState((s) => (s.kind === 'open' ? s : { kind: 'offline' }))
      try {
        const link = await linkOpen(token)
        // Alive, but this phone can't read it: either not confirmed yet, or confirmed on another phone.
        setState(link.confirmed ? { kind: 'ended', reason: 'in_use' } : { kind: 'open', link, mine: false })
      } catch (e2) {
        setState(errCode(e2) === 'link_expired' ? { kind: 'ended', reason: 'expired' } : { kind: 'offline' })
      }
    }
  }, [token])
  useEffect(() => {
    void load()
    const poll = setInterval(() => void load(), 10_000)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', load)
    return () => { clearInterval(poll); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', load) }
  }, [load])
  return { state, setState, reload: load }
}

function Page({ pill, children }: { pill?: ReactNode; children: ReactNode }) {
  return (
    <main className="app-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pt-[max(20px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] sm:px-6">
        <header className="flex items-center justify-between gap-3 py-2">
          <Logo className="h-10" />
          {pill}
        </header>
        <div className="page-in mt-4 grid flex-1 content-start gap-5 md:content-center">{children}</div>
        {DEMO_AVAILABLE && isDemo() && <p className="mt-6 flex items-center justify-center gap-1.5 text-caption font-bold text-ink-3"><FlaskConical className="size-4" aria-hidden />Demo · sample data</p>}
      </div>
    </main>
  )
}

function Bullet({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-body font-semibold">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink [&_svg]:size-[18px]" aria-hidden>{icon}</span>
      <span className="pt-1.5">{children}</span>
    </li>
  )
}

function Ended({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page pill={<Pill icon={<Lock />}>Closed</Pill>}>
      <div className="card grid justify-items-center gap-3 rounded-2xl px-6 py-10 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-sunken text-ink-2" aria-hidden><Link2 className="size-8" /></span>
        <h1 className="text-h1 text-balance">{title}</h1>
        <p className="max-w-[40ch] text-body text-ink-2 text-pretty">{children}</p>
      </div>
    </Page>
  )
}

/** Running late from the link: 10, 20 or 30 minutes later. The gate hears it at once. */
function LateSheet({ open, onClose, token, link, onDone }: { open: boolean; onClose: () => void; token: string; link: LinkSummary; onDone: (l: LinkSummary) => void }) {
  const toast = useToast()
  const [extra, setExtra] = useState<10 | 20 | 30>(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = indiaClock(new Date(link.arrive_at)).minutes
  async function send() {
    setBusy(true)
    setError(null)
    try {
      const l = await linkLate(token, extra)
      toast(`The school knows: about ${clockTime(l.arrive_at)}.`)
      onDone(l)
    } catch (e) {
      setError(explainTripError(e as { code?: string; message?: string }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Running late" description={`Now about ${clockTime(link.arrive_at)}. How much later?`}>
      <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Minutes late">
        {([10, 20, 30] as const).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={n === extra} onClick={() => setExtra(n)} className="choice grid justify-items-center gap-0.5 px-2 py-2.5 text-center">
            <span className="text-[22px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">+{n}<span className="ml-0.5 text-small font-bold">min</span></span>
            <span className="text-caption font-semibold text-ink-2 tabular-nums">{formatTime(base + n)}</span>
          </button>
        ))}
      </div>
      {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
      <SheetFooter>
        <Button size="xl" variant="sunshine" className="w-full" icon={<Timer />} loading={busy} onClick={() => void send()}>Tell the school</Button>
      </SheetFooter>
    </Sheet>
  )
}

/**
 * The page the person collecting opens from WhatsApp (J8, TRIP-3, TRIP-4): no sign-in or install. Confirming binds the
 * link to this phone; the code is shown only here and to the parent. Location is optional, only during the trip, and
 * stops at "Reached home" or an hour after the handover.
 */
export default function CollectorLink() {
  const { token = '' } = useParams()
  // Demo links work on localhost without the real database (development and design builds only).
  if (DEMO_AVAILABLE && token.startsWith('demo_') && !isDemo()) enterDemo()
  const { state, setState, reload } = useLink(token)
  const [local, setLocalState] = useState<Local>(() => readLocal(token))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [late, setLate] = useState(false)
  const [simulate, setSimulate] = useState(false)
  const [last4, setLast4] = useState('')
  const [triesLeft, setTriesLeft] = useState<number | null>(null)
  const toast = useToast()

  const setLocal = (patch: Partial<Local>) => setLocalState((l) => {
    const next = { ...l, ...patch }
    try { localStorage.setItem(localKey(token), JSON.stringify(next)) } catch { /* private mode: this visit only */ }
    return next
  })

  const link = state.kind === 'open' ? state.link : null
  const travelling = !!link && state.kind === 'open' && state.mine && local.started && local.loc === true
    && (link.status === 'en_route' || (link.status === 'handed_over' && !link.home_at))
  const send = (points: Point[]) => linkShare(token, points)
  const gps = useSendLocation(travelling && !simulate, send)
  useSimulatedTrip(travelling && simulate, send)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) { setError(explainTripError(e as { code?: string; message?: string })) } finally { setBusy(false) }
  }

  // This phone tapped Reached home: the link is gone on the server, so say thank you rather than "ended".
  if (local.closed) {
    return <Ended title="Trip closed">Location sharing has stopped and this link no longer works. Thank you. You can close this page.</Ended>
  }
  if (state.kind === 'loading') {
    return <Page><div className="card h-[380px] animate-pulse rounded-2xl" aria-label="Loading" /></Page>
  }
  if (state.kind === 'offline') {
    return (
      <Page>
        <div className="card grid justify-items-center gap-3 rounded-2xl px-6 py-10 text-center" role="alert">
          <h1 className="text-h2">Can't reach the school</h1>
          <p className="text-body text-ink-2">Check your mobile data or Wi-Fi, then try again.</p>
          <Button variant="secondary" icon={<RotateCcw />} onClick={() => void reload()}>Try again</Button>
        </div>
      </Page>
    )
  }
  if (state.kind === 'ended') {
    return state.reason === 'in_use'
      ? <Ended title="This link is open on another phone">For safety a pickup link works on one phone only. If that was you on a different phone, use that phone, or ask the parent to send a new link.</Ended>
      : <Ended title="This link has ended">It was cancelled, replaced by a newer link, or the trip is over. If you still need to collect the child, ask the parent to send a new link.</Ended>
  }

  const l = state.link
  const nm = l.collector.split(' ')[0]!
  const code = l.code ?? '----'
  const callSchool = l.school_phone && (
    <a className="btn btn--quiet btn--md justify-self-center" href={`tel:${l.school_phone}`}><Phone aria-hidden />Call the school</a>
  )

  // Not confirmed on this phone yet.
  if (!state.mine) {
    return (
      <Page pill={<Pill icon={<Link2 />}>Pickup link</Pill>}>
        <div>
          <p className="kicker">Pickup link from Jumpstart</p>
          <h1 className="mt-1 text-display text-balance">Hi {nm}, you're collecting {l.child} today</h1>
        </div>
        <div className="card grid grid-cols-2 gap-4 rounded-2xl p-5">
          <div><p className="kicker">When</p><p className="mt-1 text-h3 tabular-nums">About {clockTime(l.arrive_at)}</p></div>
          <div><p className="kicker">Child</p><p className="mt-1 text-h3">{l.child}</p></div>
          <div className="col-span-2"><p className="kicker">Where</p><p className="mt-1 text-h4">Jumpstart Preschool, 11/7 Matoshri, Karve Road, Erandwane, Pune</p></div>
        </div>
        <ul className="grid gap-3">
          <Bullet icon={<KeyRound />}>You'll get a 4-digit code to show at the gate.</Bullet>
          <Bullet icon={<ShieldCheck />}>This link works only on your phone, and only for this pickup.</Bullet>
        </ul>
        <form className="grid gap-3" onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const r = await linkConfirm(token, last4)
            if ('tries_left' in r) {
              setTriesLeft(r.tries_left)
              setLast4('')
              if (r.tries_left <= 0) await reload()
              return
            }
            setState({ kind: 'open', link: r, mine: true })
          })
        }}>
          <label htmlFor="last4" className="px-0.5 text-small font-bold text-ink-2">To check it's you: the last 4 digits of your mobile</label>
          <div className="input"><input id="last4" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={4} value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" aria-describedby="last4-msg" className="tracking-[0.3em] tabular-nums" /></div>
          <p id="last4-msg" className={`px-0.5 text-caption font-semibold ${triesLeft !== null ? 'text-danger' : 'text-ink-2'}`} role={triesLeft !== null ? 'alert' : undefined}>
            {triesLeft !== null ? `That doesn't match the number ${l.child}'s parent gave. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.` : 'The number the parent gave the school for you.'}
          </p>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" size="xl" className="w-full" icon={<Check />} loading={busy} disabled={last4.length !== 4}>Yes, that's me</Button>
        </form>
        <p className="-mt-2 text-center text-caption font-semibold text-ink-2">Confirming locks this link to this phone. <Link to="/privacy" className="underline underline-offset-2">Privacy</Link></p>
      </Page>
    )
  }


  // Handed over: the way home.
  if (l.status === 'handed_over') {
    return (
      <Page pill={<Pill tone="live" icon={<CircleCheck />}>Handed over</Pill>}>
        <div className="grid justify-items-center gap-2 pt-4 text-center">
          <Mascot size={120} />
          <h1 className="text-display text-balance">{l.child} is with you. Thank you, {nm}!</h1>
          <p className="text-body text-ink-2">Handed over at {clockTime(l.closed_at!)}. {local.loc ? "The family can see you're on the way home." : 'Have a safe trip home.'}</p>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button size="xl" className="w-full" icon={<House />} loading={busy}
          onClick={() => void run(async () => { await linkHome(token); setLocal({ closed: true }); toast('The family has been told you are home.') })}>
          Reached home
        </Button>
        <p className="-mt-2 text-center text-caption font-semibold text-ink-2">This stops location sharing and closes the link.</p>
      </Page>
    )
  }

  if (l.status !== 'en_route') return <Ended title="This link has ended">The trip is over. If you still need to collect the child, ask the parent to send a new link.</Ended>

  // Location choice, once.
  if (local.loc === null) {
    return (
      <Page pill={<Pill icon={<MapPin />}>Location</Pill>}>
        <div className="grid justify-items-center gap-3 pt-2 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-accent text-on-accent" aria-hidden><MapPin className="size-10" /></span>
          <h1 className="text-h1 text-balance">Share your location on the way?</h1>
        </div>
        <ul className="card grid gap-3 rounded-2xl p-5">
          <Bullet icon={<Check />}>Only the parent who sent you this link sees where you are. The school doesn't.</Bullet>
          <Bullet icon={<Check />}>It's only for this trip, and stops when you tap Reached home or an hour after the handover.</Bullet>
          <Bullet icon={<Check />}>You can say no: you'll still collect {l.child} with the code at the gate.</Bullet>
        </ul>
        <div className="grid gap-2.5">
          <Button size="xl" icon={<MapPin />} onClick={() => setLocal({ loc: true })}>Allow location</Button>
          <Button variant="quiet" onClick={() => setLocal({ loc: false })}>Not now</Button>
        </div>
      </Page>
    )
  }

  // Ready to leave: the code and Start trip.
  if (!local.started) {
    return (
      <Page pill={<Pill tone="accent" icon={<KeyRound />}>Ready</Pill>}>
        <h1 className="text-h1">Your code for {l.child}</h1>
        <div className="card grid gap-3 rounded-2xl p-6">
          <p className="kicker text-center">Show this code at the gate</p>
          <CodeTiles code={code} size="xl" />
        </div>
        <ol className="grid gap-2 text-body font-semibold">
          {['Tap Start trip when you leave', 'Keep this page open on the way', 'Tell the coordinator the code'].map((s, i) => (
            <li key={s} className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-sunken text-small font-extrabold tabular-nums" aria-hidden>{i + 1}</span>{s}</li>
          ))}
        </ol>
        <Button size="xl" className="w-full" icon={<Navigation />} onClick={() => setLocal({ started: true })}>Start trip</Button>
        {!local.loc && <Button variant="quiet" icon={<MapPin />} onClick={() => setLocal({ loc: true })}>Turn on location after all</Button>}
      </Page>
    )
  }

  // At the gate: the code, big.
  if (local.atGate) {
    return (
      <Page pill={<Pill tone="accent" icon={<Hand />}>At the gate</Pill>}>
        <h1 className="text-h1">Show this code at the gate</h1>
        <div className="card rounded-2xl px-4 py-8"><CodeTiles code={code} size="xl" /></div>
        <p className="text-body text-ink-2">The coordinator types it on the iPad, then hands {l.child} over. Three wrong codes lock the handover and the parent is told.</p>
        {l.locked ? <Notice tone="danger" icon={<Lock />}>The handover is locked after three wrong codes. Please ask the coordinator to call the parent.</Notice>
          : <Pill tone="accent" className="justify-self-start"><span className="size-2 animate-pulse rounded-full bg-current" aria-hidden />Waiting for the coordinator</Pill>}
        <Button variant="quiet" onClick={() => setLocal({ atGate: false })}>Back</Button>
        {callSchool}
      </Page>
    )
  }

  // On the way.
  const fix = gps.lastFix
  const away = fix && fix.accuracy <= 100 ? distanceM(fix, SCHOOL) : null
  return (
    <Page pill={travelling ? <Pill tone="live" icon={<span className="size-2 animate-pulse rounded-full bg-current" />}>{simulate ? 'Simulated' : 'Sharing'}</Pill> : <Pill>Location off</Pill>}>
      <h1 className="text-h1">On the way to Jumpstart</h1>
      {travelling && fix && !simulate ? (
        <div className="relative h-[34dvh] min-h-[220px] overflow-hidden rounded-2xl ring-1 ring-line">
          <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
            <TripMap className="absolute inset-0" route={[]} progressIndex={0} position={[fix.lng, fix.lat]} freshness="live"
              destination={[SCHOOL.lng, SCHOOL.lat]} padding={{ top: 48, bottom: 64, left: 48, right: 48 }} />
          </Suspense>
        </div>
      ) : null}
      {travelling ? (
        gps.error === 'denied' ? <Notice tone="warning">Location is blocked for this site. {locationHelp()} The gate still knows you're coming.</Notice>
          : gps.error === 'unavailable' ? <Notice tone="info">Your phone can't find its location right now. It keeps trying.</Notice>
          : gps.error === 'ended' ? <Notice tone="info">This trip is finished, so sharing has stopped. You can close this page.</Notice>
          : <p className="flex items-center gap-3 rounded-xl bg-recent-soft px-4 py-3 text-small font-bold text-recent"><MonitorSmartphone className="size-5 shrink-0" aria-hidden />
              {simulate ? 'Simulated drive for the demo.' : away !== null ? `${formatDistance(away)} from the gate. ` : 'Finding your location. '}Keep this page open so the parent sees you coming.</p>
      ) : <Notice tone="info">Location is off. The school still expects you at about {clockTime(l.arrive_at)}.</Notice>}
      <div className="card flex items-center justify-between gap-4 rounded-2xl p-5">
        <div><p className="kicker flex items-center gap-1.5"><Clock className="size-4" aria-hidden />Arriving</p><p className="mt-1 text-h2 tabular-nums">About {clockTime(l.arrive_at)}</p></div>
        <div className="text-right"><p className="kicker">Your code</p><p className="mt-1 text-h2 tracking-[0.14em] tabular-nums">{code}</p></div>
      </div>
      {l.ready_at && <Notice tone="success">{l.child} is ready at the gate.</Notice>}
      <Button size="xl" className="w-full" icon={<Hand />} onClick={() => setLocal({ atGate: true })}>I'm at the gate</Button>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="sunshine" icon={<Timer />} onClick={() => setLate(true)}>Running late</Button>
        {local.loc ? <Button variant="secondary" onClick={() => { setSimulate(false); setLocal({ loc: false }) }}>Stop sharing</Button>
          : <Button variant="secondary" icon={<MapPin />} onClick={() => setLocal({ loc: true })}>Share location</Button>}
      </div>
      {DEMO_AVAILABLE && isDemo() && local.loc && !simulate && <Button variant="quiet" icon={<FlaskConical />} onClick={() => setSimulate(true)}>Demo: simulate the drive</Button>}
      {callSchool}
      {late && <LateSheet open onClose={() => setLate(false)} token={token} link={l} onDone={(next) => { setState({ kind: 'open', link: next, mine: true }); setLate(false) }} />}
    </Page>
  )
}
