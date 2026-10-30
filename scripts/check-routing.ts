// Live check of the routing key and the ETA maths against OpenRouteService.
// Run: npm run check:routing   (reads ORS_API_KEY from .env.local; uses one request of the daily quota)
import { etaRange, formatEta, remainingSeconds, SCHOOL, type LngLat } from '../supabase/functions/_shared/eta.ts'
import { openRouteService } from '../supabase/functions/_shared/routing.ts'

const kothrud: LngLat = [73.8105, 18.501]
const route = await openRouteService(process.env.ORS_API_KEY ?? '').route(kothrud, SCHOOL)
console.log(`Route Kothrud → school: ${(route.distanceM / 1000).toFixed(2)} km, ${(route.durationS / 60).toFixed(1)} min, ${route.line.length} points`)
console.log(`At the start:  ${formatEta(etaRange(route.durationS))}`)

const midway = route.line[Math.floor(route.line.length / 2)]!
const { seconds, offRoute } = remainingSeconds(route, midway)
console.log(`Halfway along: ${formatEta(etaRange(seconds))}${offRoute ? ' (off route)' : ''}`)
console.log(`Near the gate: ${formatEta(etaRange(remainingSeconds(route, route.line.at(-2)!).seconds))}`)
