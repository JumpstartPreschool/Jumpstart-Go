import { supabase } from './supabase'

/**
 * Calls `onChange` whenever rows in `table` change (inserts, updates, deletes the reader may see).
 * Uses Supabase Realtime, which applies row-level security per subscriber. Returns a function that stops listening.
 */
export function onTableChange(table: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`live-${table}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    .subscribe()
  return () => void supabase.removeChannel(channel)
}
