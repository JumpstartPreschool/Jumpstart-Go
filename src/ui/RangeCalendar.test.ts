import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, nextRange } from './RangeCalendar'

describe('range calendar', () => {
  it('counts across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28)
  })
  it('starts, ends, and restarts a range', () => {
    const start = nextRange({ from: '2026-10-01', to: '2026-10-01' }, '2026-10-05', false)
    expect(start).toEqual({ from: '2026-10-05', to: '2026-10-05' })
    expect(nextRange(start, '2026-10-09', true)).toEqual({ from: '2026-10-05', to: '2026-10-09' })
    expect(nextRange(start, '2026-10-02', true)).toEqual({ from: '2026-10-02', to: '2026-10-02' })
  })
})
