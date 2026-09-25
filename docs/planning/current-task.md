# Current Task

**Milestone:** M1 Login and people, mostly done ([implementation-plan.md](implementation-plan.md)) · **Updated:** 2026-09-25

## Done
- App scaffold: Vite, React 19, TypeScript, Tailwind 4; installable web app (manifest, service worker, iPad Home Screen tags).
- The school's logo: wordmark in light and dark versions, and app icons and favicon made from the smiling star.
- Design tokens for light and dark, contrast-checked; Button component.
- Domain rules with tests (`src/domain`): school hours, programme validation, which days a programme runs (term, 2nd and last Saturday), off-schedule and short-notice checks, freshness, running-late bands.
- Database migration `0001_foundation.sql`: people, roles, programmes, classes, children, guardians, coordinator classes, regular schedules (checked against programme windows), holidays, attendance, settings, audit log; row-level security on every table. SQL tests for every role (`npm run test:db`).
- Coordinator duty on iPad: Start duty checklist, sound unlock and sound check, screen kept awake (requested again every time the app returns to the foreground), announcement queue (priority, repeat every 2 min until acknowledged, mute 5 min), offline and screen-may-turn-off banners, end-duty confirmation.

- Design preview for owner review (`/preview`, development builds only, labelled sample data): parent Today with change time, running late and who's picking up; live trip map with the LIVE / RECENT / STALE / UNAVAILABLE states; coordinator gate queue for iPad landscape and portrait with code entry; the third person's link page, step by step.

## Done in M1
- Invite-only login enforced by the database (`0002`): profiles exist before sign-in; the first email code links the account; anyone else is refused, verified against the live Supabase project. Deactivation ends access and saved sessions.
- Karve Road programmes loaded (`0003`, 17 programmes from PRD §5).
- Admin functions that save a person with roles, or a child with guardians, all-or-nothing (`0004`).
- The core team chooses the coordinators (`0005`, D23): Core team → Coordinators and Admin → Coordinators show each class's coverage, add a coordinator with their classes, edit classes, or remove the role. The database lets the core team give only the Coordinator role. Applied to the live project.
- App: 6-digit email-code login, consent notice for parents, a home area per role with an area switcher, admin People (children, parents, staff, classes, access on/off), the three-step programme picker (level → plan → class, suggesting the level from the age), and read-only Today pages for parents and the core team.
- Routing and ETA server function with the OpenRouteService key (`supabase/functions/route`, not yet deployed).
- ~~Rainbow-glass design system~~ replaced (2026-09-24) by the Screen Book v3 design system across the whole app ([design-system.md](../design/design-system.md)): semantic light and dark tokens, Plus Jakarta Sans type scale, solid buttons with a lip, icons for roles and levels, shared components (tabs, fields, choices, pills, sheets with a pinned action, toasts, empty, loading and error states), an offline notice, a skip link, and safe app updates that wait for the person to tap Update. Each staff area now loads on first use. Checked on every page and sheet at 23 screen sizes in light and dark, plus the main admin, coordinator, duty and parent flows in demo mode.
- Owner-facing explainer: https://claude.ai/artifact/AmiKrGQCV21UHzgL8jGcbu
- Demo mode (development and design builds only, left out of production): "Try the demo" on the login screen opens Admin, Core team, Coordinator or Parent with a dummy code (246810) that fills itself in, backed by sample data in the browser tab. It never calls the real database, and a "Demo · sample data" pill stays on screen until Exit demo.
- The owner's account (ai@jumpstartpreschool.in) is invited in the live database with Admin, Core team and Coordinator. The Parent area appears once a real child is linked.

