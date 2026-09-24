import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Link2, MapPinned, Power, Smartphone, Tablet } from 'lucide-react'
import { Logo, Mascot } from '../ui/Logo'

const SCREENS: Array<{ to: string; title: string; detail: string; device: string; icon: ReactNode; color: string }> = [
  { to: '/preview/parent', title: 'Parent · Today', detail: "Each child's day, change time with busy slots, running late, choosing who picks up.", device: 'Phone · iPad', icon: <Smartphone />, color: 'var(--rb-blue)' },
  { to: '/preview/trip', title: 'Parent · Live trip', detail: 'Full-screen map with the trip panel. Switch between LIVE, RECENT, STALE and UNAVAILABLE.', device: 'Phone · iPad', icon: <MapPinned />, color: 'var(--rb-green)' },
  { to: '/preview/gate', title: 'Coordinator · Gate queue', detail: 'Who is arriving next, flags, running late, handoff code entry and guardian confirmation.', device: 'iPad', icon: <Tablet />, color: 'var(--rb-orange)' },
  { to: '/preview/link', title: 'Third person · Pickup link', detail: 'What a grandparent or driver sees from WhatsApp, step by step.', device: 'Phone', icon: <Link2 />, color: 'var(--rb-violet)' },
  { to: '/coordinator', title: 'Coordinator · Start duty', detail: 'The real duty mode: sound check, screen kept awake, announcements. Not sample data.', device: 'iPad', icon: <Power />, color: 'var(--rb-red)' },
]

export function PreviewIndex() {
  return (
    <main className="mx-auto w-full max-w-[860px] px-5 pt-[max(48px,calc(env(safe-area-inset-top)+28px))] pb-16 sm:px-8">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-14 sm:h-16" />
        <Mascot size={120} className="mt-4" />
        <h1 className="mt-2 text-[40px] font-bold leading-[44px] sm:text-[48px] sm:leading-[52px]">Design preview</h1>
        <p className="mt-2 max-w-[560px] text-[18px] font-semibold leading-7 text-ink-2">
          The key screens with <strong className="text-ink">sample data</strong>: no real children, people or locations. They show the look and the flow before the school server is connected.
        </p>
      </div>
      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        {SCREENS.map((s) => (
          <li key={s.to}>
            <Link to={s.to} className="card flex h-full items-center gap-4 rounded-2xl p-5 transition-transform duration-200 ease-spring hover:-translate-y-0.5 active:scale-[0.98]">
              <span
                className="grid size-14 shrink-0 place-items-center rounded-lg text-white [&_svg]:size-7"
                style={{ background: s.color }}
                aria-hidden
              >
                {s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block tracking-[-0.02em] text-[20px] font-bold leading-6">{s.title}</span>
                <span className="mt-0.5 block text-[15px] font-semibold leading-[22px] text-ink-2">{s.detail}</span>
                <span className="mt-2 inline-block rounded-full bg-sunken px-2.5 py-0.5 text-[12px] font-extrabold text-ink-2">{s.device}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
