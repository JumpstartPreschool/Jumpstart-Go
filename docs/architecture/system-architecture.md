# System Architecture — Release 1

**Status:** Decided 2026-09-24 (owner asked to start implementation). Providers and their limits are in [services.md](../infrastructure/services.md). Tracking detail is in [tracking-architecture.md](tracking-architecture.md).

## 1. Shape
```
iPad / phone / laptop (installable web app, Safari or Chrome)
  │  static app shell, cached by a service worker
  ▼
Cloudflare Pages ── serves the built app (no server code)
  │
  ▼  HTTPS + WebSocket, JWT from Supabase Auth
Supabase (Mumbai, ap-south-1)
  ├─ Postgres: tables, constraints, row-level security, SQL functions for every state change
  ├─ Auth: invite-only, one-time codes by email
  ├─ Realtime: private channels (trip, gate) authorised by row-level security
  ├─ Edge Functions: anything that needs a secret (email, web push, routing, admin user management)
  └─ pg_cron: the timed rules (00:05 day creation, reminders, alerts, retention)
```

## 2. Decisions
| # | Decision | Why | Rejected |
|---|---|---|---|
| A1 | **One web app** (React + TypeScript + Vite), with role areas `/admin`, `/core`, `/coordinator`, `/parent`, and a **separate lightweight entry** for `/t/{token}` | One codebase; the third-person page ships its own small bundle (NFR-1) | Next.js: server rendering isn't needed behind a login, and it complicates free hosting on Cloudflare |
| A2 | **Coordinators use the installed web app on iPad** (Safari → Add to Home Screen). **Start duty** holds a Screen Wake Lock, re-acquires it every time the app comes back to the foreground, and unlocks sound | Owner's decision (2026-09-24). Free; no App Store | Native iPad app: only if background announcements prove necessary ($99/year, needs approval) |
| A3 | **Postgres is the source of truth and the enforcement point.** Every table has row-level security; every state change (trip steps, attendance, schedule changes) is a SQL function that checks the caller's role, validates, writes in one transaction and records an audit entry | Rules can't be bypassed by a modified client; transactions and constraints give correctness for free | Business logic only in the client or in edge functions (rules could be skipped; no transactions across calls) |
| A4 | **Domain rules are also written as pure TypeScript** (`src/domain`) for instant feedback in the screens, with unit tests. The database repeats the rules that protect data | Fast, testable UI; the server still decides | Trusting the client's checks |
| A5 | **Realtime through Supabase private channels**, authorised by row-level security | Live position under 2 s (NFR-2) without running a server | Polling; a self-hosted WebSocket server |
| A6 | **Login by email one-time code** in release 1. Phone codes are added behind the same screen once an SMS provider is approved | SMS in India costs money and needs DLT registration; email is free | Paying for SMS by default |
| A7 | **Maps: MapLibre GL + free vector tiles; routing through an interface** (OpenRouteService free plan to start) | Free, replaceable (tracking-architecture §11) | Google Maps (paid beyond free credit) |
| A8 | **Styling: Tailwind CSS v4 on design tokens (CSS variables)**, components written for this product; Radix primitives only where accessibility is hard (dialogs, sheets) | Bespoke premium design without fighting a component kit | Default component-library styling |
| A9 | **Single branch in release 1:** no branch column | YAGNI; adding branches later is a known migration | Multi-branch data model now |

## 3. Repository layout
```
src/
  domain/        pure rules shared by all screens (time, programmes, freshness, lateness, trip steps) + tests
  features/      one folder per area or capability (duty, gate, parent-today, …)
  ui/            design-system components (Button, Sheet, StatusBadge, …)
  styles/        tokens.css (light and dark), base styles
  app/           routing, providers, role areas
supabase/
  migrations/    numbered SQL files (schema, row-level security, functions)
  tests/         SQL tests run against a throwaway local Postgres
scripts/         developer scripts (db-test.sh)
docs/            source of truth
```

## 4. Environments
- **Local:** `npm run dev` for the app; `npm test` for domain tests; `npm run test:db` spins up a throwaway Postgres 18, applies the migrations with a small stand-in for Supabase's `auth` schema, and runs the SQL tests.
- **Staging and production:** two Supabase projects (the free plan allows two) and two Cloudflare Pages projects. Details in `docs/infrastructure/environments.md` when they are created.
