import regularUrl from '../fonts/PlusJakartaSans-Regular.ttf?url'
import semiboldUrl from '../fonts/PlusJakartaSans-SemiBold.ttf?url'
import boldUrl from '../fonts/PlusJakartaSans-ExtraBold.ttf?url'
import logoUrl from '../logo.png?url'
import { loadReport, logExport, NEW_VERSION, type Filters, type Format, type ReportKind } from '../api'
import { buildDoc, csv, type ReportDoc, type Sections, type Theme } from './doc'

export type Step = 'reading' | 'logging' | 'building' | 'done'

export { NEW_VERSION }
const bytes = async (url: string) => {
  const res = await fetch(url)
  // A deploy since this page opened removes the old files; the fallback page must not be read as a font.
  if (!res.ok || res.headers.get('content-type')?.includes('text/html')) throw new Error(NEW_VERSION)
  return new Uint8Array(await res.arrayBuffer())
}
const base64 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

const MIME: Record<Format, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv;charset=utf-8',
}

/**
 * Makes a download: the data read again with these filters (the server checks who is asking), the export logged and
 * given its Report ID, then the file made here in the browser. Nothing is stored on a server or reachable by a link.
 */
export async function makeExport(o: { kind: ReportKind; format: Format; filters: Filters; scope: string; sections: Sections; theme: Theme; onStep?: (s: Step) => void }): Promise<{ blob: Blob; name: string; reportId: string }> {
  o.onStep?.('reading')
  // The file maker and its fonts are fetched before the download is logged: a version deployed since this page opened
  // fails here, and no Report ID is recorded for a file that was never made.
  const [data, make] = await Promise.all([loadReport(o.filters), maker(o.kind, o.format)])
  o.onStep?.('logging')
  const log = await logExport(o.kind, o.format, o.filters)
  o.onStep?.('building')
  const sections = o.kind === 'executive' ? { ...o.sections, register: false } : o.sections
  const d = buildDoc({ data, reportId: log.report_id, generatedAt: log.generated_at, scope: o.scope, sections, theme: o.theme })
  const out = await make(d)
  o.onStep?.('done')
  const name = `jumpstart-${o.kind}-${o.filters.from}${o.filters.to !== o.filters.from ? `-to-${o.filters.to}` : ''}.${o.format}`
  return { blob: new Blob([out], { type: MIME[o.format] }), name, reportId: log.report_id }
}

type Maker = (d: ReportDoc) => ArrayBuffer | string | Promise<ArrayBuffer | string>
async function maker(kind: ReportKind, format: Format): Promise<Maker> {
  try {
    if (format === 'csv') return csv
    if (format === 'xlsx') return (await import('./xlsx')).workbook
    if (format === 'docx') {
      const [{ wordDocument }, logo] = await Promise.all([import('./docx'), bytes(logoUrl)])
      return (d) => wordDocument(d, logo)
    }
    const [pdf, regular, semibold, bold, logo] = await Promise.all([import('./pdf'), bytes(regularUrl), bytes(semiboldUrl), bytes(boldUrl), bytes(logoUrl)])
    const assets = { regular: base64(regular), semibold: base64(semibold), bold: base64(bold), logo }
    return (d) => (kind === 'executive' ? pdf.executivePdf(d, assets) : pdf.detailedPdf(d, assets))
  } catch {
    // The old build's files are gone (a chunk or a font that no longer loads).
    throw new Error(NEW_VERSION)
  }
}

/** Saves the file through the browser; the object URL lives only for the click. */
export function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
