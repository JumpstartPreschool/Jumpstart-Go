import type { ReactNode } from 'react'
import { BellRing, CalendarClock, Headset, ShieldCheck } from '../../ui/icons'
import type { StaffRole } from '../auth/session'

/** Staff roles as the school says them, told apart by icon (owner, 2026-09-24). Same icons as the Screen Book. */
export const ROLE: Record<StaffRole, { name: string; icon: ReactNode; does: string }> = {
  admin: { name: 'Admin', icon: <ShieldCheck />, does: 'Everything: people, roles, settings and the audit log' },
  core: { name: 'Core team', icon: <CalendarClock />, does: "Timings, children's times, attendance and coordinators" },
  pro: { name: 'Front desk', icon: <Headset />, does: 'Calls and visitors, messages and announcements' },
  coordinator: { name: 'Coordinator', icon: <BellRing />, does: 'The gate on an iPad: announcements and handovers' },
}
