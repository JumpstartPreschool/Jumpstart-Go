# Current Task

**Milestone:** M0 Foundations ([implementation-plan.md](implementation-plan.md)) · **Updated:** 2026-09-24

## Done
- App scaffold: Vite, React 19, TypeScript, Tailwind 4; installable web app (manifest, service worker, iPad Home Screen tags).
- The school's logo: wordmark in light and dark versions, and app icons and favicon made from the smiling star.
- Design tokens for light and dark, contrast-checked; Button component.
- Domain rules with tests (`src/domain`): school hours, programme validation, which days a programme runs (term, 2nd and last Saturday), off-schedule and short-notice checks, freshness, running-late bands.
- Database migration `0001_foundation.sql`: people, roles, programmes, classes, children, guardians, coordinator classes, regular schedules (checked against programme windows), holidays, attendance, settings, audit log; row-level security on every table. SQL tests for every role (`npm run test:db`).
- Coordinator duty on iPad: Start duty checklist, sound unlock and sound check, screen kept awake (requested again every time the app returns to the foreground), announcement queue (priority, repeat every 2 min until acknowledged, mute 5 min), offline and screen-may-turn-off banners, end-duty confirmation.

- Design preview for owner review (`/preview`, development builds only, labelled sample data): parent Today with change time, running late and who's picking up; live trip map with the LIVE / RECENT / STALE / UNAVAILABLE states; coordinator gate queue for iPad landscape and portrait with code entry; the third person's link page, step by step.

## Next
1. **Owner reviews the design preview** and sends changes.
2. **Test on a real iPad:** Home Screen install, Start duty, the screen staying on for a full shift, and the sound check with Silent Mode on and off.
3. Create the Supabase project in Mumbai and the Cloudflare Pages project (both free), then M1: email login, role areas and admin people management.

## Waiting on the owner
- What the existing "Jumpstart app" (website FAQ) is, and whether this platform replaces it.
- A vector version of the logo (SVG, AI or PDF) if one exists. Not needed for the app; better for print later.
