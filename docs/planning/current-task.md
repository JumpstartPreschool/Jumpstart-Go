# Current Task

**Milestone:** M1 Login and people, mostly done ([implementation-plan.md](implementation-plan.md)) · **Updated:** 2026-10-04

## Done
- App scaffold: Vite, React 19, TypeScript, Tailwind 4; installable web app (manifest, service worker, iPad Home Screen tags).
- The school's logo: wordmark in light and dark versions, and app icons and favicon made from the smiling star.
- Design tokens for light and dark, contrast-checked; Button component.
- Domain rules with tests (`src/domain`): school hours, programme validation, which days a programme runs (term, 2nd and last Saturday), off-schedule and short-notice checks, freshness, running-late bands.
- Database migration `0001_foundation.sql`: people, roles, programmes, classes, children, guardians, coordinator classes, regular schedules (checked against programme windows), holidays, attendance, settings, audit log; row-level security on every table. SQL tests for every role (`npm run test:db`).
- Coordinator duty on iPad: Start duty checklist, sound unlock and sound check, screen kept awake (requested again every time the app returns to the foreground), announcement queue (priority, repeat every 2 min until acknowledged, mute 5 min), offline and screen-may-turn-off banners, end-duty confirmation.


## Done in M1
- Invite-only login enforced by the database (`0002`): profiles exist before sign-in; the first code links the account; anyone else is refused, verified against the live Supabase project. Deactivation ends access and saved sessions.
- Karve Road programmes loaded (`0003`, 17 programmes from PRD §5).
- Admin functions that save a person with roles, or a child with guardians, all-or-nothing (`0004`).
- The core team chooses the coordinators (`0005`, D23): Core team → Coordinators and Admin → Coordinators show each class's coverage, add a coordinator with their classes, edit classes, or remove the role. The database lets the core team give only the Coordinator role. Applied to the live project.
- App: 6-digit code login, consent notice for parents, a home area per role with an area switcher, admin People (children, parents, staff, classes, access on/off), the three-step programme picker (level → plan → class, suggesting the level from the age), and read-only Today pages for parents and the core team.
- Routing and ETA server function with the OpenRouteService key (`supabase/functions/route`, not yet deployed).
- ~~Rainbow-glass design system~~ replaced (2026-09-24) by the Screen Book v3 design system across the whole app ([design-system.md](../design/design-system.md)): semantic light and dark tokens, Plus Jakarta Sans type scale, solid buttons with a lip, icons for roles and levels, shared components (tabs, fields, choices, pills, sheets with a pinned action, toasts, empty, loading and error states), an offline notice, a skip link, and safe app updates that wait for the person to tap Update. Each staff area now loads on first use. Checked on every page and sheet at 23 screen sizes in light and dark, plus the main admin, coordinator, duty and parent flows in demo mode.
- Owner-facing explainer: https://claude.ai/artifact/AmiKrGQCV21UHzgL8jGcbu
- The owner's account (ai@jumpstartpreschool.in) is invited in the live database with Admin, Core team and Coordinator. The Parent area appears once a real child is linked.

## Done on 2026-09-25 (branch `claude/jumpstart-app-html-updates-64d27a`, not yet pushed after `cfd1569`)
- **App is light only for now** (owner). The dark palette waits in `src/styles/tokens.css` under `:root[data-theme='dark']`.
- **Sign-in:** invite only; a mobile number and a 6-digit code on WhatsApp, signed in until Sign out (D51, `0039`); the number filled in from an invitation link; every account confirms which area it signs in as.
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

