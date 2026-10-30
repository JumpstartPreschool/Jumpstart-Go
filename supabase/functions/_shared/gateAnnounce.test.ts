import { describe, expect, it } from 'vitest'
import { childMessages, DEFAULT_GATE, etaOf, etaWords, fill, gateSettings, messageFor, openingProblem, SAMPLE_CHILD, TEMPLATE_KEYS, templateProblem, timingProblem } from './gateAnnounce'

const NOW = Date.parse('2026-09-28T07:30:00Z') // 1:00 PM in India
const inMin = (m: number) => NOW + m * 60_000

describe('one rule for how an arrival time is said', () => {
  it('rounds to a human step, finer near arrival', () => {
    const said = (m: number) => etaWords(etaOf(inMin(m), NOW))
    expect(said(5)).toBe('in about five minutes')
    expect(said(10)).toBe('in about ten minutes')
    expect(said(15)).toBe('in about fifteen minutes')
    expect(said(13)).toBe('in about fifteen minutes')
    expect(said(9)).toBe('in about ten minutes')
    expect(said(6)).toBe('in about five minutes')
    expect(said(9 + 37 / 60)).toBe('in about ten minutes')
    expect(said(2.6)).toBe('in about two minutes')
    expect(said(23)).toBe('in about twenty-five minutes'.replace('-', ' '))
    expect(said(22)).toBe('in about twenty minutes')
    expect(said(40)).toBe('in about forty five minutes')
    expect(said(60)).toBe('in about sixty minutes')
  })

  it('says any moment now within a minute or after the time, and a clock time past about an hour', () => {
    expect(etaWords(etaOf(inMin(0.5), NOW))).toBe('any moment now')
    expect(etaWords(etaOf(inMin(-4), NOW))).toBe('any moment now')
    // More than 5 minutes past: overdue, never "any moment now".
    expect(etaWords(etaOf(inMin(-12), NOW))).toBe('was expected about ten minutes ago')
    expect(etaWords(etaOf(inMin(-90), NOW))).toBe('was expected over an hour ago')
    expect(etaWords(etaOf(inMin(22 + 60), NOW))).toBe('at about two twenty two in the afternoon')
    expect(etaWords(etaOf(Date.parse('2026-09-28T06:35:00Z'), Date.parse('2026-09-28T04:00:00Z')))).toBe('at about twelve oh five in the afternoon')
  })
})

