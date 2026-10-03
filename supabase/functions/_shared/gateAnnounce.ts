/**
 * The gate announcement engine (0042): what each announcement says and when, from the admin's settings (Admin →
 * Settings → Gate announcements) or the built-in defaults below. Shared by the gate iPad (src/features/duty), the admin's
 * editor and preview, and the pronounce function, which records each child's likely sentences ahead from the same
 * settings, so the iPad finds the clip already made.
 *
 * Templates are plain text with {{variables}} from a fixed list, replaced as text: nothing is ever evaluated. A
 * template that is missing, unknown or broken falls back to its default, so an announcement is never skipped.
 */
import { checkSpeech, clockWords, numberWords, tidy, voiceSentence, type VoiceChild } from './announce.ts'

export type Kind = 'pickup' | 'dropoff'
export type TemplateKey = 'pickup_eta' | 'pickup_late' | 'pickup_arrived' | 'pickup_cancelled' | 'dropoff_eta' | 'dropoff_late' | 'dropoff_arrived' | 'dropoff_cancelled'
export type OpeningKey = 'opening_new' | 'opening_urgent' | 'opening_reminder'
export type TimingKey = 'early_min' | 'ready_min' | 'urgent_min' | 'reminder_min'
export type GateSettings = Record<TemplateKey | OpeningKey, string> & Record<TimingKey, number>

export const DEFAULT_GATE: GateSettings = {
  opening_new: 'New announcement.',
  opening_urgent: 'Urgent new announcement.',
  opening_reminder: 'This is a reminder.',
  pickup_eta: "{{child_name}}'s {{relation}} will arrive for pickup {{eta}}. Please get {{preferred_name}} ready.",
  // Said once, the moment a parent taps Running late (0043), with its own lead instead of an opening; reminders after it
  // use the on-the-way wording with the time left then.
  pickup_late: "Pickup update. {{child_name}}'s {{relation}} is running late and will arrive {{eta}}.",
  pickup_arrived: "{{child_name}}'s {{relation}} has arrived for pickup. Please get {{preferred_name}} ready.",
  pickup_cancelled: 'Pickup for {{child_name}} is cancelled.',
  dropoff_eta: '{{child_name}} will arrive for drop-off {{eta}}.',
  dropoff_late: 'Drop-off update. {{child_name}} is running late and will arrive {{eta}}.',
  dropoff_arrived: '{{child_name}} has arrived for drop-off.',
  dropoff_cancelled: 'Drop-off for {{child_name}} is cancelled.',
  early_min: 15,
  ready_min: 10,
  urgent_min: 5,
  reminder_min: 2,
}

/** The choices the admin has for each timing, in minutes. Early is before Get ready, which is before Urgent. */
export const TIMING_CHOICES: Record<TimingKey, readonly number[]> = {
  early_min: [10, 15, 20],
  ready_min: [5, 10, 15],
  urgent_min: [3, 5, 7],
  reminder_min: [1, 2, 3, 5],
}

export const TEMPLATE_KEYS: readonly TemplateKey[] = ['pickup_eta', 'pickup_late', 'pickup_arrived', 'pickup_cancelled', 'dropoff_eta', 'dropoff_late', 'dropoff_arrived', 'dropoff_cancelled']
export const OPENING_KEYS: readonly OpeningKey[] = ['opening_new', 'opening_urgent', 'opening_reminder']
export const TIMING_KEYS: readonly TimingKey[] = ['early_min', 'ready_min', 'urgent_min', 'reminder_min']

/** Every variable a template may use, what it says, and an example. */
export const VARIABLES = {
  child_name: { label: 'Child name', example: 'Aarav Sharma' },
  preferred_name: { label: 'Preferred name', example: 'Aarav' },
  relation: { label: 'Relation', example: 'mother' },
  direction: { label: 'Pickup or drop-off', example: 'pickup' },
  eta: { label: 'Arrival', example: 'in about ten minutes' },
  minutes: { label: 'Minutes', example: 'ten' },
  arrival_time: { label: 'Arrival time', example: 'one twenty-two in the afternoon' },
  programme: { label: 'Programme', example: 'Nursery Morning' },
} as const
export type Variable = keyof typeof VARIABLES