## Done on 2026-09-25, evening (branch `claude/server-data-extraction-review-dd5a64`)
- **Classes and timings for the admin** (`0019`, D35): Admin → People → Classes adds a class, opens it to list its programmes, adds programmes (name, days, hours) and edits each one's drop-off and pickup by hand. The shared timing editor (`school/ProgrammeSheet.tsx`) starts from the 15-minute rule and offers it back; the core team uses it in Schedules for timings only. Classes the admin adds appear in the programme picker with a plain icon.
- **Layout fixes found by the sweep:** tab counts spilling out of their tab on phones, button icons pushed out of narrow buttons (parent trip card at every iPad size, pickup-link sheet, programme picker), side-by-side fields sliding out of line next to a hint or error, and time pickers cut off on the smallest phones. `scripts/qa/qa.cjs` now checks for all four: spill, off-centre icons, misaligned fields and cut-off dropdowns.
- **Checks:** `npm test` (79), `npm run test:db` (with `zz_timings.test.sql`), `scripts/qa/classes.cjs` (18), the other browser suites (103) and `qa.cjs` (0 issues at 23 sizes).

- **Invitations** (`0020`, D36): Invite on every person who hasn't signed in (People and the child page). The invitation goes on WhatsApp through WATI (`whatsapp-invite`), with a text message from the admin's own phone as the fallback (D51). The app's web address is a setting. Pickup links now go by WhatsApp or SMS too. Found and fixed on the way: Settings could lose what the admin was typing when a late load arrived, and a web address without https was blocked by the browser without a message. `scripts/qa/invite.cjs` (10), `supabase/tests/zz_zz_invites.test.sql`.

- **Production audit** (four parallel reviews: security, location, invitations, UI): `0021` removes the core team's direct writes to programmes, attendance, regular times and holidays (they skipped the function checks), makes the collector-link rate limit actually fire, limits sign-in codes to 5 an hour per email, and adds the daily clean-up promised in the consent notice (trips 30 days, attendance this and last academic year, audit log 1 year). The map shows a clear message when it can't load; sharing stops and says so when a trip ends; a crash shows a Reload screen; faint instructional text is darker; the app is kept out of search (`robots.txt`, `X-Robots-Tag`) except the new Privacy Policy and Terms (`/privacy`, `/terms`); the security policy now lets the natural voice download (it was blocked in production); `invite-send` no longer logs Brevo's error text.
- **Coordinator start screen** redesigned to fill iPads in both orientations, with today's numbers at the gate. **Announcements** start "New announcement." and repeats "Reminder."; an Indian English woman's voice on the iPad is preferred (names said properly), with how to download Isha when there isn't one.
- **Bulk upload** (`0022`, D37): Admin → People and Core team → Schedules; CSV or Excel (.xlsx read without a library); `scripts/qa/bulk.cjs` (12).

- **Location only for a one-off collector** (`0024`, D38): parents and family no longer share location; the gate shows none; only the parent who sent the link sees the collector, on a new tracker (live map, distance, freshness, Call). Consent notice version raised, so parents agree again. Sign-in: a quick second request goes straight to the code (Supabase allows one a minute), codes 10 an hour per email (`0023`); the sign-in page has a welcome panel on tablets; privacy and terms updated.

- **Icons and people** (D39, `0025`): `src/ui/icons.tsx` (76 Fluent Color SVG files in `public/iconsc`), `Avatar` with initials on each person's colour, Boy or girl on children (forms, bulk upload).

## Done on 2026-09-29: Azure gate voice and "I've arrived" (D50, [voice-architecture.md](../architecture/voice-architecture.md))
- Templates in one place (`_shared/announce.ts`); every child's announcements made ahead by `pronounce` (Azure, behind `TTSProvider`) into `voice-audio`; iPads copy them on duty.
- `0035`: monthly cap (`voice_count`, 450,000), `voice_version()`, `trips.arrived_at` + `arrive_trip` + gate notification; school-computer registration removed.
- Parent: "I've arrived". Gate: announces on the way, about ten, about five, arrived; "At the gate" pill; Speaker button (Bluetooth or iPad).
- Removed `tts-service/` and its deploy script. Privacy text and consent version updated.
- Checks: `npm test`, `npm run test:db`, `npm run build`, `deno check`. **Not done:** Azure account (owner), choosing the voice by ear, real-iPad timings.