describe('templates', () => {
  it('fills only listed variables as text, never code', () => {
    expect(fill('Hi {{ child_name }}.', { child_name: 'Aarav' })).toBe('Hi Aarav.')
    expect(() => fill('{{constructor}}', {})).toThrow()
    expect(() => fill('{{__proto__}}', {})).toThrow()
    // A name can't add symbols or another variable: values are tidied first.
    expect(fill('{{child_name}} pickup.', { child_name: '{{eta}} <b>Aarav</b>' })).toBe('eta b Aarav b pickup.')
  })

  it('accepts every default', () => {
    for (const k of TEMPLATE_KEYS) expect(templateProblem(k, DEFAULT_GATE[k]), k).toBeNull()
    for (const o of [DEFAULT_GATE.opening_new, DEFAULT_GATE.opening_urgent, DEFAULT_GATE.opening_reminder]) expect(openingProblem(o)).toBeNull()
    expect(timingProblem(DEFAULT_GATE)).toBeNull()
  })

  it('refuses wording that would make the gate useless or unsafe', () => {
    expect(templateProblem('pickup_eta', 'Someone is coming.')).toMatch(/Include the child/)
    expect(templateProblem('pickup_eta', '{{child_name}} is coming for pickup.')).toMatch(/when they arrive/)
    expect(templateProblem('pickup_eta', '{{child_name}} is coming {{eta}}.')).toMatch(/pickup/)
    expect(templateProblem('dropoff_eta', '{{child_name}} pickup {{eta}}.')).toMatch(/drop-off/)
    expect(templateProblem('pickup_eta', '{{child_name}} pickup {{eta}} {{phone}}.')).toMatch(/can't be used/)
    expect(templateProblem('pickup_arrived', '{{child_name}} pickup {{eta}}.')).toMatch(/can't be used/)
    expect(templateProblem('pickup_arrived', '{{child_name}} pickup soon.')).toMatch(/arrived/)
    expect(templateProblem('pickup_cancelled', 'Pickup for {{child_name}} is off.')).toMatch(/cancelled/)
    expect(templateProblem('pickup_eta', '{{child_name}} pickup {{eta}} <script>')).toMatch(/letters/)
    expect(templateProblem('pickup_eta', '{{child_name}} pickup {eta}.')).toMatch(/braces/)
    expect(templateProblem('pickup_eta', `{{child_name}} pickup {{eta}} ${'x'.repeat(200)}`)).toMatch(/under 200/)
    expect(templateProblem('pickup_eta', '{{child_name}} for {{direction}} {{eta}}.')).toBeNull()
    expect(templateProblem('pickup_late', "{{child_name}}'s {{relation}} will arrive for pickup {{eta}}.")).toMatch(/running late/)
    expect(templateProblem('pickup_late', 'Pickup update. {{child_name}} is late.')).toMatch(/when they arrive/)
    expect(templateProblem('dropoff_late', 'Drop-off update. {{child_name}} is running late, at {{arrival_time}}.')).toBeNull()
    expect(openingProblem('New {{child_name}}.')).not.toBeNull()
    expect(openingProblem('Hello. There.')).not.toBeNull()
    expect(timingProblem({ early_min: 10, ready_min: 10, urgent_min: 5, reminder_min: 2 })).toMatch(/before/)
    expect(timingProblem({ early_min: 15, ready_min: 10, urgent_min: 5, reminder_min: 4 })).toMatch(/listed/)
    // One-minute reminders can keep a busy gate speaking without a pause.
    expect(timingProblem({ early_min: 15, ready_min: 10, urgent_min: 5, reminder_min: 1 })).toMatch(/listed/)
  })

  it('renders the sample the editor previews', () => {
    const said = messageFor(DEFAULT_GATE, { kind: 'pickup', state: 'eta', eta: { kind: 'minutes', minutes: 10 }, arriveAt: new Date(inMin(10)) }, SAMPLE_CHILD, 'Mother')
    expect(said).toBe("Aarav Sharma's mother will arrive for pickup in about ten minutes. Please get Aarav ready.")
    const withTime = gateSettings({ pickup_eta: '{{child_name}} pickup at about {{arrival_time}}.' })
    expect(messageFor(withTime, { kind: 'pickup', state: 'eta', eta: etaOf(inMin(22), NOW), arriveAt: new Date(inMin(22)) }, SAMPLE_CHILD, null))
      .toBe('Aarav Sharma pickup at about one twenty two in the afternoon.')
  })

  it('never records a made-up clock time ahead', () => {
    const s = gateSettings({ pickup_eta: '{{child_name}} pickup {{eta}}, at {{arrival_time}}.' })
    const made = childMessages(s, { fullName: 'Aarav Sharma', name: 'Aarav', spoken: null }, ['Mother'])
    expect(made.some((m) => m.includes('pickup'))).toBe(true)
    expect(made.some((m) => /pickup .*at /.test(m) && !/cancel|arrived/.test(m))).toBe(false)
  })
})

describe('every announcement says the latest arrival time', () => {
  const say = (kind: 'pickup' | 'dropoff', state: 'eta' | 'late', arriveInMin: number, now = NOW, s = DEFAULT_GATE) =>
    messageFor(s, { kind, state, eta: etaOf(inMin(arriveInMin), now), arriveAt: new Date(inMin(arriveInMin)) }, SAMPLE_CHILD, 'Mother')

  it('on the way and reminders follow arrive_at as it moves, and as the clock does', () => {
    expect(say('pickup', 'eta', 10)).toContain('in about ten minutes')
    // The parent moved arrive_at 10 minutes later: the same moment now says fifteen, never the old ten.
    expect(say('pickup', 'eta', 15)).toContain('in about fifteen minutes')
    // A reminder two minutes on says the time left then.
    expect(messageFor(DEFAULT_GATE, { kind: 'pickup', state: 'eta', eta: etaOf(inMin(15), NOW + 10 * 60_000), arriveAt: new Date(inMin(15)) }, SAMPLE_CHILD, 'Mother')).toContain('in about five minutes')
    expect(say('dropoff', 'eta', 5)).toContain('in about five minutes')
  })

  it('running late says the new time, in the late wording', () => {
    expect(say('pickup', 'late', 15)).toBe("Pickup update. Aarav Sharma's mother is running late and will arrive in about fifteen minutes.")
    expect(say('dropoff', 'late', 5)).toBe('Drop-off update. Aarav Sharma is running late and will arrive in about five minutes.')
  })

  it('due says any moment now; overdue says how long ago, for both directions', () => {
    expect(say('pickup', 'eta', 0)).toContain('any moment now')
    expect(say('pickup', 'eta', -12)).toBe("Aarav Sharma's mother has not arrived for pickup yet and was expected about ten minutes ago.")
    expect(say('dropoff', 'eta', -12)).toBe('Aarav Sharma has not arrived for drop-off yet and was expected about ten minutes ago.')
    // An admin's wording can't turn it into "will arrive was expected".
    const custom = gateSettings({ pickup_eta: '{{child_name}} pickup {{eta}}.' })
    expect(say('pickup', 'eta', -12, NOW, custom)).toContain('has not arrived')
  })

  it('arrived and cancelled carry no time at all', () => {
    expect(messageFor(DEFAULT_GATE, { kind: 'pickup', state: 'arrived' }, SAMPLE_CHILD, 'Mother')).toBe("Aarav Sharma's mother has arrived for pickup. Please get Aarav ready.")
    expect(messageFor(DEFAULT_GATE, { kind: 'dropoff', state: 'cancelled' }, SAMPLE_CHILD, 'Mother')).toBe('Drop-off for Aarav Sharma is cancelled.')
  })

  it('an admin template with {{minutes}} or {{arrival_time}} still follows the latest time', () => {
    const s = gateSettings({ pickup_eta: '{{child_name}} pickup in {{minutes}} minutes, at {{arrival_time}}.' })
    expect(say('pickup', 'eta', 10, NOW, s)).toBe('Aarav Sharma pickup in ten minutes, at one ten in the afternoon.')
    expect(say('pickup', 'eta', 15, NOW, s)).toBe('Aarav Sharma pickup in fifteen minutes, at one fifteen in the afternoon.')
  })
})
