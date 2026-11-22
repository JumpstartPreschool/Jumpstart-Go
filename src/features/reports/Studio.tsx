import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FileSpreadsheet, FileText, Presentation, Table2 } from 'lucide-react'
import { Download, Eye } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { SelectField } from '../../ui/Field'
import { Notice } from '../../ui/States'
import { useToast } from '../../ui/Toast'
import { NEW_VERSION, type Filters, type Format, type ReportKind } from './api'
import type { Row } from './engine'
import { DEFAULT_SECTIONS, THEMES, type Sections } from './exports/doc'
import type { Step } from './exports/run'
import { isNativeAndroid } from '../../native/duty'

const KINDS: Record<ReportKind, { title: string; text: string; icon: ReactNode; formats: Format[] }> = {
  executive: { title: 'Executive summary', text: 'One A4 landscape page: six key figures, three charts, insights and exceptions.', icon: <Presentation />, formats: ['pdf', 'docx', 'xlsx'] },
  register: { title: 'Attendance register', text: 'Every child-day with its verified events, statuses and exceptions.', icon: <Table2 />, formats: ['xlsx', 'csv', 'docx'] },
  detailed: { title: 'Detailed attendance (PDF)', text: 'The register as numbered A4 pages, for printing and filing.', icon: <FileText />, formats: ['pdf'] },
}
const FORMAT: Record<Format, string> = { pdf: 'PDF', xlsx: 'Excel (.xlsx)', docx: 'Word (.docx)', csv: 'CSV' }
const STEP: Record<Step, string> = { reading: 'Reading the latest attendance…', logging: 'Recording this download…', building: 'Making the file…', done: 'Ready.' }
const SECTION_LABEL: Array<[keyof Sections, string, string]> = [
  ['kpis', 'Key figures', ''], ['charts', 'Charts', ''], ['insights', 'Insights', ''], ['exceptions', 'Exceptions', ''],
  ['register', 'Register rows', 'Not in the one-page summary'], ['names', 'Staff and guardian names', 'Personal data: include only when needed'], ['notes', 'Notes', 'May contain health details'],
]

