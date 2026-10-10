import { supabase } from './supabase'

const RETRY_FIRST_MS = 1_000
const RETRY_MAX_MS = 30_000

/**
 * Calls `onChange` whenever rows in `table` change (inserts, updates, deletes the reader may see).
 * Uses Supabase Realtime, which applies row-level security per subscriber. Returns a function that stops listening.
 *
 * A dropped connection is never silent: after an error or timeout the channel is made again with a growing wait, and
 * every time the connection comes back (and when the app returns to the screen or the network returns) `onChange` runs
 * once, so the caller reads the table afresh and nothing changed in the gap is missed.
 */
export function onTableChange(table: string, onChange: () => void): () => void {
  let stopped = false
  let channel: ReturnType<typeof supabase.channel> | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let wait = RETRY_FIRST_MS
  let joinedBefore = false

  const connect = () => {
    if (stopped) return
    const mine = supabase
      .channel(`live-${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      .subscribe((status) => {
        if (stopped || channel !== mine) return
        if (status === 'SUBSCRIBED') {
          wait = RETRY_FIRST_MS
          // Rows may have changed while it was down; the first join needs no catch-up (the caller has just read).
          if (joinedBefore) onChange()
          joinedBefore = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          joinedBefore = true // the next join catches up, even if this one never joined
          void supabase.removeChannel(mine)
          channel = null
          retry = setTimeout(connect, wait)
          wait = Math.min(wait * 2, RETRY_MAX_MS)
        }
      })
    channel = mine
  }
  connect()

  const refresh = () => { if (document.visibilityState !== 'hidden') onChange() }
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('online', refresh)
  return () => {
    stopped = true
    clearTimeout(retry)
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('online', refresh)
    if (channel) void supabase.removeChannel(channel)
  }
}
