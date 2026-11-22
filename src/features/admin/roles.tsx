import type { ReactNode } from 'react'
import { BellRing, CalendarClock, Eye, Headset, ShieldCheck } from '../../ui/icons'
import type { StaffRole } from '../auth/session'

/** Staff roles as the school says them, told apart by icon (owner, 2026-09-24). Same icons as the Screen Book. */
export const ROLE: Record<StaffRole, { name: string; icon: ReactNode; does: string }> = {
  admin: { name: 'Admin', icon: <ShieldCheck />, does: 'Everything: people, roles, settings and the audit log' },
  core: { name: 'Head office', icon: <CalendarClock />, does: "Timings, children's times, attendance and the gate team" },
  pro: { name: 'Front desk', icon: <Headset />, does: 'Calls and visitors, messages and announcements' },
  coordinator: { name: 'Center coordinator', icon: <BellRing />, does: 'The gate: announcements, check-ins and handovers' },
  leader: { name: 'Center leader', icon: <Eye />, does: 'The gate: hears requests, acknowledges and marks Ready' },
}