## Done on 2026-09-25 (branch `claude/jumpstart-app-html-updates-64d27a`, not yet pushed after `cfd1569`)
- **App is light only for now** (owner). The dark palette waits in `src/styles/tokens.css` under `:root[data-theme='dark']`.
- **Sign-in like the Screen Book:** demo account chips (Parent, Coordinator, Core team, Admin) in dev/design builds; the demo code fills itself in and the person taps Sign in; "Where would you like to start?" lists each area with what it gives access to (`AreaRoute.tsx`, `session.tsx` `chooseArea`). Real codes are never shown; phones fill them from the email.
- **Announcement voice:** woman's voice by default, human-sounding voices ranked first, robotic ones hidden, a voice picker with samples in Start duty, the check screen and On duty (`sound.ts`, `VoicePicker.tsx`). Sound goes to whatever the iPad is connected to (its speaker or a Bluetooth speaker); web apps can't choose the output.
- **Trips end to end (on 0006, already live):** parent Today with "I'm on my way", window check and reason, Running late, Change time, Cancel, and live steps (`family/ParentToday.tsx`, `trips/TripSheets.tsx`); coordinator live gate queue with announcements, Acknowledge, Ready, Hand over to a registered guardian, Check in (`duty/GateQueue.tsx`). The demo backend (`demo/demo.ts`) follows the same rules, so it all works on localhost.
- **Migration 0007** (the owner's 15-minute rule, D24: new windows for all 17 programmes, gate day 08:45–19:15) and **0008** (location points, one-trip links for someone else with a device-bound token and a 4-digit code, handover by code with 3 tries, staff see location only until handover, 30-day purge). Both pass `LC_ALL=C TMPDIR=/tmp npm run test:db` (the long session temp path breaks the Postgres socket otherwise). **Neither is applied to the live database yet.**

## Done on 2026-09-25, later (same branch, commits after `c13aa5b`)
- **Someone else collects, end to end:** parent's sheet (saved people, WhatsApp, copy, resend), the collector's link page `/t/:token` (confirm on one phone, location, code, running late, at the gate, reached home), the gate's code keypad (3 tries, then locked), live position with LIVE/RECENT/STALE/UNAVAILABLE and distance for parents and the gate (`0009`: `link_late`, `latest_points`).
- **Natural announcement voice** (D32): Kokoro on the iPad in a worker, WebGPU when present; device voice as fallback; Mute stops at once and replays after.
- **Owner decisions in the data** (`0010`, `0011`): classes are the levels; PRO/front desk role; family and parents abroad; Admin locked to the two owners; Log a call.
- **Admin rebuilt child-first** (`0012`, D29): child page, add a child with family in one step, relation pop-up, app access switch, staff with the admin lock, Settings, audit log in sentences.
- **The school's day** (`0013`, `0014`): core team Today board (attendance, today's time with busy slots), Schedules (hours set the windows; regular times), Messages, Announce; front desk; parent Updates, Messages, Account (saved people, notifications, absences), Change time.
- **Gate** (`0015`, D30): Coming up, Not in today, whole-school view, walk-in check-in and handover, Log a call.
- **Web push** (`0016`, D33, [notification-architecture.md](../architecture/notification-architecture.md)): outbox and triggers, `push-send`, service worker handler (tested by delivering a push to the built app), switches for parents and staff.
- **Checks:** `LC_ALL=C TMPDIR=/tmp npm run test:db` (every role, 0007–0018), `npm test` (75), and the browser suites in `scripts/qa/` against `npm run dev` on port 5178: `flows.cjs` (44), `office.cjs` (16), `parent.cjs` (14), `collector.cjs` (18), `trip.cjs` (11), and `qa.cjs <dir> light` (every page and sheet at 23 sizes; 0 issues).

## Remaining work (in order)
1. **Push 0007–0018 to the live database** (owner approved 2026-09-25): run `bash ~/.claude/tmp/handoff-9a5915b6-abee-4e23-9703-4cfdc22c99a4.sh` (dry run, then apply). Then check a real sign-in, Admin → People and the core team's Today. Coordinator assignments to old class groups are removed by 0011; the core team re-assigns levels.
2. **Aditya Tapadia's email** (D27): invite him as the second admin in the database (the app refuses Admin by design).
3. **Push notifications on:** follow "Turning on push notifications" in [environments.md](../infrastructure/environments.md) (VAPID keys, secrets, deploy `push-send`, `app.push_config`, pg_net and pg_cron). `push-send` hasn't been type-checked with Deno here (not installed); the CLI checks it on deploy.
4. **Real email codes, a real iPad test (including the natural voice's download and memory, Home Screen notifications), and publishing** (below).
5. **Security review done (2026-09-25):** no critical or high findings; the medium and low ones are fixed in `0017` (a collector confirms with the last 4 digits of their mobile; one phone per link even under a race; staff location cut-off by the server clock; admin lock on updates; push devices and hosts; past absences).  Rate limits on trips and time changes, logged calls and link location batches are in `0018`. Codex isn't available on this account, so there was no cross-model review.
6. Push the branch and merge to `main`.

## Next
1. **Owner reviews the design preview and the demo**, and sends changes.
2. **Real email codes:** in Supabase, add `{{ .Token }}` to the Magic Link email, turn off public sign-ups, and connect a free SMTP sender (Brevo). The built-in sender only mails the Supabase team.
3. **Test on a real iPad:** Home Screen install, Start duty, the screen staying on for a full shift, and the sound check with Silent Mode on and off.
4. **Publishing:** give the Cloudflare token Workers Scripts: Edit, then `npm run deploy:design`.

## Waiting on the owner
- What the existing "Jumpstart app" (website FAQ) is, and whether this platform replaces it.
- A vector version of the logo (SVG, AI or PDF) if one exists. Not needed for the app; better for print later.
