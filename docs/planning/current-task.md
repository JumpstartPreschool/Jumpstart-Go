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

## Next
1. **Owner reviews the design preview and the demo**, and sends changes.
1. **Bring the data up to the owner's latest decisions** (the app now looks like the Screen Book but still runs on the older data): the 15-minute windows and must-be-in hours (D24; `0003` still has 30-minute windows), no class groups (D18, D28: the picker's third step and the Classes tab go), "Programme" instead of "plan", the PRO team role (D25) and family who can collect (D26). Each needs a migration and a small UI change.
2. **Real email codes:** in Supabase, add `{{ .Token }}` to the Magic Link email, turn off public sign-ups, and connect a free SMTP sender (Brevo). The built-in sender only mails the Supabase team.
3. **Test on a real iPad:** Home Screen install, Start duty, the screen staying on for a full shift, and the sound check with Silent Mode on and off.
4. **Publishing:** give the Cloudflare token Workers Scripts: Edit, then `npm run deploy:design`.

## Waiting on the owner
- What the existing "Jumpstart app" (website FAQ) is, and whether this platform replaces it.
- A vector version of the logo (SVG, AI or PDF) if one exists. Not needed for the app; better for print later.
