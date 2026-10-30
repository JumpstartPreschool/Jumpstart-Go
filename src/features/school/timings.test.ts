import { describe, expect, it } from 'vitest'
import { ruleWindows, timingProblems } from './timings'

// Minutes since midnight: 525 = 8:45 AM, 540 = 9:00, 780 = 1:00 PM, 1140 = 7:00 PM, 1155 = 7:15 PM.
describe('programme timings (0019)', () => {
  it('starts from the 15-minute rule, and an extended day runs until 7 PM', () => {
    expect(ruleWindows(540, 780, false)).toEqual({ dropoff: [525, 540], pickup: [780, 795] })
    expect(ruleWindows(705, 1050, true)).toEqual({ dropoff: [540, 705], pickup: [1050, 1140] })
  })
  it('accepts windows set by hand inside the gate day', () => {
    expect(timingProblems(540, 780, [530, 560], [770, 800])).toEqual({})
  })
  it('says what is wrong, the same way the database does', () => {
    expect(timingProblems(540, 555, [525, 540], [555, 570]).hours).toBeTruthy()
    expect(timingProblems(540, 780, [520, 540], [780, 795]).dropoff).toBe('The gate opens at 8:45 AM.')
    expect(timingProblems(540, 780, [540, 530], [780, 795]).dropoff).toBe('Drop-off must end after it starts.')
    expect(timingProblems(540, 780, [525, 790], [780, 795]).dropoff).toBe('Drop-off must close by the time the class ends.')
    expect(timingProblems(540, 780, [525, 540], [530, 795]).pickup).toBe("Pickup can't open before the class starts.")
    expect(timingProblems(540, 780, [525, 540], [780, 1160]).pickup).toBe('The gate closes at 7:15 PM.')
  })
})
