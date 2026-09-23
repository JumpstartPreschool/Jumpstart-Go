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
- App: 6-digit email-code login, consent notice for parents, a home area per role with an area switcher, admin People (children, parents, staff, classes, access on/off), the three-step programme picker (level → plan → class, suggesting the level from the age), and read-only Today pages for parents and the core team.
- Routing and ETA server function with the OpenRouteService key (`supabase/functions/route`, not yet deployed).
- Rainbow-glass design system and iPad layouts; the owner's logo; the design preview.
- Owner-facing explainer: https://claude.ai/artifact/AmiKrGQCV21UHzgL8jGcbu

## Next
1. **Owner reviews the design preview** and sends changes.
2. **Test on a real iPad:** Home Screen install, Start duty, the screen staying on for a full shift, and the sound check with Silent Mode on and off.
3. Create the Supabase project in Mumbai and the Cloudflare Pages project (both free), then M1: email login, role areas and admin people management.

## Waiting on the owner
- What the existing "Jumpstart app" (website FAQ) is, and whether this platform replaces it.
- A vector version of the logo (SVG, AI or PDF) if one exists. Not needed for the app; better for print later.
