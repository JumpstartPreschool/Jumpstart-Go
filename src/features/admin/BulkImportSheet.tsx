import { useRef, useState, type DragEvent } from 'react'
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Info, RotateCcw, TriangleAlert, Upload } from '../../ui/icons'
import { Button } from '../../ui/Button'
import { Sheet, SheetFooter } from '../../ui/Sheet'
import { Notice } from '../../ui/States'
import type { ProgrammeRow } from './api'
import { checkRows, readSheet, templateCsv, toCsv, COLUMNS, type ImportRow } from './bulkImport'
import { clearImport, startImport, useImportJob } from './importJob'
import { Progress } from './ImportBanner'

type Step =
  | { name: 'choose'; error: string | null }
  | { name: 'preview'; file: string; header: string[]; rows: ImportRow[] }

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

/** The rows to look at again, with a column saying what to fix, ready to correct and upload again. */
export function fixList(header: string[], rows: ImportRow[], failed: Map<number, string>) {
  const out = rows.filter((r) => r.problems.length || r.warnings.length || failed.has(r.line))
  return toCsv([[...header, 'What to fix'], ...out.map((r) => [...header.map((_, i) => r.cells[i] ?? ''), [...r.problems, failed.get(r.line), ...r.warnings].filter(Boolean).join(' ')])])
}

/**
 * Bulk upload (D37): the admin or the head office uploads a CSV or Excel sheet of children and their families. Every row
 * is checked and shown first. Rows with only the essentials go in, with what's missing listed to add later; the import
 * keeps going if the sheet is closed, and a banner shows its progress and result (ImportBanner).
 */
