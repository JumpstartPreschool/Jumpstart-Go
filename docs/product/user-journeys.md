# User Journeys — Release 1

Step-by-step flows. Screens and their states are in [feature-specification.md](feature-specification.md). Trip states and tracking rules are in [tracking-architecture.md](../architecture/tracking-architecture.md).

The running example: **Aarav**, Jr KG · Half day (Mon–Fri, June–March, 09:00–13:00; drop-off window 09:00–09:30, pickup window 12:30–13:00), class "Sunflowers", regular times drop-off 09:15 and pickup 12:45. Coordinator **Priya** is assigned to Sunflowers.

## J0. How a school day starts (automatic)
At 00:05 the system creates each child's **expected drop-off and pickup** for the day from their regular times (D13). Children marked absent, on leave or off, and school holidays, are skipped. At 08:00 parents get: "Today: drop-off 9:15, pickup 12:45. Tap to change." (D17)

## J1. Parent: changes today's pickup time
1. Opens the app → the **Today** card shows: "Pickup 12:45 PM · You".
2. Taps the time → a time picker limited to the **pickup window (12:30–1:00 PM)**, showing how busy each 15-minute slot is (D15) → picks 1:00 → **Save**.
3. Priya's iPad announces at once: "Aarav's pickup changed from 12:45 to 1:00." (D2, D11)
4. **Needs a time outside the window** (e.g. 11:00 for a doctor's visit): the parent taps **Other time**, picks 11:00 and gives a reason. The request goes through and is announced immediately, flagged as off-schedule; Priya taps **Acknowledge** (D19).

## J2. Parent: sends a third person (the main safety journey)
1. **Today** card → **Who's picking up?** → a saved person, or **New person** (name, phone, relation; optionally a different WhatsApp number and an email).
2. Confirmation: "Ramesh (Grandfather) · 1:00 PM", with the **handoff code** and two ways to send the link: **Send on WhatsApp** (opens the parent's WhatsApp in a chat with Ramesh, message already written) and, if an email was given, "Link emailed to ramesh@… ✓".
3. Ramesh opens the link → **Confirm** (the link now works only on his phone) → allows location → **Start trip**. The parent sees him **LIVE** on the map, updating every few seconds, with an ETA range.
4. **"Get ready"** on Priya's iPad at 12:50, or earlier if the ETA drops below 10 minutes (D14). Priya taps **Ready**; the parent is notified: "Aarav is ready at the gate."
5. About 200 m from school: **Arriving**, and Priya hears "Aarav's pickup is arriving."
6. Priya enters the code Ramesh shows → **Handed over**. Aarav is checked out; the parent is notified: "Aarav handed to Ramesh at 1:01 PM."
7. The parent watches the trip home (staff no longer see it). Ramesh taps **Reached home**, or the parent taps **Received**, or the saved home location detects it, and the trip closes. Tracking stops 60 minutes after handover at the latest.

**If something goes wrong:**
- Ramesh is running late → see J12.
- The parent cancels (before handover) → announced.
- The code is wrong 3 times → handover blocked; the parent and admin are alerted.
- The link isn't confirmed within 10 minutes → the parent is notified, with **Resend**.
- The email bounces → the parent sees "Email not delivered" and uses WhatsApp or copies the link.
- Location denied → the trip goes ahead marked UNAVAILABLE.
- Updates stop → shown as RECENT, then STALE; after 5 minutes the parent and Priya are alerted.
- Not closed within 30 minutes of the expected arrival → the parent is alerted.
- Still open at 19:30 → the admin is alerted.

## J3. Parent: "Pick up now" (not scheduled)
**Pickup now** → who goes → **Send**. Priya's iPad announces within 3 seconds: "New pickup now: Aarav, Sunflowers. Please get Aarav ready." The child is prepared straight away; nobody approves anything first (D2). It's short notice by definition, so the row is flagged until Priya taps **Acknowledge**. If Priya isn't on duty, or nobody acknowledges within 2 minutes, every coordinator on duty hears it (D11). Then the same as J2 from step 2.

## J4. Parent: collects the child in person
The parent is the default person on the Today card. Sharing their own location is optional (one switch) and gives Priya their ETA and running-late alerts. At the gate, Priya taps the guardian's name on the child's guardian list → **Handed over**; the record shows which guardian and who confirmed them (D4). A guardian who arrives without anything changed in the app is handled the same way.

## J5. Drop-off
The expected drop-off is created from the regular times (J0). The parent can change the time inside the drop-off window or send someone. Priya taps **Check in**; Aarav is marked present; the parent is notified: "Aarav checked in at 9:17 AM." If Aarav hasn't arrived 10 minutes after the expected time (the late threshold), the parent gets: "We haven't seen Aarav yet. Is he coming today?" with **Running late / Absent today**. There's no handoff code at drop-off, because the child is being handed to the school.

## J6. Coordinator: a shift on the iPad
1. Log in (sessions last 7 days) → **Start duty**. One tap unlocks sound, tests the speaker and keeps the screen awake. The iPad stays on charge and unlocked at the gate.
2. **Gate queue** for Priya's classes: "Arriving next" (people on their way, sorted by ETA, with freshness), "Coming up" (scheduled times), "Done today". **All classes** is one tap away. New requests, changes, running-late alerts, "get ready" reminders and arrivals are announced one after another.
3. Landscape: the queue on the left, the selected trip's map and details on the right. Portrait or phone: the queue, with the trip opening as a sheet.
4. Each row's next action is its main button: Acknowledge → Ready → Enter code or Confirm guardian → Handed over, or Check in.
5. **Log for a parent** who phoned in.
6. **Messages** about today's pickups and drop-offs.

## J7. Core team: plans and records
1. **Today board:** every child's expected times, today's changes, running-late flags and status (not arrived / present / collected / absent / on leave / off).
2. **Regular times:** set a child's weekday times inside the programme windows; copy one schedule to a whole class.
3. **Programme timings:** open a programme → days, term, hours, drop-off and pickup windows (or flexible) → save. Children whose regular times fall outside a changed window are listed first to fix.
4. **Attendance:** mark present / absent / on leave / off; review absences reported by parents.
5. **Announcements** (e.g. "Early closing Friday at 12:00") to all parents or one class, with read receipts.
6. **Messages** with parents.

## J8. Third person: the link page
WhatsApp or email link → opens instantly, no install or login → "You've been asked to pick up **Aarav K.** from Jumpstart Preschool, Karve Road at **1:00 PM**" → **Confirm** → a screen explaining why location is needed → the phone's permission prompt → **Start trip** → a map to the school, the handoff code, a **Running late** button and a "keep this page open" banner → show the code at the gate → the trip home → **Reached home** → "Thank you", and the link stops working.

## J9. Parent: reports an absence
Child → **Report absence** → date(s) and reason → that day's expected trips are removed, and the core team sees "On leave (reported by parent)".

## J10. Admin: running the branch
- **Dashboard:** attendance totals, trips (expected / in progress / done), gate-rush chart by slot, running late, flagged requests, open alerts, which coordinators are on duty, all updating live.
- **People:** add, edit or remove parents and children (form or CSV: preview → errors per row → confirm); invite staff and assign roles; **assign coordinators to classes**; deactivate someone (logged out everywhere immediately).
- **Reports:** 30-day trends and export. **Settings:** reminder times, lead time, late threshold, wording, arrival radius, holidays. **Audit log.**

## J11. Anyone: first login
Enter phone number or email → one-time code → parents only, first time: a consent screen (what we collect, why, how long it's kept) → role home. A phone number or email that isn't registered gets: "This number isn't registered with Jumpstart. Please contact the school."

## J12. Running late (D20)
- **Parent says so:** Today card or live trip → **Running late** → +10 / +20 / +30 → today's time moves, and Priya hears "Aarav's mother is running 15 minutes late. New pickup 1:00." If the new time is after the pickup window closes (1:00 PM), it's flagged as off-schedule so staff know Aarav stays past the end of his class.
- **Live location shows it:** the ETA's lower end is 10 or more minutes past the scheduled time → Priya hears "Aarav's pickup is running about 10 minutes late", and it's repeated if the delay grows by another 10 minutes. When a third person is late, the parent is told too.
- **Nothing from anyone:** 10 minutes after the scheduled time, with no arrival and no live location → Priya hears "Aarav's pickup is 10 minutes late, no update", and the parent gets "Are you on the way?" (Running late +10 / +20 / +30 · Change · Cancel).