## Done on 2026-10-02: phone and WhatsApp sign-in (D51)
- Sign-in is a mobile number and a 6-digit code on WhatsApp, with no email and no password anywhere. Supabase Auth makes and checks the code; its Send SMS hook (`send-sms`) delivers it through WATI. People stay signed in until they tap Sign out.
- Database `0039`: `phone_login_allowed`, phone-keyed invite-only guard, app access needs a mobile, `otp_recipient`, `app.whatsapp_log` (never a code, purged after 90 days) and `whatsapp_recent`.
- Edge functions: `send-sms`, shared `wati.ts`. `whatsapp-invite` and `wati-webhook` are described in the plan but not built yet.
- Plan and the owner's steps: [wati-phone-login-plan.md](wati-phone-login-plan.md). Setup: [environments.md](../infrastructure/environments.md).

## Done on 2026-10-03: email and password from the admin's pattern (D52)
- WhatsApp code stays the main sign-in; anyone with an email can also sign in with it and a password. Admin → Settings → Email sign-in sets the pattern (`_shared/passwordPattern.ts`, shared with the preview); saving it sets every email account's password at once through the `password-pattern` function. A starting password is swapped for the person's own right after signing in. Admin → a person → the key button resets one person to the pattern.
- Database `0041`: `password_pattern` (admin-only), `profiles.email_sign_in` (none, pattern, own) kept by a trigger on `auth.users`, email accounts made only by the school, a new email removes an old pattern password. Also drops the on-screen code from `0040`, which let anyone sign in as anyone with a shared password.
- Invitations go from the admin's own phone (WhatsApp or SMS). Brevo is gone: `invite-send`, `_shared/emailLayout.ts`, `supabase/templates`, `scripts/email-templates.ts` and the Privacy line.
- Checks: `npm test`, `npm run build`, the new database test (`DB_TESTS=supabase/tests/zz_zz_zz_zz_zz_zz_zz_zz_zz_zz_email_password.test.sql npm run test:db`). The rest of `test:db` has failed since `0039` (its fixtures still sign in by email); not fixed here.

