import { useRef, useState, type DragEvent } from 'react'
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, RotateCcw, Upload } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import { explainDbError, importChild, type ProgrammeRow } from './api'
import { checkRows, readSheet, templateCsv, toCsv, COLUMNS, type ImportRow } from './bulkImport'

type Step =
  | { name: 'choose'; error: string | null }
  | { name: 'preview'; file: string; header: string[]; rows: ImportRow[] }
  | { name: 'importing'; file: string; header: string[]; rows: ImportRow[]; done: number; failed: Map<number, string> }
  | { name: 'finished'; header: string[]; rows: ImportRow[]; added: number; failed: Map<number, string> }

/** Saves a text file on this device (the template, or the rows that still need fixing). */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Bulk upload (D37): the admin or the core team uploads a CSV or Excel sheet of children and their families. Every row
 * is checked and shown first; the good ones are imported one by one (a bad row never stops the rest), and anything that
 * couldn't be added can be downloaded, fixed and uploaded again.
 */
export function BulkImportSheet({ programmes, onClose, onImported }: { programmes: ProgrammeRow[]; onClose: () => void; onImported: (added: number) => void }) {
  const [step, setStep] = useState<Step>({ name: 'choose', error: null })
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const stop = useRef(false)
  const active = programmes.filter((p) => p.name)

  async function choose(file: File | undefined) {
    if (!file) return
    if (file.size > 5_000_000) return setStep({ name: 'choose', error: 'That file is over 5 MB. A sheet of children is usually far smaller: check it is the right file.' })
    try {
      const sheet = await readSheet(file)
      const { rows, missing } = checkRows(sheet, active)
      if (missing.length) return setStep({ name: 'choose', error: `The sheet needs these columns: ${missing.join(', ')}. Download the template to see them all.` })
      if (!rows.length) return setStep({ name: 'choose', error: 'The sheet has no children in it, only the header row.' })
      if (rows.length > 500) return setStep({ name: 'choose', error: `The sheet has ${rows.length} rows. Upload up to 500 at a time.` })
      setStep({ name: 'preview', file: file.name, header: sheet[0] ?? [], rows })
    } catch (e) {
      const why = (e as Error).message
      setStep({ name: 'choose', error: why === 'old_excel' ? 'That is the old Excel format (.xls). In Excel, choose File, Save As, then Excel Workbook (.xlsx) or CSV, and upload that.' : "That file couldn't be read. Upload a CSV or an Excel (.xlsx) file." })
    }
  }

  async function run(from: Extract<Step, { name: 'preview' }>) {
    stop.current = false
    const ready = from.rows.filter((r) => !r.problems.length && r.child)
    const failed = new Map<number, string>()
    let added = 0
    setStep({ ...from, name: 'importing', done: 0, failed })
    for (const [i, r] of ready.entries()) {
      if (stop.current) break
      try {
        await importChild(r.child!, r.people)
        added++
      } catch (e) {
        const err = e as { code?: string; message?: string }
        failed.set(r.line, err.code === '23505'
          ? "An email or mobile on this row belongs to someone whose access is turned off. Turn them back on in People, or use another number."
          : explainDbError(err))
      }
      setStep({ ...from, name: 'importing', done: i + 1, failed: new Map(failed) })
    }
    setStep({ name: 'finished', header: from.header, rows: from.rows, added, failed })
    if (added) onImported(added)
  }

  /** The rows still to do, with a Problem column, ready to fix and upload again. */
  function fixList(header: string[], rows: ImportRow[], failed: Map<number, string>) {
    const out = rows.filter((r) => r.problems.length || failed.has(r.line))
    return toCsv([[...header, 'Problem'], ...out.map((r) => [...header.map((_, i) => r.cells[i] ?? ''), [...r.problems, failed.get(r.line)].filter(Boolean).join(' ')])])
  }

  const busy = step.name === 'importing'
  return (
    <Sheet open onClose={() => { if (busy) stop.current = true; onClose() }} wide title="Bulk upload children"
      description="From a CSV or Excel sheet. You check the list first.">
      {step.name === 'choose' && (
        <div className="grid gap-5">
          <label
            onDragOver={(e: DragEvent) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => { e.preventDefault(); setDragging(false); void choose(e.dataTransfer.files[0]) }}
            className={`grid cursor-pointer justify-items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 ${dragging ? 'border-accent bg-accent-soft' : 'border-line-2 bg-sunken hover:border-line-hover'}`}>
            <FileSpreadsheet className="size-9 text-accent" aria-hidden />
            <span className="text-h4">Choose a CSV or Excel file</span>
            <span className="text-small font-semibold text-ink-2">or drop it here. One child per row, up to 500.</span>
            <input ref={input} type="file" className="sr-only" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {step.error && <Notice tone="danger">{step.error}</Notice>}
          <div className="grid gap-3 rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-h4">Start from the template</p>
                <p className="text-small font-semibold text-ink-2">{COLUMNS.length} columns; the ones marked * are needed. Opens in Excel or Google Sheets.</p>
              </div>
              <Button size="md" variant="secondary" icon={<Download />} onClick={() => download('jumpstart-children-template.csv', templateCsv(active[0]?.name ?? 'Nursery · 360°'))}>Template</Button>
            </div>
            <details className="text-small font-semibold text-ink-2">
              <summary className="cursor-pointer text-accent-ink">See the {COLUMNS.length} columns</summary>
              <p className="mt-1.5">{COLUMNS.map((c, i) => <span key={c.field}>{c.header}{c.required ? '*' : ''}{i < COLUMNS.length - 1 ? ', ' : ''}</span>)}</p>
            </details>
            <details className="text-small font-semibold text-ink-2">
              <summary className="cursor-pointer py-1 font-bold text-accent-ink">Programme names to use</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">{active.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
              <p className="mt-2">Capitals, spaces and the "·" don't matter: "nursery 360" works.</p>
            </details>
            <p className="text-small font-semibold text-ink-2">Dates as DD/MM/YYYY. People already on record are linked, not added twice.</p>
          </div>
        </div>
      )}

      {step.name === 'preview' && (() => {
        const ready = step.rows.filter((r) => !r.problems.length)
        const bad = step.rows.filter((r) => r.problems.length)
        return (
          <>
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-h4">{step.file}</p>
                <span className="text-small font-bold text-live">{plural(ready.length, 'child', 'children')} ready</span>
                {bad.length > 0 && <span className="text-small font-bold text-warning">{plural(bad.length, 'row')} to fix</span>}
              </div>
              <ul className="grid max-h-[46dvh] gap-2 overflow-y-auto pr-1">
                {step.rows.map((r) => (
                  <li key={r.line} className={`flex gap-3 rounded-lg p-3 ${r.problems.length ? 'bg-warning-soft' : 'bg-sunken'}`}>
                    {r.problems.length ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-live" aria-hidden />}
                    <div className="min-w-0">
                      <p className="text-h4"><span className="sr-only">{r.problems.length ? 'To fix: ' : 'Ready: '}</span>{r.childName || 'No name'} <span className="text-small font-semibold text-ink-2">· row {r.line}</span></p>
                      {r.problems.length
                        ? <ul className="mt-0.5 text-small font-semibold text-ink">{r.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                        : <p className="text-small font-semibold text-ink-2">{r.programmeName} · {r.people.map((p) => `${p.full_name} (${p.relation})`).join(', ')}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              {bad.length > 0 && <Notice tone="warning">Rows to fix are left out. Import the rest now, then download them, fix and upload again.</Notice>}
            </div>
            <SheetFooter>
              <div className="flex flex-wrap gap-2.5 [&>*]:grow [&>*]:basis-44">
                <Button variant="secondary" icon={<RotateCcw />} onClick={() => setStep({ name: 'choose', error: null })}>Choose another file</Button>
                <Button icon={<Upload />} disabled={!ready.length} onClick={() => void run(step)}>Import {plural(ready.length, 'child', 'children')}</Button>
              </div>
            </SheetFooter>
          </>
        )
      })()}

      {step.name === 'importing' && (() => {
        const total = step.rows.filter((r) => !r.problems.length).length
        return (
          <div className="grid gap-4 py-6" aria-live="polite">
            <p className="text-h3">Importing {step.done} of {total}…</p>
            <div className="h-2.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step.done} aria-label="Import progress">
              <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${total ? (step.done / total) * 100 : 0}%` }} />
            </div>
            <p className="text-small font-semibold text-ink-2">Keep this open until it finishes. Closing stops after the child being saved.</p>
          </div>
        )
      })()}

      {step.name === 'finished' && (() => {
        const toFix = step.rows.filter((r) => r.problems.length || step.failed.has(r.line))
        return (
          <>
            <div className="grid gap-4">
              <Notice tone={step.added ? 'success' : 'warning'} icon={step.added ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}>
                {step.added ? `${plural(step.added, 'child', 'children')} added with their families.` : 'No children were added.'}
                {toFix.length ? ` ${plural(toFix.length, 'row')} still to fix.` : ''}
              </Notice>
              {step.failed.size > 0 && (
                <ul className="grid gap-2">
                  {[...step.failed].map(([line, why]) => {
                    const r = step.rows.find((x) => x.line === line)!
                    return <li key={line} className="rounded-lg bg-warning-soft p-3 text-small font-semibold"><b className="text-ink">{r.childName}</b> (row {line}): {why}</li>
                  })}
                </ul>
              )}
            </div>
            <SheetFooter>
              <div className="flex flex-wrap gap-2.5 [&>*]:grow [&>*]:basis-44">
                {toFix.length > 0 && <Button variant="secondary" icon={<Download />} onClick={() => download('children-to-fix.csv', fixList(step.header, step.rows, step.failed))}>Download rows to fix</Button>}
                <Button onClick={onClose}>Done</Button>
              </div>
            </SheetFooter>
          </>
        )
      })()}
    </Sheet>
  )
}
