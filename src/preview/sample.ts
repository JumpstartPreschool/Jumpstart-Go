/**
 * DESIGN PREVIEW SAMPLE DATA — not real children, people, locations or trips.
 * Used only by the /preview screens so the owner can review the interface before the backend is connected.
 */
import type { Freshness } from '../domain/freshness'

export type LngLat = [number, number]

export const SCHOOL: { name: string; position: LngLat } = {
  name: 'Jumpstart Preschool, Karve Road',
  position: [73.8328, 18.50885],
}

// A real road route from Kothrud to the school (OpenStreetMap routing), used only to draw the sample trip.
export const SAMPLE_ROUTE: LngLat[] = [
  [73.81053, 18.50098], [73.81106, 18.50168], [73.81075, 18.50186], [73.81065, 18.50193], [73.81082, 18.502],
  [73.81151, 18.50208], [73.81211, 18.50217], [73.81288, 18.50218], [73.81334, 18.50215], [73.81361, 18.50211],
  [73.81441, 18.50211], [73.81505, 18.50215], [73.81563, 18.50216], [73.8165, 18.50232], [73.81725, 18.5025],
  [73.81827, 18.5028], [73.81889, 18.503], [73.8196, 18.50328], [73.81999, 18.50353], [73.82047, 18.50387],
  [73.82101, 18.50421], [73.82145, 18.50447], [73.8218, 18.50466], [73.82245, 18.50494], [73.8234, 18.50531],
  [73.82421, 18.50553], [73.8249, 18.50572], [73.82532, 18.50585], [73.82573, 18.50604], [73.82642, 18.50632],
  [73.82726, 18.50672], [73.82802, 18.50705], [73.82893, 18.5075], [73.82933, 18.50773], [73.83022, 18.50819],
  [73.8309, 18.50854], [73.83145, 18.50882], [73.83212, 18.50917], [73.83253, 18.50938], [73.8328, 18.50885],
]
/** Where the sample traveller is along SAMPLE_ROUTE. */
export const SAMPLE_PROGRESS_INDEX = 27

export interface GateRow {
  id: string
  child: string
  group: string
  direction: 'pickup' | 'dropoff'
  time: string
  person: string
  relation: string
  thirdPerson: boolean
  section: 'attention' | 'arriving' | 'upcoming' | 'done'
  flag?: { kind: 'off_schedule' | 'short_notice'; note: string }
  lateMin?: number
  eta?: string
  freshness?: Freshness
  ageText?: string
  ready?: boolean
  doneText?: string
}

export const GATE_ROWS: GateRow[] = [
  { id: 'k', child: 'Kabir Shah', group: 'Nursery · 360°', direction: 'pickup', time: '11:00 AM', person: 'Neha Shah', relation: 'Mother', thirdPerson: false, section: 'attention', flag: { kind: 'off_schedule', note: "Doctor's appointment" } },
  { id: 'a', child: 'Aarav Kulkarni', group: 'Jr KG · Sunflowers', direction: 'pickup', time: '12:45 PM', person: 'Ramesh Kulkarni', relation: 'Grandfather', thirdPerson: true, section: 'arriving', eta: 'about 3–5 min', freshness: 'live', ready: true },
  { id: 'm', child: 'Riya Joshi', group: 'Learning Center', direction: 'pickup', time: '12:45 PM', person: 'Anjali Joshi', relation: 'Mother', thirdPerson: false, section: 'arriving', eta: 'Arriving now', freshness: 'live' },
  { id: 'i', child: 'Isha Patil', group: 'Jr KG · Sunflowers', direction: 'pickup', time: '12:40 PM', person: 'Rohan Patil', relation: 'Father', thirdPerson: false, section: 'arriving', eta: 'about 10–15 min', freshness: 'recent', ageText: '38s', lateMin: 10 },
  { id: 'v', child: 'Vihaan Mehta', group: 'Jr KG · Sunflowers', direction: 'pickup', time: '1:00 PM', person: 'Priti Mehta', relation: 'Mother', thirdPerson: false, section: 'upcoming' },
  { id: 's', child: 'Saanvi Rao', group: 'Sr KG · Tulips', direction: 'pickup', time: '1:00 PM', person: 'Lata Rao', relation: 'Aunt', thirdPerson: true, section: 'upcoming', freshness: 'stale', ageText: '4 min' },
  { id: 'n', child: 'Anaya Desai', group: 'Jr KG · Sunflowers', direction: 'pickup', time: '12:30 PM', person: 'Mother', relation: 'Mother', thirdPerson: false, section: 'done', doneText: 'Handed over to Mother at 12:31 PM' },
]

export const SAMPLE_CODE = '4817'

export const SAMPLE_TIMELINE = [
  { time: '12:02 PM', text: 'Sneha chose Ramesh (Grandfather) for pickup' },
  { time: '12:03 PM', text: 'Link sent on WhatsApp' },
  { time: '12:21 PM', text: 'Ramesh confirmed on his phone' },
  { time: '12:26 PM', text: 'Trip started · location shared' },
  { time: '12:35 PM', text: 'Aarav is ready at the gate' },
]

/** Meera is in the Learning Center (flexible, 9 AM–7 PM), so any slot in the hours is normal. */
export const PICKUP_SLOTS = [
  { time: '4:30 PM', load: 2 }, { time: '4:45 PM', load: 1 }, { time: '5:00 PM', load: 4 }, { time: '5:15 PM', load: 6 },
  { time: '5:30 PM', load: 9 }, { time: '5:45 PM', load: 3 }, { time: '6:00 PM', load: 5 }, { time: '6:15 PM', load: 2 },
  { time: '6:30 PM', load: 8 }, { time: '6:45 PM', load: 3 }, { time: '7:00 PM', load: 1 },
]
export const BUSY_FROM = 8

export const SAVED_PEOPLE = [
  { name: 'Ramesh Kulkarni', relation: 'Grandfather', phone: '+91 98220 41xxx', email: 'ramesh.k@example.com' },
  { name: 'Lata Rao', relation: 'Aunt', phone: '+91 99701 88xxx', email: null },
]