## Done on 2026-10-03: the ETA in every announcement, and gate announcements in Settings (D53)
- Why the ETA was missing: a trip more than 12 minutes away was "on the way" with no time; reminders replayed the first words; an acknowledged trip never announced "has arrived".
- `_shared/gateAnnounce.ts`: defaults, whitelist templates, validation, `etaOf` (one rounding rule), `childMessages` from the settings. `gate.ts`: stages from the admin's timings, fixed priority, `syncGate`. `announcer.ts`: words made when spoken, admin openings and interval, reminders after new announcements. `pronounce` records ahead from the same settings.
- `0042`: `gate_announcement_settings` (staff read, admin saves through `admin_save_gate_announcements`, audited, realtime, requeues voices on new wording). Admin → Settings → Gate announcements with preview and Play preview through the gate's own voice.
- Checks: `npm test` (gate flow tests drive the real announcer through a trip's life), the 0042 database test, `npm run build`. **Not done:** a real iPad and Bluetooth speaker test, and Azure (the demo has no voice service).

## Done on 2026-10-03: Running late (D54)
- `0043`: `trips.late_at/late_by/late_from/late_note`, `running_late` (own child only, before arriving, +5/+10/+15 or a later time today, note up to 120, 6 in 10 minutes), `clear_late` (another new time ends it), push "Aarav pickup delayed" to the gate team and "time changed" to other family who chose it.
- Gate: a "Running late · 1:20 PM" pill and the note; the admin's Running late wording said once, then reminders with the new time; priority below urgent, above outside the usual time. Parent: the new sheet (+5/+10/+15, Custom time, note) and a Running late pill.
- Checks: `npm test` (LateSheet, gate flow), `running_late.test.sql`, build, and a browser run on the demo. **Not done:** a real iPhone/iPad; the collector's own Running late link (`link_late`) still uses +10/20/30 and doesn't set the late fields.

## Done on 2026-10-04: temporary passwords from the admin's pattern builder (D55, [plan](temporary-password-plan.md))
- `0048`: rules (`password_policy`) and patterns (`password_patterns`, default plus per role and family) checked in SQL as in `_shared/passwordPattern.ts`; one temporary password at a time (`admin_begin_temp_password` → `password-pattern` function → `finish_temp_password`), shown once, 48 h; `password-change` for the person's own (rules, last 5, other devices signed out); lock after 5 wrong tries for 15 min, email sign-in only; Custom Access Token hook enforces lock, expiry and off, and refuses recovery and magic links; password state and `user_id` can't be written directly. The 0041 pattern and its passwords are gone.
- App: Settings → Authentication (Password rules; Temporary passwords builder with move controls, live preview and strength meter); the key button on a person issues, regenerates or turns off email sign-in; Add and Edit staff and Edit family have an optional email; choose-your-own screen shows the rules; demo follows the same rules.
- Security review: two High and two Medium findings fixed in `0048` (see the plan's "As built"); one open decision above.
- Checks: `npm test` 38 files, 351 tests; `npm run test:db` passed (30 files); `npm run build` passed; demo in the browser: first sign-in and forced change, reuse refused, weak pattern refused, strong pattern saved, issue shown once, lock after 5 with a neutral message, WhatsApp code still works when locked, no console errors, no sideways scroll at 390 px. **Not done:** `deno check` (Deno isn't installed), anything against the live project.

## Done on 2026-10-04: gate voice audible and always a woman's; WATI sign-in checked
- Cause of silent announcements: when the school's clip wasn't ready, the device fallback allowed only Indian women's voices, which most devices don't have (this Mac's Chrome: only Rishi, a man), so nothing was said and the queue retried silently. Now an Indian woman's voice, else another English woman's voice, never a man's; logged when unavailable. The unlock word at Start duty (audible on iOS, which ignores its volume) was in the default voice, Rishi on Indian iPads: it now uses the same woman's voice, or isn't said. The sound check waited for no voice version and had its clip made live every time; it now waits. A re-announced trip no longer cuts the sentence being said. `[voice]` logs in every build.
- WATI: a timeout was logged as "unavailable" (the abort won the race); fixed. Tests added for a WATI that never answers. Test numbers documented as the safe way to sign in while WATI is inactive.
- Checks: `npm test` 38 files, 355 tests; `npm run test:db` passed; build passed; Chrome on the lag page: clips arriving play in full (8.19 s clip, 8.2 s played), a clip that never arrives is now said in full by a woman's voice (Karen) instead of nothing. **Not done:** real iPad, iPhone and Android checks, and hearing the live Azure voice (no staff sign-in available here).

## Done on 2026-10-06: one mobile for several roles, numbers reused, demo sign-ins
- **One person, several roles:** a mobile is one sign-in, so typing a number someone already has links that person instead of refusing it. Add a child or a parent: a staff member's number links them as the parent (they keep their roles and get the Parent area too); Link someone already here now lists staff. Add staff: a parent's number gives that parent the roles (and app access if they had none).
- **Numbers reused after removal** (`0049`): adding or editing a person with the number of someone turned off moves it to them (the old record keeps its history, not the number). A parent re-added by mobile after their child left is linked again with app access back on. Inactive people may have no contact left.
- **Demo sign-ins (temporary):** ten demo parents on +91 90000 00001 to 00010, each with one "… Demo" child (`scripts/demo/add-demo-logins.sql`). Those numbers sign in with Supabase test codes and the sign-in screen fills the code in (`src/features/auth/demoLogins.ts`); every other number keeps WhatsApp. Remove for good with `scripts/demo/remove-demo-logins.sql`, then delete the test numbers in Supabase and `demoLogins.ts`.
- Checks: `npm test` 38 files, 358 tests; `npm run build`; `npm run test:db` passed for every file but `zz_..._gate_roles.test.sql`, which fails at 15:39 IST with and without these changes (an attendance time check); the new `..._reuse_numbers.test.sql` covers reuse, both roles, re-linking, and adding then removing the demo data. Browser (demo mode): demo number fills the code, other numbers don't; Add staff with a parent's number shows the notice. **Not done:** a real iPhone.

## Done on 2026-10-06, later: demo codes on screen, country picker, any number of trips a day
- **Demo sign-in fixed:** the demo numbers were sent to WATI (no test numbers set in Supabase), which refused them. Now the Send SMS hook keeps a demo number's code (`demo_code_keep`, `0050`) and the sign-in screen reads it back (`demo_code`), so no dashboard step is needed. Only "… Demo" parents on +91 90000 00001 to 00010, never staff; codes last 10 minutes.
- **Sign-in number:** +91 fixed in front, a picker of every country (search by name or code), only the digits typed; the label is centred (`auth/PhoneField.tsx`, `domain/countries.ts`).
- **Any number of drop-offs and pickups a day** (owner, for every child): `0050` replaces "once a day" with "not twice in a row" (`app.last_handover`) in booking, the gate walk-in and today's time; a check-in after a pickup clears the attendance check-out. Parent card: after a pickup, "Bringing … back today"; the Today board follows the latest handover.
- Gate voice on iPhone: the fallback voice skips Apple's robotic Kathy and can use Martha.
- Checks: `npm test` 39 files, 363 tests; build; `npm run test:db` passes for all files but the time-dependent `gate_roles` one (fails after 12:10 IST with or without these changes); new `..._trips_again.test.sql`. Browser: sign-in box and picker at 390 px. **Not done:** a real iPhone.

## Done on 2026-10-07: bulk upload with four columns
- The sheet needs only Child full name, Date of birth, Parent name and Contact number, all required (owner). Common column names work too ("Student name", "DOB", "Mother name", "Mobile"); older sheets with more columns still work and their extra details are used.
- The programme is chosen in the app before adding: per child, or one programme for every child still without one. Relation, other family and the rest are edited on the child's page; the parent is added as "Parent".
- The demo backend (`npm run dev:demo`) now accepts a bulk upload, so it can be tried on localhost.
- Checks: `npm test` 39 files, 363 tests; build; a browser run of a 4-column CSV (3 added, the row without a date of birth held back with its reason).

## Remaining work (in order)
0. **Apply `0023`, `0024` and `0025` to the live database** (dry run first; up to `0022` is live), and publish the app so `_headers`, `robots.txt` and the new screens take effect. When `pg_cron` is on, re-run the schedule block in `0021`.
1. **Push 0007–0018 to the live database** (owner approved 2026-09-25): run `bash ~/.claude/tmp/handoff-9a5915b6-abee-4e23-9703-4cfdc22c99a4.sh` (dry run, then apply). Then check a real sign-in, Admin → People and the core team's Today. Coordinator assignments to old class groups are removed by 0011; the core team re-assigns levels.
2. **Aditya Tapadia's email** (D27): invite him as the second admin in the database (the app refuses Admin by design).
3. **Push notifications on:** follow "Turning on push notifications" in [environments.md](../infrastructure/environments.md) (VAPID keys, secrets, deploy `push-send`, `app.push_config`, pg_net and pg_cron). `push-send` hasn't been type-checked with Deno here (not installed); the CLI checks it on deploy.
4. **WhatsApp sign-in codes (owner steps below), a real iPad test (including the Azure gate voice, I've arrived, and Home Screen notifications), and publishing** (below).
5. **Security review done (2026-09-25):** no critical or high findings; the medium and low ones are fixed in `0017` (a collector confirms with the last 4 digits of their mobile; one phone per link even under a race; staff location cut-off by the server clock; admin lock on updates; push devices and hosts; past absences).  Rate limits on trips and time changes, logged calls and link location batches are in `0018`. Codex isn't available on this account, so there was no cross-model review.
6. Push the branch and merge to `main`.

## Next
1. **Owner reviews the live app** and sends changes.
2. **Real WhatsApp codes:** the owner's steps under "Waiting on the owner" (WATI templates, secrets, Phone provider, Send SMS hook, webhook). Sign-ups stay on; the database refuses anyone not invited.
3. **Test on a real iPad:** Home Screen install, Start duty, the screen staying on for a full shift, and the sound check with Silent Mode on and off.
4. **Publishing:** give the Cloudflare token Workers Scripts: Edit, then `npm run deploy:design`.

## Done on 2026-10-03: go-live hardening
- WATI v3 checked against WATI's docs (send, template list, webhook events). The webhook maps WATI's exact event names (delivered and read were recorded as sent), keeps the failure reason, compares its key in constant time and asks WATI to retry when the database is down. `send-sms` logs before it sends, stays under Auth's 5-second hook limit, keeps the country code for numbers outside India, and treats a refusal inside a 200 as a failure. The 6-an-hour code limit moved to the send path (`otp_send_allowed`, `0044`), so a stranger can't lock a parent out. Only the sign-in template is required.
- Gate voice: announcements were cut after their first words. The silent sentence that unlocks the iPad's voice at Start duty hands iOS's audio session back when it ends, interrupting the clip playing then; sound now waits for it. A clip iOS interrupts or that ends early is played again, or said by the device voice, and a cut sentence is never counted as heard. The sound check reports a cut sentence as a failure.
- Parents: Running late can't add the minutes twice after a lost reply (`0045`), Running late and Change time hide after I've arrived, the card updates at once, the late sheet shows the card's minute, and live updates reconnect. Gate: overdue trips say how late they are instead of "any moment now"; admins get 20 wording changes a day and Reset doesn't count; reminders at least 2 minutes apart.
- Push: `push-send` answers 503 without VAPID secrets instead of crashing; failed deliveries are retried up to 3 times (`0046`); signing out removes this device's subscription.
- Center Leader is shown as Center Leader everywhere (it showed Center coordinator after choosing the area). The gate shows Leaders only Acknowledge and Ready; Coordinators also Check in, Hand over and Enter code.
- Sign-in: the WhatsApp mark on WhatsApp buttons; the code-sent message no longer lingers over the next screen.
- `npm run test:db` runs again (fixtures given mobiles after `0039`).
- Live data: the "Demo" people, children, trips and sign-in accounts from 2026-10-02 were removed. QA data for testing: children "QA Test Tara" and "QA Test Vihaan" with the owner's account as parent, and "QA Test Grandparent" (no app access).
- **Not deployed yet:** `0044`–`0046`, the functions and the app wait for the owner to run the deploy steps (secrets, then deploy).

## Waiting on the owner
- **Turn on D55 in Supabase** (built 2026-10-04, not deployed): run `0048`, deploy `password-pattern` and `password-change`, turn on the Custom Access Token hook (`public.access_token_hook`) and set Email → minimum length 10 with all four character kinds. Steps: "Auth settings" in [environments.md](../infrastructure/environments.md).
- **Decide (D55, security review H2a):** the admin knows a temporary password for up to 48 hours, so they could sign in as that person and choose the "own" password themselves. Closing it needs a WhatsApp code before the first change (one more message per issue). Accept, or add the code step.
- **WhatsApp sign-in setup** (paid, approved 2026-10-02): create the three WATI templates and wait for Meta to approve them; set the secrets; turn on the Phone provider and the Send SMS hook; deploy `send-sms`, `whatsapp-invite` and `wati-webhook`; add the WATI webhook. Exact steps: "Turning on WhatsApp through WATI" in [environments.md](../infrastructure/environments.md).
- A mobile number for every staff member who needs the app (the gate tablet's account and anyone without one can't sign in until it's added).
- What the existing "Jumpstart app" (website FAQ) is, and whether this platform replaces it.
- A vector version of the logo (SVG, AI or PDF) if one exists. Not needed for the app; better for print later.
