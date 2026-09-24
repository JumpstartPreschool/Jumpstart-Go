# Current Task

**Milestone:** M1 Login and people, mostly done ([implementation-plan.md](implementation-plan.md)) · **Updated:** 2026-09-24

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

## Remaining work (in order)
1. **Apply 0007 and 0008 to the live Supabase project** (owner's go-ahead first), then check a real sign-in still works.
2. **Location front end on 0008.** `src/features/trips/tracking.ts` already has the calls (`shareLocation`, `inviteCollector`, `collectorCode`, `handoverWithCode`), `useSendLocation` (watchPosition, batching, wake lock, offline queue), `useTripPosition` (latest point, LIVE/RECENT/STALE/UNAVAILABLE, distance) and permission help. Still to build:
   - Parent trip card: "Share my location" switch with a short explainer before the browser asks, and help when denied (`locationPermission`, `locationHelp`).
   - "Someone else is collecting" sheet on the child card (name, mobile with country code, relation, minutes) → `inviteCollector` → show the code, Send on WhatsApp (`wa.me` with `whatsappText`), Copy link, Resend; the trip card shows the collector's freshness and distance.
   - Public link page `/t/:token` (no sign-in): `link_open` → Confirm (device key in localStorage) → code tiles → Start trip with location → poll `link_status` every 10 s → "I'm home" after handover (`link_home`).
   - Gate: third-person pickups show "Code needed" and a 4-digit keypad (`handoverWithCode`, tries left, locked message); show freshness and distance on rows.
   - Demo backend: add `trip_points` and the 0008 RPCs (`share_location`, `stop_sharing`, `invite_collector`, `collector_code`, `link_*`, `gate_handover_code`), allowing the link calls without sign-in; a clearly labelled SIMULATED traveller button for testing on a laptop.
   - Optional map: lazy-load `ui/TripMap.tsx` (MapLibre is heavy) for the parent's view of a collector; make it follow the light theme.
3. **Remaining owner decisions in the data:** no class groups (D18, D28: drop the picker's third step and the Classes tab; coordinators follow levels), PRO team role and front desk area (D25), family who can collect with the relation pop-up and parents abroad (D26), Admin only Ankit Singh and Aditya Tapadia (D27; Aditya's email needed).
4. **Rest of the Screen Book:** core team Today board and Schedules (edit programme hours, children's regular times, change today's time), messages and announcements, absence, admin child page, settings and audit log.
5. **Notifications:** web push for locked iPads and parents (needs a VAPID key pair and a send function; free).
6. **Real email codes, real iPad test, publishing** (below).
7. Re-run the QA scripts after each step, with `npm run dev` on port 5178: `node scripts/qa/qa.cjs <shotsDir> light` (every page and sheet at 23 sizes), `node scripts/qa/flows.cjs` (36 admin/coordinator/parent checks) and `node scripts/qa/trip.cjs` (parent to gate). They load playwright-core from the local Playwright CLI install; change the require path if needed.

## Next
1. **Owner reviews the design preview and the demo**, and sends changes.
2. **Real email codes:** in Supabase, add `{{ .Token }}` to the Magic Link email, turn off public sign-ups, and connect a free SMTP sender (Brevo). The built-in sender only mails the Supabase team.
3. **Test on a real iPad:** Home Screen install, Start duty, the screen staying on for a full shift, and the sound check with Silent Mode on and off.
4. **Publishing:** give the Cloudflare token Workers Scripts: Edit, then `npm run deploy:design`.

## Waiting on the owner
- What the existing "Jumpstart app" (website FAQ) is, and whether this platform replaces it.
- A vector version of the logo (SVG, AI or PDF) if one exists. Not needed for the app; better for print later.