const TIME_VARS: readonly Variable[] = ['eta', 'minutes', 'arrival_time']
const BASE_VARS: readonly Variable[] = ['child_name', 'preferred_name', 'relation', 'direction', 'programme']
export const ALLOWED: Record<TemplateKey, readonly Variable[]> = {
  pickup_eta: [...BASE_VARS, ...TIME_VARS],
  dropoff_eta: [...BASE_VARS, ...TIME_VARS],
  pickup_late: [...BASE_VARS, ...TIME_VARS],
  dropoff_late: [...BASE_VARS, ...TIME_VARS],
  pickup_arrived: BASE_VARS,
  dropoff_arrived: BASE_VARS,
  pickup_cancelled: BASE_VARS,
  dropoff_cancelled: BASE_VARS,
}

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g
// What a voice may be given (checkSpeech in announce.ts), with the placeholders taken out first.
const SAYABLE = /^[\p{L}\p{M}\p{N} .,'?!:;-]*$/u
const TEMPLATE_MAX = 200
const PICKUP_WORD = /\bpick[\s-]?up\b/i
const DROPOFF_WORD = /\bdrop[\s-]?off\b/i

export const variablesIn = (template: string): string[] => [...template.matchAll(PLACEHOLDER)].map((m) => m[1]!)
const kindOf = (key: TemplateKey): Kind => (key.startsWith('pickup') ? 'pickup' : 'dropoff')

/** Why a template can't be saved, in words for the admin; null when it can. The database checks the same (0042). */
export function templateProblem(key: TemplateKey, template: string): string | null {
  const t = template.trim()
  if (!t) return 'Write what the gate should hear.'
  if (t.length > TEMPLATE_MAX) return `Keep it under ${TEMPLATE_MAX} characters.`
  const bare = t.replace(PLACEHOLDER, ' ')
  if (/[{}]/.test(bare)) return 'Each variable needs two braces on each side, like {{child_name}}.'
  if (!SAYABLE.test(bare)) return 'Use letters, numbers and . , \' ? ! : ; - only, so the voice can read every word.'
  const used = variablesIn(t)
  const unknown = used.find((v) => !(ALLOWED[key] as readonly string[]).includes(v))
  if (unknown) return `{{${unknown}}} can't be used here. Use the variables listed below.`
  if (!used.some((v) => v === 'child_name' || v === 'preferred_name')) return 'Include the child: {{child_name}} or {{preferred_name}}.'
  const word = kindOf(key) === 'pickup' ? PICKUP_WORD : DROPOFF_WORD
  if (!used.includes('direction') && !word.test(bare)) return `Say it's a ${kindOf(key) === 'pickup' ? 'pickup' : 'drop-off'}, or include {{direction}}.`
  if ((key.endsWith('_eta') || key.endsWith('_late')) && !used.some((v) => TIME_VARS.includes(v as Variable))) return 'Include when they arrive: {{eta}}, {{minutes}} or {{arrival_time}}.'
  if (key.endsWith('_late') && !/\b(late|delayed|update)\b/i.test(bare)) return 'Say they are running late, for example "is running late".'
  if (key.endsWith('_arrived') && !/\b(arrived|here|at the gate)\b/i.test(bare)) return 'Say they have arrived, for example "has arrived".'
  if (key.endsWith('_cancelled') && !/\bcancel/i.test(bare)) return 'Say it is cancelled.'
  return null
}

/** Why an opening can't be saved; null when it can. One short sentence, so the iPad keeps it ready to play. */
export function openingProblem(opening: string): string | null {
  const t = opening.trim()
  if (t.length < 2 || t.length > 40) return 'Use 2 to 40 characters, like "New announcement."'
  if (!/^[\p{L}\p{M}\p{N} ,'-]+[.!]$/u.test(t)) return 'One short sentence ending with a full stop, with no variables.'
  return null
}

/** Why the timings can't be saved; null when they can. */
export function timingProblem(t: Record<TimingKey, number>): string | null {
  for (const k of TIMING_KEYS) if (!TIMING_CHOICES[k].includes(t[k])) return 'Choose one of the listed times.'
  if (!(t.early_min > t.ready_min && t.ready_min > t.urgent_min)) return 'The early announcement must come before Get ready, and Get ready before Urgent.'
  return null
}

/**
 * The settings to use: each saved value that passes its check, and the default for anything missing or broken, so a
 * bad row in the database never silences the gate. Timings are used together or not at all, so their order holds.
 */
export function gateSettings(row: Partial<Record<keyof GateSettings, unknown>> | null | undefined): GateSettings {
  const s: GateSettings = { ...DEFAULT_GATE }
  if (!row) return s
  for (const k of TEMPLATE_KEYS) {
    const v = row[k]
    if (typeof v === 'string' && !templateProblem(k, v)) s[k] = v.trim()
  }
  for (const k of OPENING_KEYS) {
    const v = row[k]
    if (typeof v === 'string' && !openingProblem(v)) s[k] = v.trim()
  }
  const timing = Object.fromEntries(TIMING_KEYS.map((k) => [k, typeof row[k] === 'number' ? row[k] : DEFAULT_GATE[k]])) as Record<TimingKey, number>
  if (!timingProblem(timing)) Object.assign(s, timing)
  return s
}

// ETA ------------------------------------------------------------------------------------------------------------------

/** Spoken arrival times, in minutes: near arrival a smaller step, further out a rounder one. */
export const ETA_STEPS = [2, 5, 10, 15, 20, 25, 30, 45, 60] as const
/** Steps recorded ahead for every child: the ones the parent's 5, 10 and 15 buttons and the reminders land on. */
export const PREMADE_STEPS = [2, 5, 10, 15] as const

export type Eta =
  | { kind: 'due' }
  | { kind: 'minutes'; minutes: number }
  | { kind: 'clock'; at: Date; minutes: number }

/**
 * The one rule for how an arrival time is said, from the trip's arrive_at and now: within a minute or past it, "any
 * moment now"; up to about an hour, the nearest step ("in about ten minutes"; 13 minutes is about fifteen, 6 about
 * five); further out, the clock time ("at about one twenty-two in the afternoon").
 */
export function etaOf(arriveAtMs: number, nowMs: number): Eta {
  const left = (arriveAtMs - nowMs) / 60_000
  if (left <= 1) return { kind: 'due' }
  // Minutes in quarter hours this far out, so a {{minutes}} wording doesn't need a new recording every minute.
  if (left > 67.5) return { kind: 'clock', at: new Date(arriveAtMs), minutes: Math.round(left / 15) * 15 }
  let best: number = ETA_STEPS[0]
  for (const step of ETA_STEPS) if (Math.abs(step - left) <= Math.abs(best - left)) best = step
  return { kind: 'minutes', minutes: best }
}

/** "in about ten minutes", "any moment now", "at about one twenty-two in the afternoon". India time. */
export function etaWords(eta: Eta): string {
  if (eta.kind === 'due') return 'any moment now'
  if (eta.kind === 'minutes') return `in about ${numberWords(eta.minutes)} minutes`
  return `at about ${clockAt(eta.at)}`
}

function clockAt(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return clockWords(get('hour'), get('minute'))
}

// Rendering -------------------------------------------------------------------------------------------------------------

/** Anyone not on the child's record, such as a driver with a one-time link. */
export const PICKUP_PERSON = 'pickup person'
/** "father" from "Father"; anyone without a relation on record is the pickup person. */
export const whoFor = (relation: string | null | undefined) => tidy(relation, 30).toLowerCase() || PICKUP_PERSON

export interface AnnouncedChild { fullName: string; name: string; programme?: string | null }

/** What happened: on the way with an arrival time, arrived, or cancelled. */
export type GateEvent =
  | { kind: Kind; state: 'eta' | 'late'; eta: Eta; arriveAt: Date }
  | { kind: Kind; state: 'arrived' }
  | { kind: Kind; state: 'cancelled' }

const keyFor = (e: GateEvent): TemplateKey => `${e.kind}_${e.state}` as TemplateKey

/**
 * Fills a template's {{variables}} with plain text. Only the listed variables exist; anything else throws, and the
 * caller falls back to the default. Values are tidied first, so a name can never add symbols or another variable.
 */
export function fill(template: string, values: Partial<Record<Variable, string>>): string {
  return template.replace(PLACEHOLDER, (_, name: string) => {
    const v = values[name as Variable]
    if (v === undefined) throw new Error(`unknown variable ${name}`)
    return tidy(v, 120)
  }).replace(/\s+/g, ' ').trim()
}

/**
 * The words of one announcement after the opening: the admin's template for this event, or the default when the
 * template can't say it ("any moment now" needs {{eta}}; a template that fails its check never reaches here).
 */
export function messageFor(settings: GateSettings, e: GateEvent, child: AnnouncedChild, relation: string | null | undefined): string {
  const key = keyFor(e)
  const values: Partial<Record<Variable, string>> = {
    child_name: child.fullName,
    preferred_name: child.name,
    relation: whoFor(relation),
    direction: e.kind === 'pickup' ? 'pickup' : 'drop-off',
    programme: child.programme ?? '',
  }
  if (e.state === 'eta' || e.state === 'late') {
    values.eta = etaWords(e.eta)
    values.minutes = e.eta.kind === 'due' ? 'a few' : numberWords(e.eta.minutes)
    values.arrival_time = clockAt(e.arriveAt)
  }
  let template = settings[key]
  // Due, and the admin's template says minutes or a clock time: those would be wrong now, so the default says it.
  if ((e.state === 'eta' || e.state === 'late') && e.eta.kind === 'due' && !variablesIn(template).includes('eta')) template = DEFAULT_GATE[key]
  try {
    return fill(template, values)
  } catch {
    return fill(DEFAULT_GATE[key], values)
  }
}

/** Openings in order: first time, urgent first time, and every repeat. */
export const openingFor = (s: GateSettings, o: { urgent: boolean; reminder: boolean }) =>
  o.reminder ? s.opening_reminder : o.urgent ? s.opening_urgent : s.opening_new

export const SOUND_CHECK = 'This is a sound check. Gate announcements are working.'

/** The openings and the sound check, as the voice is given them: kept on every iPad. */
export const commonPhrases = (s: GateSettings) => [s.opening_new, s.opening_urgent, s.opening_reminder, SOUND_CHECK].map((x) => voiceSentence(x))

/**
 * Every message one child's announcements are likely to need, recorded ahead: for each relation on their record and a
 * pickup person, each pre-made arrival step, "any moment now" and arrived; the same for drop-off; and both
 * cancellations. Rarer arrival times (twenty minutes and up, or a clock time) are made the first time they're needed.
 */
export function childMessages(s: GateSettings, child: AnnouncedChild & VoiceChild, relations: ReadonlyArray<string | null>): string[] {
  const whos = [...new Set([...relations.map(whoFor), PICKUP_PERSON])]
  const arriveAt = new Date(0)
  const out: string[] = []
  for (const kind of ['pickup', 'dropoff'] as const) {
    // A clock time can't be made ahead: such a template is made live when needed, and only "any moment now" here.
    // "Any moment now" is made ahead too, unless the template would say a clock time in it (then it waits for the trip).
    const used = variablesIn(s[`${kind}_eta`])
    const etas: Eta[] = used.includes('arrival_time') ? (used.includes('eta') ? [] : [{ kind: 'due' }])
      : [...PREMADE_STEPS.map((minutes) => ({ kind: 'minutes', minutes }) as Eta), { kind: 'due' }]
    // Templates without {{relation}} come out the same for everyone; the Set keeps one.
    const lateUsed = variablesIn(s[`${kind}_late`])
    // A late update lands 5, 10 or 15 minutes later: the pre-made steps cover it unless the wording says a clock time.
    const lateEtas: Eta[] = lateUsed.includes('arrival_time') ? [] : PREMADE_STEPS.slice(1).map((minutes) => ({ kind: 'minutes', minutes }) as Eta)
    for (const who of whos) {
      for (const eta of etas) out.push(messageFor(s, { kind, state: 'eta', eta, arriveAt }, child, who))
      for (const eta of lateEtas) out.push(messageFor(s, { kind, state: 'late', eta, arriveAt }, child, who))
      out.push(messageFor(s, { kind, state: 'arrived' }, child, who), messageFor(s, { kind, state: 'cancelled' }, child, who))
    }
  }
  // As the voice is given them: tidied, sayable, and with the child's approved pronunciation.
  return [...new Set(out.map((m) => voiceSentence(m, child)).filter((m) => checkSpeech(m)))]
}

/** The example the admin's editor previews and plays: Aarav Sharma's mother, ten minutes away. */
export const SAMPLE_CHILD: AnnouncedChild = { fullName: 'Aarav Sharma', name: 'Aarav', programme: 'Nursery Morning' }