export function BulkImportSheet({ programmes, onClose }: { programmes: ProgrammeRow[]; onClose: () => void }) {
  const job = useImportJob()
  const [step, setStep] = useState<Step>({ name: 'choose', error: null })
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
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
      clearImport()
      setStep({ name: 'preview', file: file.name, header: sheet[0] ?? [], rows })
    } catch (e) {
      const why = (e as Error).message
      setStep({ name: 'choose', error: why === 'old_excel' ? 'That is the old Excel format (.xls). In Excel, choose File, Save As, then Excel Workbook (.xlsx) or CSV, and upload that.' : "That file couldn't be read. Upload a CSV or an Excel (.xlsx) file." })
    }
  }

  const showJob = job && step.name !== 'preview'
  return (
    <Sheet open onClose={onClose} wide title="Bulk upload children"
      description={showJob ? job.file : 'From a CSV or Excel sheet. You check the list first.'}>
      {!showJob && step.name === 'choose' && (
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
        const clean = step.rows.filter((r) => !r.problems.length && !r.warnings.length)
        const gaps = step.rows.filter((r) => !r.problems.length && r.warnings.length)
        const bad = step.rows.filter((r) => r.problems.length)
        const going = clean.length + gaps.length
        const tone = (r: ImportRow) => r.problems.length ? 'bg-danger-soft' : r.warnings.length ? 'bg-warning-soft' : 'bg-sunken'
        return (
          <>
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <Count n={clean.length} label="Ready" tone="text-live" />
                <Count n={gaps.length} label="Details to add later" tone="text-warning" />
                <Count n={bad.length} label="Can't add yet" tone="text-danger" />
              </div>
              <ul className="grid max-h-[42dvh] gap-2 overflow-y-auto pr-1">
                {step.rows.map((r) => (
                  <li key={r.line} className={`flex gap-3 rounded-lg p-3 ${tone(r)}`}>
                    {r.problems.length ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                      : r.warnings.length ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                      : <CircleCheck className="mt-0.5 size-5 shrink-0 text-live" aria-hidden />}
                    <div className="min-w-0">
                      <p className="text-h4"><span className="sr-only">{r.problems.length ? "Can't add: " : r.warnings.length ? 'Added with gaps: ' : 'Ready: '}</span>{r.childName || 'No name'} <span className="text-small font-semibold text-ink-2">· row {r.line}</span></p>
                      {r.problems.length > 0 && <ul className="mt-0.5 text-small font-semibold text-ink">{r.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
                      {!r.problems.length && <p className="text-small font-semibold text-ink-2">{r.programmeName} · {r.people.map((p) => `${p.full_name} (${p.relation})`).join(', ')}</p>}
                      {!r.problems.length && r.warnings.length > 0 && <ul className="mt-0.5 text-small font-semibold text-ink">{r.warnings.map((p) => <li key={p}>{p}</li>)}</ul>}
                    </div>
                  </li>
                ))}
              </ul>
              {(gaps.length > 0 || bad.length > 0) && (
                <Notice tone="info" icon={<Info aria-hidden />}>
                  {gaps.length > 0 && `${plural(gaps.length, 'child', 'children')} go in now; add the missing details later on each child's page. `}
                  {bad.length > 0 && `${plural(bad.length, 'row')} need a name, programme or parent first: download them after the import, fix and upload again.`}
                </Notice>
              )}
            </div>
            <SheetFooter>
              <div className="flex flex-wrap gap-2.5 [&>*]:grow [&>*]:basis-44">
                <Button variant="secondary" icon={<RotateCcw />} onClick={() => setStep({ name: 'choose', error: null })}>Choose another file</Button>
                <Button icon={<Upload />} disabled={!going} onClick={() => { void startImport(step.file, step.header, step.rows); setStep({ name: 'choose', error: null }) }}>Add {plural(going, 'child', 'children')}</Button>
              </div>
            </SheetFooter>
          </>
        )
      })()}

      {showJob && !job.finished && (
        <div className="grid gap-4 py-4" aria-live="polite">
          <p className="text-h3">Adding {job.done} of {plural(job.total, 'child', 'children')}…</p>
          <Progress done={job.done} total={job.total} />
          <p className="text-small font-semibold text-ink-2">You can close this and keep working. A banner at the bottom shows how it's going.</p>
          <SheetFooter><Button variant="secondary" className="w-full" onClick={onClose}>Keep working</Button></SheetFooter>
        </div>
      )}

      {showJob && job.finished && (() => {
        const addedRows = job.rows.filter((r) => !r.problems.length && !job.failed.has(r.line))
        const gaps = addedRows.filter((r) => r.warnings.length)
        const notAdded = job.rows.filter((r) => r.problems.length || job.failed.has(r.line))
        return (
          <>
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <Count n={job.added} label="Added" tone="text-live" />
                <Count n={gaps.length} label="Details to add" tone="text-warning" />
                <Count n={notAdded.length} label="Not added" tone="text-danger" />
              </div>
              {notAdded.length > 0 && (
                <ul className="grid max-h-[32dvh] gap-2 overflow-y-auto">
                  {notAdded.map((r) => <li key={r.line} className="rounded-lg bg-danger-soft p-3 text-small font-semibold"><b className="text-ink">{r.childName || 'No name'}</b> (row {r.line}): {job.failed.get(r.line) ?? r.problems.join(' ')}</li>)}
                </ul>
              )}
              {gaps.length > 0 && <Notice tone="warning">{plural(gaps.length, 'child', 'children')} still need details, like a date of birth or a mobile. Add them on each child's page, or download the list.</Notice>}
            </div>
            <SheetFooter>
              <div className="flex flex-wrap gap-2.5 [&>*]:grow [&>*]:basis-44">
                {(notAdded.length > 0 || gaps.length > 0) && <Button variant="secondary" icon={<Download />} onClick={() => download('children-to-check.csv', fixList(job.header, job.rows, job.failed))}>Download what to fix</Button>}
                <Button onClick={() => { clearImport(); onClose() }}>Done</Button>
              </div>
            </SheetFooter>
          </>
        )
      })()}
    </Sheet>
  )
}

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl bg-sunken px-2 py-3">
      <p className={`text-h2 tabular-nums ${n ? tone : 'text-ink-3'}`}>{n}</p>
      <p className="text-caption font-bold text-ink-2">{label}</p>
    </div>
  )
}
