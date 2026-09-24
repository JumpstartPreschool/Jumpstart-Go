# Requirements — Release 1

Each requirement is testable. "Server" means it is enforced on the backend and doesn't rely on the screens. Decisions (D#) are in [prd.md](prd.md); roles are in [user-roles.md](user-roles.md).

## Functional

### Authentication and access (AUTH)
- **AUTH-1** Login only with a one-time code sent to a registered email address (release 1; codes by phone are added once an SMS provider is approved, system-architecture A6). There is no public sign-up. *(Server)*
- **AUTH-2** One-time codes expire after 5 minutes; requests are rate-limited per phone number or email and per IP address; accounts lock temporarily after repeated failures. *(Server)*
- **AUTH-3** Sessions: parents 60 days, staff 7 days. Deactivating a user ends all their sessions immediately. *(Server)*
- **AUTH-4** Every read and write is checked against the user's roles (the capability table in user-roles.md). A request for data outside the user's scope returns "not found" and is never exposed. *(Server)*
- **AUTH-5** Changes to people or roles, and exports, require a login within the last 15 minutes. *(Server)*
- **AUTH-6** Parents accept the consent notice on first login; the acceptance is stored with its timestamp and notice version.
- **AUTH-7** Each role area (`/admin`, `/core`, `/coordinator`, `/parent`) can only be opened by users who hold that role. *(Server)*

### People and profiles (PRO)
- **PRO-1** Only the admin adds, edits or removes parents and children, one at a time or by CSV → preview → errors per row → confirm. Uploading again updates matching records and never duplicates them. Each child has exactly one programme and one class. *(Server)*
- **PRO-2** A child can have several guardians; a guardian can have several children.
- **PRO-3** Parents manage saved people: name, phone, relation, and optionally a WhatsApp number (when it differs from the phone) and an email address. Phone and WhatsApp numbers are validated as Indian mobile numbers; emails are validated. No photos of third persons anywhere.
- **PRO-4** The admin assigns and removes roles; the core team can give and remove only the Coordinator role (D23). One person can hold several roles. Every change is recorded in the audit log. *(Server)*
- **PRO-5** The core team or the admin assigns coordinators to classes; only people with the Coordinator role can have classes, and removing the role removes them; a class can have several coordinators and a coordinator several classes (D11). *(Server)*

### Schedules (SCH)
- **SCH-1** The core team or admin sets each child's regular drop-off and pickup times for each of the programme's days, inside the programme's windows; one schedule can be copied to a whole class. *(Server)*
- **SCH-2** Every school day the system creates the expected drop-off and pickup from the schedule, skipping holidays, days that aren't in the child's programme days or term (e.g. April–May for June–March programmes), and children marked absent, on leave or off. Running it twice never creates duplicates. *(Server, scheduled)*
- **SCH-3** A parent, core team member or admin can change **today's** time. Inside the child's programme window it is a normal change; outside the window but inside school hours it needs a reason and is off-schedule (D19). The change applies to that day only, is recorded, and is announced to coordinators straight away. *(Server)*
- **SCH-4** Changes less than 15 minutes before the time (short notice) and times outside the programme window (off-schedule) are flagged and must be acknowledged by a coordinator (D2). The flag never delays the announcement or the "get ready" reminder. *(Server)*
- **SCH-5** The time picker shows the number of pickups already in each 15-minute slot (D15).
- **SCH-6** A "get ready" reminder goes to coordinators at whichever comes first: the scheduled time minus the lead time (default 10 minutes), or the live ETA dropping below the lead time (D14).
- **SCH-7** 08:00 schedule reminder to parents on school days; parents can switch it off (D17).
- **SCH-8** The core team or admin manages programmes: name, days (Mon–Fri, or Mon–Sat except the 2nd and last Saturday), term dates, hours, and either fixed drop-off and pickup windows or flexible times (D19). The admin manages classes; the core team or admin manages the school calendar (holidays). *(Server)*
- **SCH-9** School hours are fixed at 09:00–19:00 India time and are not a setting. Programme hours must lie inside school hours. Windows are derived, never stored by hand (D24): drop-off the 15 minutes before a class starts, pickup the 15 minutes after it ends; for 360°+ and the Learning Center, drop-off before the core hours and pickup any time after them until 19:00. The server rejects anything else. Changing a programme's windows never moves times already set for today; children whose regular times fall outside the new windows are listed for the core team to fix. *(Server)*

