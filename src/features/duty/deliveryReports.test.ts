// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

const rpc = vi.fn(async () => ({ data: null, error: null }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }))

const { reportHeard } = await import('./useDuty')
const { tripFromUrl } = await import('./GateQueue')

const TRIP = '00000000-0000-0000-0000-000000059d02'

describe('reportHeard', () => {
  it('reports a trip announcement to the server', () => {
    reportHeard(`trip:${TRIP}`)
    expect(rpc).toHaveBeenCalledWith('gate_heard', { p_trip: TRIP })
  })
  it('ignores cancellations, the sound check and anything else', () => {
    rpc.mockClear()
    reportHeard(`trip:${TRIP}:cancel`)
    reportHeard('sound-check')
    reportHeard('trip:not-a-uuid')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('never throws when the server refuses', async () => {
    rpc.mockImplementationOnce(async () => { throw new Error('offline') })
    expect(() => reportHeard(`trip:${TRIP}`)).not.toThrow()
    await Promise.resolve()
  })
})

describe('tripFromUrl', () => {
  it('reads the request a notification opened, without side effects (React may call it twice)', () => {
    history.replaceState(null, '', `/coordinator?trip=${TRIP}`)
    expect(tripFromUrl()).toBe(TRIP)
    expect(tripFromUrl()).toBe(TRIP)
  })
  it('reads a url the service worker posted without touching the address', () => {
    history.replaceState(null, '', '/coordinator')
    expect(tripFromUrl(`/coordinator?trip=${TRIP}`)).toBe(TRIP)
  })
  it('ignores anything that is not a trip id', () => {
    expect(tripFromUrl('/coordinator?trip=<script>')).toBeNull()
    expect(tripFromUrl('/coordinator')).toBeNull()
  })
})
