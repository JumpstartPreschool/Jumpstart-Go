import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Link2, MapPinned, Power, Smartphone, Tablet } from 'lucide-react'
import { BrandMark } from '../ui/BrandMark'

const SCREENS: Array<{ to: string; title: string; detail: string; device: string; icon: ReactNode }> = [
  { to: '/preview/parent', title: 'Parent · Today', detail: "Each child's day, change time with busy slots, running late, choosing who picks up.", device: 'Phone', icon: <Smartphone /> },
  { to: '/preview/trip', title: 'Parent · Live trip', detail: 'Full-screen map with the trip sheet. Switch between LIVE, RECENT, STALE and UNAVAILABLE.', device: 'Phone', icon: <MapPinned /> },
  { to: '/preview/gate', title: 'Coordinator · Gate queue', detail: 'Who is arriving next, flags, running late, handoff code entry and guardian confirmation.', device: 'iPad', icon: <Tablet /> },
  { to: '/preview/link', title: 'Third person · Pickup link', detail: 'What the grandparent or driver sees from WhatsApp, step by step.', device: 'Phone', icon: <Link2 /> },
  { to: '/coordinator', title: 'Coordinator · Start duty (working)', detail: 'The real duty mode: sound check, screen kept awake, announcements. Not sample data.', device: 'iPad', icon: <Power /> },
]

export function PreviewIndex() {
  return (
    <main className="mx-auto max-w-[760px] px-6 pt-[max(48px,env(safe-area-inset-top))] pb-16">
      <div className="flex items-center gap-2.5 text-[15px] font-semibold text-ink-2">
        <BrandMark className="size-7" /> Jumpstart · Design preview
      </div>
      <h1 className="mt-4 text-[34px] font-semibold leading-10 tracking-[-0.02em]">Key screens for review</h1>
      <p className="mt-2 text-[17px] leading-6 text-ink-2">
        These screens use <strong className="text-ink">sample data</strong>: no real children, people or locations. They show the design and the flow before the school server is connected.
      </p>
      <ul className="mt-8 grid gap-3">
        {SCREENS.map((s) => (
          <li key={s.to}>
            <Link to={s.to} className="flex items-center gap-4 rounded-[22px] bg-surface p-5 shadow-1 ring-1 ring-line transition-[transform,box-shadow] duration-200 ease-spring hover:shadow-2 active:scale-[0.99]">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent [&_svg]:size-6" aria-hidden>{s.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[18px] font-semibold">{s.title}</span>
                  <span className="rounded-full bg-sunken px-2 py-0.5 text-[12px] font-semibold text-ink-2">{s.device}</span>
                </span>
                <span className="mt-0.5 block text-[15px] leading-[22px] text-ink-2">{s.detail}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
