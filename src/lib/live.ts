import { supabase } from './supabase'
import { DEMO_CHANGE_EVENT, DEMO_DB_KEY, isDemo } from '../demo/demo'

/**
 * Calls `onChange` whenever rows in `table` change (inserts, updates, deletes the reader may see).
 * Real mode uses Supabase Realtime, which applies row-level security per subscriber; demo mode listens to the
 * in-browser sample data. Returns a function that stops listening.
 */
export function onTableChange(table: string, onChange: () => void): () => void {
  if (isDemo()) {
    const onStorage = (e: StorageEvent) => e.key === DEMO_DB_KEY && onChange()
    window.addEventListener(DEMO_CHANGE_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(DEMO_CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }
  const channel = supabase
    .channel(`live-${table}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    .subscribe()
  return () => void supabase.removeChannel(channel)
}
