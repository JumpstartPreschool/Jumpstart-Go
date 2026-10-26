import { afterEach, expect, it, vi } from 'vitest'
import { sampleReport } from './fixture'
import { DEFAULT_SECTIONS, THEMES } from './doc'

const api = vi.hoisted(() => ({ loadReport: vi.fn(), logExport: vi.fn() }))
vi.mock('../api', () => api)
const { makeExport, NEW_VERSION } = await import('./run')
const o = { kind: 'executive' as const, format: 'pdf' as const, filters: { from: '2026-10-01', to: '2026-10-31', classId: null, programmeId: null, childId: null }, scope: 'All', sections: DEFAULT_SECTIONS, theme: THEMES.navy }
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it('after a deploy removed the fonts, says to reload and logs no download for a file never made', async () => {
  api.loadReport.mockResolvedValue(sampleReport())
  api.logExport.mockResolvedValue({ report_id: 'JSG-1', generated_at: '2026-10-31T10:00:00Z' })
  // The site's fallback page answers for the old font's address.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })))
  await expect(makeExport(o)).rejects.toThrow(NEW_VERSION)
  expect(api.logExport).not.toHaveBeenCalled()
})

it('a CSV needs nothing fetched: logged once, then made', async () => {
  api.loadReport.mockResolvedValue(sampleReport({ children: 2 }))
  api.logExport.mockResolvedValue({ report_id: 'JSG-2', generated_at: '2026-10-31T10:00:00Z' })
  const out = await makeExport({ ...o, kind: 'register', format: 'csv' })
  expect(api.logExport).toHaveBeenCalledTimes(1)
  expect(out.reportId).toBe('JSG-2')
  expect(out.name).toBe('jumpstart-register-2026-10-01-to-2026-10-31.csv')
})
