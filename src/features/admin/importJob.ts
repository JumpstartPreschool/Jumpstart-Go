import { useEffect, useSyncExternalStore } from 'react'
import { explainDbError, importChild } from './api'
import type { ImportRow } from './bulkImport'

/**
 * The bulk upload that's running (or just finished). It lives outside the sheet, so closing the sheet or moving to another
 * page doesn't stop it: the banner (ImportBanner) shows its progress and the result until it's dismissed.
 */
export interface ImportJob {
  file: string
  header: string[]
  rows: ImportRow[]
  total: number
  done: number
  added: number
  /** Rows the school's records turned down, with the reason in words. */
  failed: Map<number, string>
  finished: boolean
}

let job: ImportJob | null = null
const listeners = new Set<() => void>()
const set = (next: ImportJob | null) => { job = next; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l) }

export const useImportJob = () => useSyncExternalStore(subscribe, () => job)
/** Runs once when an upload finishes with children added (a page reloads its list), even if the sheet was closed. */
export function useAfterImport(then: (added: number) => void) {
  const j = useImportJob()
  const finishedWith = j?.finished ? j.added : 0
  useEffect(() => { if (finishedWith) then(finishedWith) }, [finishedWith, j])
}
export const clearImport = () => { if (!job || job.finished) set(null) }

/** Imports the rows that are ready, one by one; a row the database turns down never stops the rest. */
export async function startImport(file: string, header: string[], rows: ImportRow[]) {
  if (job && !job.finished) return
  const ready = rows.filter((r) => !r.problems.length && r.child)
  set({ file, header, rows, total: ready.length, done: 0, added: 0, failed: new Map(), finished: false })
  for (const r of ready) {
    const failed = new Map(job!.failed)
    let added = job!.added
    try {
      await importChild(r.child!, r.people)
      added++
    } catch (e) {
      const err = e as { code?: string; message?: string }
      failed.set(r.line, err.code === '23505'
        ? 'An email or mobile on this row belongs to someone whose access is turned off. Turn them back on in People, or use another number.'
        : explainDbError(err))
    }
    set({ ...job!, done: job!.done + 1, added, failed })
  }
  set({ ...job!, finished: true })
}

// Leaving the page mid-upload would stop it: the browser asks first.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => { if (job && !job.finished) e.preventDefault() })
}
