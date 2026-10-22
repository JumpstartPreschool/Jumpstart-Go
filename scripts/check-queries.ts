// Checks every query the app sends against the live database, so a schema change can't break a screen unnoticed.
// Run: npm run check:queries   (reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env.local)
//
// Table reads: each `.from(t).select(...)` in src, with its filters and order, is sent signed out with limit=0. The
// database resolves tables, columns and embedded relationships before it checks permissions, so "permission denied"
// means the query itself is valid; an unknown column (42703), table (42P01/PGRST205) or relationship (PGRST200) or an
// ambiguous embed (PGRST201) fails the check. No rows are read and nothing is written.
// Database functions: each `.rpc(name, { args })` is compared with the function's latest definition in
// supabase/migrations instead of being called, because several of them write (sign-in counters, trips).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set (.env.local)')

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
// The Edge Functions too: their queries break the same way (an embed made ambiguous by a new table, 0053).
const sources = [...walk('src'), ...walk('supabase/functions')].filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('lib/demo.ts'))

/** The file's string constants with ${NAME} filled in, so `select(FIELDS)` resolves to the text the app sends. */
function constants(text: string) {
  const out = new Map<string, string>()
  for (const m of text.matchAll(/const ([A-Z_][A-Z0-9_]*) = ['`]([^'`]*)['`]/g)) out.set(m[1]!, m[2]!)
  for (let i = 0; i < 3; i++) for (const [k, v] of out) out.set(k, v.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, n: string) => out.get(n) ?? ''))
  return out
}

interface Query { where: string; table: string; params: URLSearchParams }
const queries: Query[] = []
const calls: Array<{ where: string; name: string; args: string[] | null }> = []
const unresolved: string[] = []

for (const file of sources) {
  const text = readFileSync(file, 'utf8')
  const consts = constants(text)
  const lineOf = (i: number) => `${file}:${text.slice(0, i).split('\n').length}`
  for (const m of text.matchAll(/\.from\('([a-z_]+)'\)/g)) {
    // The rest of this call chain: up to the next statement or the next query.
    const rest = text.slice(m.index! + m[0].length).split(/;|\.from\(|\n\s*\n/)[0]!
    const sel = rest.match(/^\s*\.select\((?:'([^']*)'|`([^`]*)`|([A-Z_][A-Z0-9_]*))?/)
    // ponytail: inserts, updates and deletes aren't sent (they would write); most writes go through rpc, checked below
    if (!sel) continue
    const select = sel[1] ?? sel[2] ?? (sel[3] ? consts.get(sel[3]) : '*')
    if (select === undefined || select.includes('${')) { unresolved.push(`${lineOf(m.index!)} select(${sel[3] ?? '…'})`); continue }
    const params = new URLSearchParams({ select: select.replace(/\s+/g, ''), limit: '0' })
    for (const f of rest.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|in|is|like|ilike|contains|overlaps)\('([a-z_.]+)'/g)) params.append(f[1]!, 'is.null')
    const order = rest.match(/\.order\('([a-z_]+)'/)
    if (order) params.set('order', order[1]!)
    queries.push({ where: lineOf(m.index!), table: m[1]!, params })
  }
  for (const m of text.matchAll(/\.rpc\('([a-z_]+)'(?:,\s*\{([^}]*)\})?(\s*,|\s*\))/g)) {
    const literal = m[2] !== undefined || m[3]!.trim() === ')'
    calls.push({ where: lineOf(m.index!), name: m[1]!, args: literal ? (m[2] ?? '').split(',').map((a) => a.trim().match(/^(\w+)\s*(?::|$)/)?.[1]).filter((a): a is string => !!a) : null })
  }
}

// Each function's arguments as its latest migration leaves them (a later `create or replace` or `drop` wins).
const defs = new Map<string, Array<{ name: string; optional: boolean }> | null>()
for (const f of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join('supabase/migrations', f), 'utf8')
  for (const m of sql.matchAll(/(create(?: or replace)? function|drop function(?: if exists)?) public\.([a-z_]+)\s*(\(([^)]*(?:\([^)]*\)[^)]*)*)\))?/gi)) {
    if (/^drop/i.test(m[1]!)) { defs.set(m[2]!, null); continue }
    const params = (m[4] ?? '').split(',').map((p) => p.trim()).filter(Boolean)
    defs.set(m[2]!, params.map((p) => ({ name: p.split(/\s+/)[0]!, optional: /\bdefault\b|=/i.test(p) })))
  }
}

const failures: string[] = []
const seen = new Set<string>()
for (const q of queries) {
  const path = `${q.table}?${q.params}`
  if (seen.has(path)) continue
  seen.add(path)
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key } })
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string }
  // 200: readable signed out (no rows asked for). 401/403 with 42501: valid query, signed-out reader refused.
  const ok = res.ok || ((res.status === 401 || res.status === 403) && body.code === '42501')
  if (!ok) failures.push(`${q.where}  ${q.table}: HTTP ${res.status} ${body.code ?? ''} ${body.message ?? ''}\n    ?${decodeURIComponent(q.params.toString())}`)
}

for (const c of calls) {
  const def = defs.get(c.name)
  if (def === undefined) { failures.push(`${c.where}  rpc ${c.name}: no such function in supabase/migrations`); continue }
  if (def === null) { failures.push(`${c.where}  rpc ${c.name}: dropped by a later migration`); continue }
  if (!c.args) { unresolved.push(`${c.where} rpc(${c.name}, …)`); continue }
  const unknown = c.args.filter((a) => !def.some((d) => d.name === a))
  const missing = def.filter((d) => !d.optional && !c.args!.includes(d.name)).map((d) => d.name)
  if (unknown.length || missing.length) failures.push(`${c.where}  rpc ${c.name}: ${unknown.length ? `unknown ${unknown.join(', ')} ` : ''}${missing.length ? `missing ${missing.join(', ')}` : ''}`)
}

console.log(`Checked ${seen.size} table reads against the live database and ${calls.length} function calls against the migrations.`)
if (unresolved.length) console.log(`Not checked (built at run time), check these by hand:\n  ${unresolved.join('\n  ')}`)
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('No problems found.')