### Pickup and drop-off (TRIP)
- **TRIP-1** Only one open trip per child per direction per day. *(Server; enforced by the database)*
- **TRIP-2** No requests or time changes outside 08:45–19:15 India time (D6, D24); times outside the child's programme window require a reason (D19). *(Server)*
- **TRIP-3** Trip changes follow the defined trip-state rules; any move not allowed by those rules is rejected. Every change records who, which role, when and where from. *(Server)*
- **TRIP-4** Third-person links: at least 128 bits of randomness, stored hashed, one trip only, and can be cancelled or replaced by the parent. Opening the link changes nothing; it **locks to the phone that taps Confirm** (so WhatsApp link previews and email scanners can't lock it). It expires at 19:00 if the trip hasn't started, otherwise when the trip closes or 60 minutes after handover. *(Server)*
- **TRIP-5** Handover to a third person requires the correct 4-digit code; 3 wrong attempts block the handover and alert the parent and admin. *(Server)*
- **TRIP-6** Flagged requests that aren't acknowledged within 5 minutes are announced again and the admin is notified.
- **TRIP-7** Alerts when something doesn't happen: third person hasn't confirmed in 10 minutes; tracking stale for 5 minutes; not closed within 30 minutes of the expected arrival; drop-off not checked in by the late threshold after the expected time (the parent is asked: running late / absent today); drop-offs still open at 14:30 and pickups still open at 19:30 (the admin is alerted). *(Server, scheduled)*
- **TRIP-8** The parent can cancel any time before handover or check-in; coordinators are told immediately.
- **TRIP-9** Staff can create a request on a parent's behalf; it's recorded as "entered by {staff}". Walk-in handover to a registered guardian is recorded as a walk-in.
- **TRIP-10** Doing the same request twice (double tap, retry) never creates two trips or two changes. *(Server)*
- **TRIP-11** Running late (D20): announced when the lower end of the live ETA range is at least the late threshold (default 10 minutes) past the scheduled time, and again for every further 10 minutes; or when the scheduled time passes by the threshold with no arrival and no live location, in which case the parent is also asked "Are you on the way?" with +10 / +20 / +30, Change and Cancel. A parent's **Running late** choice moves today's time and is announced at once. A new time that falls outside the programme window is off-schedule. *(Server, scheduled)*
- **TRIP-12** Link delivery (D5): **Send on WhatsApp** opens WhatsApp on the parent's phone in a chat with the third person's WhatsApp number, with the message pre-filled; if an email is given, the server emails the link. The parent sees whether the email was sent or failed, and can resend or copy the link. *(Server for email)*

### Tracking (TRK) — full detail in `docs/architecture/tracking-architecture.md`
- **TRK-1** Location is only collected during an active trip, from the adult's phone, after they give permission.
- **TRK-2** Every point: time, accuracy, which trip, who sent it; the server rejects implausible points (impossible speed, poor accuracy, future or old timestamps, rate abuse). *(Server)*
- **TRK-3** Freshness shown everywhere: **LIVE** (under 15 s), **RECENT** (15–60 s), **STALE** (over 60 s), **UNAVAILABLE** (no permission or no data). Markers only move on LIVE data; stale markers stop and fade.
- **TRK-4** Timestamped timeline plus route replay; gaps are drawn as gaps.
- **TRK-5** ETA shown as a range, recalculated from the live position; hidden when the location is STALE or UNAVAILABLE.
- **TRK-6** "Arriving" is triggered automatically within 200 m of the school (18.50885, 73.83280); the admin can change the radius.
- **TRK-7** Tracking stops when the trip closes, or 60 minutes after handover at the latest, even if nobody taps "Reached". *(Server)*
- **TRK-8** A parent can save one home location; it gives an ETA home and detects "Reached home" automatically on trips that parent arranged. Only that parent can see it (not other guardians, staff or the third person). *(Server)*
- **TRK-9** After handover, the route is visible only to the child's guardians. Staff see location only until handover; the admin can open a post-handover route only by giving a reason, which is audit-logged. *(Server)*

### Spoken alerts (ANN)
- **ANN-1** New requests, time changes, running-late alerts, "get ready" reminders, arrivals, cancellations and flagged requests play a chime followed by speech, one after another, using the admin's wording. A new request is heard within 3 seconds of the parent's tap (NFR-2).
- **ANN-4** Announcements go to the on-duty coordinators assigned to the child's class; if none is on duty, or nobody acknowledges within 2 minutes, to every on-duty coordinator (D11). One acknowledgement clears it on every iPad. *(Server)*
- **ANN-2** Repeats every 2 minutes until acknowledged; flagged requests use a different sound and wording.
- **ANN-3** A web push notification is sent as well, for staff whose screen is not open.

### Attendance (ATT)
- **ATT-1** Daily status per child: **present, absent, on leave, off**. Check-in at drop-off sets present with the time; handover at pickup records check-out with the time.
- **ATT-2** The core team and admin can set any status; every change is recorded with who and when.
- **ATT-3** Parents report absences for today or future dates, with a reason; that day's expected trips are removed.
- **ATT-4** Parents are notified on check-in and check-out.

### Communication (COM)
- **COM-1** The core team and admin send announcements to all parents or to one class; the app records who has read each one.
- **COM-2** One conversation per child between the child's guardians and staff (admin, core team, coordinators); replies show the staff member's name. Text only.
- **COM-3** Chat messages sent outside 09:00–19:00 show parents "The school replies between 9 AM and 7 PM", and staff are not notified about them until 09:00. Safety alerts (TRIP-7, TRIP-11) are not affected.
- **COM-4** Message text is always displayed as plain text; it can never run code in the app.

### Admin (ADM)
- **ADM-1** Live dashboard for today (attendance totals, trips, gate rush by slot, flagged requests, alerts), updated in real time.
- **ADM-2** 30-day reports and CSV export; long-term trends from anonymous daily totals.
- **ADM-3** Searchable audit log of all sensitive actions, kept 1 year.

## Non-functional
- **NFR-1 Performance:** the parent home screen is usable within 2.5 s on a mid-range Android phone on 4G. The third-person page is kept small (target under 150 KB of JavaScript before the map loads).
- **NFR-2 Real time:** a location reaches the parent's screen in under 2 s at the 95th percentile; a new request is announced in under 3 s.
- **NFR-3 Devices:** checked on real iPad (Safari and installed app, landscape and portrait: the coordinators' main device), iPhone (Safari and installed app) and Android (Chrome and installed app); safe areas; touch targets at least 44×44 pt.
- **NFR-4 Accessibility:** WCAG 2.2 AA; supports reduced motion and reduced transparency; works with screen readers.
- **NFR-5 Privacy:** data stored in India where the free plan allows it (documented in `services.md`); retention per D9, deleted by scheduled jobs.
- **NFR-6 Cost:** free while in development; any paid service needs approval first (`docs/infrastructure/services.md`).
- **NFR-7 Honesty:** no simulated GPS, ETA, attendance or notifications outside development mode, where they are clearly labelled.
