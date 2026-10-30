# Implementation Plan — Release 1

Each milestone ends with its tests passing and the affected docs updated. Current work is in [current-task.md](current-task.md).

| # | Milestone | Delivers | Done when |
|---|---|---|---|
| M0 | **Foundations** | App scaffold (Vite, React, TypeScript, Tailwind, installable web app); design tokens (light/dark); domain rules for school hours, programmes, windows, freshness and lateness with tests; database schema for people, roles, programmes, classes, children, schedules, holidays, attendance, audit log, with row-level security and SQL tests; **coordinator Start duty** (screen kept awake, sound unlocked, speaker test, announcement queue) | `npm test`, `npm run test:db` and `npm run build` pass; Start duty works on a real iPad from the Home Screen |
| M1 | Login and people | Phone number and WhatsApp one-time-code login (invite-only, signed in until sign-out), consent, role areas and area switcher; admin: people, CSV roster, roles, coordinator classes, deactivation | Security tests for every role; unregistered number refused |
| M2 | Programmes and schedules | Core team: programme timings, children's regular times, holidays, today board, attendance; 00:05 day creation | Karve Road programmes (PRD §5) entered and confirmed by the core team |
| M3 | The gate | Trips and trip steps in SQL; coordinator queue on iPad (landscape/portrait), realtime, announcements routed by class with escalation, Ready / Confirm guardian / Handed over / Check in, Log for parent | End-to-end handover on two iPads |
| M4 | Parent app | Today card, change time with slot load, Running late, who's going, WhatsApp links, notifications | A parent changes a time and the iPad announces it in under 3 s |
| M5 | Third person and tracking | `/t/{token}` page, device lock, location pipeline and checks, live map with freshness, ETA range, arrival detection, timeline and replay | Real trip tracked on Android and iPhone; STALE and UNAVAILABLE behave as specified |
| M6 | Timed rules and messaging | pg_cron rules (get ready, late, stale, not closed…), web push, messages, announcements with read receipts | Every rule in tracking-architecture §10 has a test |
| M7 | Admin and operations | Dashboard, reports, CSV export, audit log search, retention jobs, backups and a restore rehearsal | Restore rehearsed; retention jobs verified |
| M8 | Hardening and launch | Accessibility (WCAG 2.2 AA), performance budgets, real-device testing, security review, pilot with staff | Release 1 success criteria tracked (PRD §1) |
