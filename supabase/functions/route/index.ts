// Route and ETA from a position to the school (tracking-architecture §8).
// POST { from: [lng, lat] } with the user's session → { line, distanceM, durationS, eta }.
// The routing key stays here as a function secret (ORS_API_KEY); it never reaches a browser.
// Deploy: npx supabase functions deploy route --no-verify-jwt  (the function checks the session itself)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { distanceM, etaRange, SCHOOL } from '../_shared/eta.ts'
import { isLngLat, openRouteService, RoutingError } from '../_shared/routing.ts'

// The key's quota is for Jumpstart trips, not a public routing service: routes only to the school, from the Pune area.
const MAX_START_FROM_SCHOOL_M = 50_000

const routing = openRouteService(Deno.env.get('ORS_API_KEY') ?? '')
const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const { data, error } = token ? await auth.auth.getUser(token) : { data: { user: null }, error: true }
  if (error || !data.user) return json(401, { error: 'sign_in_required' })

  const body = await req.json().catch(() => null)
  const from = body?.from
  if (!isLngLat(from)) return json(400, { error: 'from_must_be_lng_lat' })
  if (distanceM(from, SCHOOL) > MAX_START_FROM_SCHOOL_M) return json(422, { error: 'too_far_from_school' })

  try {
    const route = await routing.route(from, SCHOOL)
    return json(200, { ...route, eta: etaRange(route.durationS) })
  } catch (e) {
    if (!(e instanceof RoutingError)) throw e
    const status = e.reason === 'rate_limited' ? 429 : e.reason === 'no_route' ? 422 : 503
    // Callers show "ETA unavailable"; tracking, freshness and the handover carry on without it.
    return json(status, { error: e.reason })
  }
})
