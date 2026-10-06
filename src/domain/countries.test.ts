import { describe, expect, it } from 'vitest'
import { COUNTRIES, fullNumber, INDIA, splitNumber } from './countries'

const by = (iso: string) => COUNTRIES.find((c) => c.iso === iso)!

describe('country codes for the sign-in number', () => {
  it('lists every country once, with a name and a flag', () => {
    expect(COUNTRIES.length).toBeGreaterThan(230)
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length)
    expect(INDIA).toMatchObject({ dial: '91', name: 'India', flag: '🇮🇳' })
    expect(by('AE').name).toBe('United Arab Emirates')
  })
  it('takes exactly 10 digits for India, and other countries without their code', () => {
    expect(fullNumber(INDIA, '98765 43210')).toBe('+919876543210')
    expect(fullNumber(INDIA, '09876543210')).toBe('+919876543210')
    expect(fullNumber(INDIA, '12345 67890')).toBeNull()
    expect(fullNumber(INDIA, '98765')).toBeNull()
    expect(fullNumber(by('AE'), '50 123 4567')).toBe('+971501234567')
    expect(fullNumber(by('US'), '415 555 2671')).toBe('+14155552671')
    expect(fullNumber(by('AE'), '12')).toBeNull()
  })
  it('splits a stored number back into its country', () => {
    expect(splitNumber('+919220991947')).toEqual({ country: INDIA, rest: '9220991947' })
    expect(splitNumber('+971501234567').country.iso).toBe('AE')
    expect(splitNumber('+14155552671').country.iso).toBe('US')
    expect(splitNumber('+12425551234').country.iso).toBe('BS')
    expect(splitNumber('+447700900123').country.iso).toBe('GB')
  })
})
