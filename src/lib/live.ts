import { supabase } from './supabase'

const RETRY_FIRST_MS = 1_000
const RETRY_MAX_MS = 30_000
const NATIVE_POLL_MS = 30_000

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
  // Android app on duty: its service pokes the page every 5 s, also with the screen off. Read afresh every 30 s then, so a
  // connection that died quietly while the phone slept can't hide a pickup.
  // A push reached this device (public/push-sw.js): something changed, and the live connection may have died while the
  // device slept, so read afresh.
  const onPush = (e: MessageEvent) => { if ((e.data as { type?: string } | null)?.type === 'jumpstart-push') onChange() }
  navigator.serviceWorker?.addEventListener('message', onPush)
  let polled = Date.now()
  const nativeTick = () => { if (Date.now() - polled >= NATIVE_POLL_MS) { polled = Date.now(); onChange() } }
  window.addEventListener('jumpstart-native-tick', nativeTick)
  return () => {
    stopped = true
    clearTimeout(retry)
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('online', refresh)
    window.removeEventListener('jumpstart-native-tick', nativeTick)
    navigator.serviceWorker?.removeEventListener('message', onPush)
    if (channel) void supabase.removeChannel(channel)
  }
}
