import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { onTableChange } from '../../lib/live'
import { DEFAULT_GATE, gateSettings, type GateSettings } from '../../../supabase/functions/_shared/gateAnnounce.ts'

/**
 * The admin's gate announcement settings (0042), kept current on every gate iPad: read on duty, again the moment the
 * admin saves (realtime), and every minute in case that message is missed. A failed read keeps what the iPad had (the
 * defaults at first), and a broken value falls back to its default (gateSettings), so the gate always speaks.
 */
export function useGateSettings(): GateSettings {
  const [settings, setSettings] = useState<GateSettings>(DEFAULT_GATE)
  useEffect(() => {
    let alive = true
    const load = () => {
      void supabase.from('gate_announcement_settings').select('*').maybeSingle().then(({ data, error }) => {
        if (!alive || error) return
        const next = gateSettings(data)
        // The same settings keep the same object, so the gate doesn't redo its work on every poll.
        setSettings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      })
    }
    load()
    const stop = onTableChange('gate_announcement_settings', load)
    const poll = setInterval(load, 60_000)
    return () => { alive = false; stop(); clearInterval(poll) }
  }, [])
  return settings
}