/** The Download Studio: what, in which format, which sections and look; a real PDF preview; progress and errors in words. */
export function Studio({ filters, scope, rows }: { filters: Filters; scope: string; rows: Row[] }) {
  const toast = useToast()
  const [kind, setKind] = useState<ReportKind>('executive')
  const [format, setFormat] = useState<Format>('pdf')
  const [childId, setChildId] = useState('')
  const [sections, setSections] = useState<Sections>(DEFAULT_SECTIONS)
  const [theme, setTheme] = useState<keyof typeof THEMES>('navy')
  const [step, setStep] = useState<Step | null>(null)
  const [action, setAction] = useState<'preview' | 'download' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  // The choices a preview was made from: any change clears it, and a preview finished for older choices is dropped.
  const choices = JSON.stringify([kind, format, childId, sections, theme, filters])
  const current = useRef(choices)
  current.current = choices
  useEffect(() => setPreview(null), [choices])
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  // The Android app's web view saves no files and Chrome on Android shows no PDF inside a page.
  const inApp = isNativeAndroid()
  const canPreview = !inApp && (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false

  const children = useMemo(() => [...new Map(rows.map((r) => [r.child_id, r.child])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows])
  const chosen = { ...filters, childId: childId || null }
  const scopeText = childId ? `${children.find(([id]) => id === childId)?.[1]} · ${scope}` : scope
  const busy = action !== null

  const choose = (k: ReportKind) => { setKind(k); if (!KINDS[k].formats.includes(format)) setFormat(KINDS[k].formats[0]!) }

  async function run(show: boolean) {
    setError(null)
    setPreview(null)
    setAction(show ? 'preview' : 'download')
    const made = choices
    try {
      const { makeExport, save } = await import('./exports/run').catch(() => { throw new Error(NEW_VERSION) })
      const out = await makeExport({ kind, format, filters: chosen, scope: scopeText, sections, theme: THEMES[theme], onStep: setStep })
      if (show) { if (mounted.current && current.current === made) setPreview(URL.createObjectURL(out.blob)) }
      else { save(out.blob, out.name); toast(`Downloaded ${out.name} (${out.reportId}).`) }
    } catch (e) {
      setStep(null)
      setError((e as Error).message || "Couldn't make the file. Try again.")
    } finally {
      setAction(null)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="grid content-start gap-5">
        <fieldset className="grid gap-3">
          <legend className="kicker mb-2">Report</legend>
          {(Object.keys(KINDS) as ReportKind[]).map((k) => (
            <button key={k} type="button" className="choice flex items-center gap-3.5 p-3.5 text-left" aria-pressed={kind === k} onClick={() => choose(k)}>
              <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent [&_svg]:size-[22px]" aria-hidden>{KINDS[k].icon}</span>
              <span className="min-w-0"><span className="block text-h4">{KINDS[k].title}</span><span className="block text-small font-semibold text-ink-2">{KINDS[k].text}</span></span>
            </button>
          ))}
        </fieldset>
        <fieldset>
          <legend className="kicker mb-2">Format</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS[kind].formats.map((f) => (
              <button key={f} type="button" className="choice flex min-h-11 items-center gap-2 px-4 py-2.5 text-small font-bold" aria-pressed={format === f} onClick={() => setFormat(f)}>
                {f === 'pdf' || f === 'docx' ? <FileText className="size-4" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />}{FORMAT[f]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Child (optional)" value={childId} onValue={setChildId}>
            <option value="">Every child in the filters</option>
            {children.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </SelectField>
          <SelectField label="Design" value={theme} onValue={(v) => setTheme(v as keyof typeof THEMES)}>
            {(Object.keys(THEMES) as Array<keyof typeof THEMES>).map((t) => <option key={t} value={t}>{THEMES[t].name}</option>)}
          </SelectField>
        </div>
        {format !== 'csv' && (
          <fieldset>
            <legend className="kicker mb-2">Include</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SECTION_LABEL.filter(([k]) => kind !== 'executive' || (k !== 'register' && k !== 'names' && k !== 'notes')).map(([k, label, hint]) => (
                <li key={k}>
                  <label className="flex items-start gap-2.5 rounded-lg bg-sunken px-3 py-2.5 text-small font-bold">
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={sections[k]} onChange={(e) => setSections((s) => ({ ...s, [k]: e.target.checked }))} />
                    <span>{label}{hint && <span className="block text-caption font-semibold text-ink-2">{hint}</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {format === 'csv' && (
          <label className="flex items-start gap-2.5 rounded-lg bg-sunken px-3 py-2.5 text-small font-bold">
            <input type="checkbox" className="mt-0.5 size-4" checked={sections.names} onChange={(e) => setSections((s) => ({ ...s, names: e.target.checked }))} />
            <span>Staff and guardian names<span className="block text-caption font-semibold text-ink-2">Personal data: include only when needed</span></span>
          </label>
        )}
        <Notice tone="info">
          Uses the period and filters above, read again from the school's records when you download. Every download is recorded with its Report ID. Files are made on this device and never stored online.
        </Notice>
        {inApp && <Notice tone="warning">The Jumpstart Go app can't save files yet. Open Jumpstart Go in Chrome or on a computer to download reports.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap gap-3">
          {format === 'pdf' && canPreview && <Button variant="secondary" icon={<Eye />} loading={action === 'preview'} disabled={busy} onClick={() => void run(true)}>Preview</Button>}
          <Button icon={<Download />} loading={action === 'download'} disabled={busy || inApp} onClick={() => void run(false)}>Download {FORMAT[format]}</Button>
        </div>
        <p className="min-h-5 text-small font-semibold text-ink-2" aria-live="polite">{step ? STEP[step] : ''}</p>
      </div>
      <section className="card min-h-[420px] overflow-hidden rounded-xl" aria-label="Preview">
        {preview ? (
          <iframe title="Report preview" src={preview} className="h-full min-h-[560px] w-full border-0" />
        ) : (
          <div className="grid h-full min-h-[420px] place-items-center p-8 text-center">
            <p className="max-w-[36ch] text-small font-semibold text-ink-2">
              {format !== 'pdf' ? `${FORMAT[format]} files open in their own app; download to see them.`
                : canPreview ? 'Preview shows the PDF exactly as it will download.' : "This browser can't show a PDF inside the page; download it to see it."}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
