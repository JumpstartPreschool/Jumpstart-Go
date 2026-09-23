# Product Requirements — Release 1

**Status:** Product stage approved (2026-09-24); updated 2026-09-24 with the owner's answers on programme windows, instant announcements, coordinator iPads, third-person contact details and late alerts · **Branch:** Jumpstart International Preschool & Learning Center, 11/7 Matoshri, Kishor B Tapadia Path, Karve Road, Erandwane, Pune 411004 · **Scale:** about 50 children (ages 6 months to 8 years)

Related: [vision](vision.md) · [user roles](user-roles.md) · [user journeys](user-journeys.md) · [requirements](requirements.md) · [feature specification](feature-specification.md) · [tracking architecture](../architecture/tracking-architecture.md)

## 1. Goals
1. **Every handover is verified and recorded,** whether a parent or a third person does it.
2. **Children are ready at the right time.** Every day starts from a known schedule inside the child's programme window, parents can change today's time, and a request is announced to coordinators the moment it is made.
3. **Less rush at the gate.** Pickups are spread across time slots, and staff see who is arriving next instead of a crowd.
4. **Nothing gets missed.** Schedule changes, late arrivals, announcements and replies arrive as notifications in the app, not in a WhatsApp group.
5. **Parents see the trip live,** minute by minute like Zomato or Google Maps, with honest freshness labels.
6. **Attendance is a by-product of the gate:** check-in marks the child present, and the core team handles the exceptions.
7. **The admin controls access** and sees how the branch is doing at a glance.

**Release 1 is successful when, for two consecutive weeks:**
- every handover has a verified record;
- attendance is taken entirely in the app;
- at least 80% of pickups have a scheduled or requested time in the app;
- a new request is heard on the coordinators' iPads within 3 seconds;
- the median wait at the gate (from "arriving" to "handed over") is under 3 minutes.

## 2. Scope

### In release 1
| Area | Contents |
|---|---|
| Foundation | Invite-only login (one-time code by phone or email), five role areas, roles assigned by the admin, audit log, installable web app, notifications (in-app, web push, spoken, email for third-person links) |
| Profiles | Parents and children added and removed only by the admin (single entry or CSV upload); child: name, preferred name, date of birth, programme, class, guardians, saved pickup people |
| Programmes and schedules | Programmes with their days, term, hours and drop-off / pickup windows (core team or admin); each child's regular weekday times inside those windows (core team or admin); today's changes (parent or staff); schedule reminders; "get ready" reminders; how busy each time slot is. The programmes are listed in §5 |
| Pickup and drop-off | Scheduled and "now" trips, instant announcements, third-person link by WhatsApp and email, handoff code, live tracking with timeline and replay, running-late alerts, off-schedule and short-notice handling, cancellation, alerts when something doesn't happen |
| Attendance | Present / absent / on leave / off; check-in and check-out from the gate; parents report absences |
| Communication | Announcements (all parents or one class) with read receipts; one conversation per child between parents and school staff |
| Admin | Live dashboard, 30-day reports, people and roles, coordinator-to-class assignment, settings, CSV export |

### Not in release 1
Vans or drivers (Jumpstart has no transport) · Parent Toddler Program (D22) · Early Childhood Expert Program (adult teacher training) and corporate child-care partnerships · child experience · learning progress · fees · documents · medical records · chat attachments · multiple branches · Hindi or Marathi screens · native app-store apps · automatic WhatsApp messages sent by the school (paid, see D5).

## 3. Product decisions
| # | Decision | Why |
|---|---|---|
| D1 | Only people the school invites can log in; only the admin adds, edits or removes children and parents and links them together. | Stops anyone from claiming a child. The owner wants the admin to hold the main access. |
| D2 | Requests are **accepted automatically and announced instantly** on the coordinators' iPads; nobody has to approve them first. **Off-schedule** requests (outside the child's programme window) and **short-notice** changes (less than 15 minutes away) are also flagged: a coordinator taps Acknowledge so the school knows someone heard. Getting the child ready never waits for that tap. | The owner: "the parent clicks the button and the announcement starts." Speed first; the flag makes sure the risky requests are noticed. |
| D3 | Third person = name, phone, relation, and optionally a separate WhatsApp number and an email address. **No photos.** | Owner's instruction. |
| D4 | A **4-digit handoff code** is required when a third person collects a child. When a registered guardian collects, the coordinator confirms them from the child's guardian list with one tap, and the release is recorded with who confirmed it. | Staff know the parents by sight; the code protects the case where they don't. Keeps the gate fast. |
| D5 | The trip link reaches the third person in two free ways: **Send on WhatsApp** opens the parent's own WhatsApp straight into a chat with the third person's WhatsApp number, with the message already written; and if an email address is given, the server **emails the link automatically**. The school sending WhatsApp messages automatically needs Meta's paid WhatsApp Business Platform, so it is left out until the owner approves the cost. | Free-first, with no manual copying of links. |
| D6 | **School hours are fixed at 09:00–19:00 India time** and cannot be changed in the app; nothing can be requested outside them. Inside those hours, each **programme** has its own drop-off and pickup windows, set by the core team or the admin (see D19). | Owner's instruction. |
| D7 | Spoken alerts: a chime followed by speech, one after another, through the iPad speaker (a Bluetooth speaker works automatically). | Owner's answer. |
| D8 | Location is only collected during an active trip, from the adult's phone, with their permission. The child's location is never tracked. | Collect as little as possible. |
| D9 | Retention: trip logs and routes 30 days; attendance for the current and previous academic year; audit log 1 year; anonymous daily totals kept for long-term trends. | The 30-day rule plus school record-keeping. |
| D10 | Chat is text only and is not a way to change a pickup: time changes go through the schedule flow. | Keeps safety actions in the verified flow. |
| D11 | **The admin assigns coordinators to classes.** A request is announced on the iPads of the coordinators assigned to that child's class who are on duty. If none of them is on duty, or nobody acknowledges within 2 minutes, it goes to every coordinator on duty. | The owner: announcements go to "the coordinators responsible for that child". The fallback means no request is ever unheard. |
| D12 | ETA is a range (e.g. "about 10–15 min") from the road route and the live position, with no live traffic data. | Free-first; no false precision. |
| D13 | **Every day starts from each child's regular schedule.** An expected pickup and drop-off exist before anyone taps anything, and a change replaces them for that day only. Children marked absent, on leave or off have no expected trips. | Children are ready at the exact time. |
| D14 | **"Get ready" reminder** to coordinators at whichever comes first: 10 minutes before the scheduled time, or when the live ETA drops below 10 minutes. A request made less than 10 minutes ahead is announced together with "please get the child ready" right away. The admin sets the lead time. | Children are ready when the adult arrives, not before or after. |
| D15 | **Gate rush:** when choosing a time, parents see how busy each 15-minute slot is ("Busy · 8 pickups"). The busy slots are only shown, not blocked. | Spreads arrivals without restricting parents. |
| D16 | **Roles, not per-person permission switches.** The admin assigns Admin / Core team / Coordinator; a person can hold several. What each coordinator hears is set by the classes the admin assigns them (D11). | Matches how the school is organised; simpler to reason about and to audit. |
| D17 | Schedule reminders to parents: at 08:00 on school days, "Today: drop-off 9:15, pickup 12:45. Tap to change." Parents can switch these off. | Removes the need for timing calls. |
| D18 | Class names are set by the admin during onboarding, not fixed in the code. | Depends on the school. |
| D19 | **Programmes** are timing plans. Each is either a class level with a plan (Playgroup, Nursery, Jr KG or Sr KG × Half day morning / Half day afternoon / 360° / 360°+) or a standalone programme (Learning Center, After School, Preschool Readiness). Each has **days** (Mon–Fri, or Mon–Sat except the 2nd and last Saturday), a **term** (June–March or June–May), **hours**, and either **fixed windows** (e.g. Jr KG Half day 09:00–13:00: drop-off 09:00–09:30, pickup 12:30–13:00) or **flexible** times (Learning Center and 360°+: any time within the hours; each child's own times are set by the core team). **The core team or the admin sets programme timings.** Every child belongs to one programme. The core team and admin set each child's regular times, and parents change today's time, **inside that child's windows**. A time outside the window (but inside school hours) is allowed only with a reason and is flagged as off-schedule (D2). | Owner's instruction: timings come from the programme, set by the core team. Matches the programmes on jumpstartpreschool.in (§5). The off-schedule path covers real exceptions like a doctor's appointment. |
| D20 | **Running late:** coordinators hear "Aarav's pickup is running about 10 minutes late" when the live ETA shows the adult will arrive at least 10 minutes after the scheduled time, or when the scheduled time passes by 10 minutes with no arrival and no live location. In the second case the parent is also asked "Are you on the way?" (Running late +10 / +20 / +30 · Change · Cancel). A parent can also tap **Running late** at any time; that moves today's time and is announced straight away. The admin sets the 10-minute threshold. | Owner's instruction; staff can plan around a late pickup instead of waiting at the gate. |
| D21 | **Coordinators work on iPads** (their own, one login each). The coordinator area is designed iPad-first, landscape and portrait, and still works on a phone. | Owner's answer: coordinators carry iPads between the gate and the classrooms. |
| D22 | **Parent Toddler Program** is left out of release 1: the parent stays with the child for the whole 1-hour session, so there is no handover to verify. | Nothing for the pickup flow to protect; can be added later for attendance. |

## 4. Risks
| Risk | Mitigation |
|---|---|
| Web location stops when the third person's page is in the background or the phone is locked | Screen kept awake, "keep this page open" banner, LIVE/RECENT/STALE/UNAVAILABLE states, alerts when updates stop |
| **Spoken alerts only play while the coordinator app is open on screen and the iPad is unlocked.** iPadOS does not let web apps speak in the background or while locked. | **Start duty** keeps the screen awake; duty iPads are set to never auto-lock while charging; web push (with its system sound) is sent as a backup and reaches a locked iPad once the app is installed to the Home Screen; the dashboard shows which coordinators are on duty. If this isn't enough in practice, a native iPad app is the fix (it needs an Apple Developer account, $99/year: approval required). |
| iPhone and iPad push only works once the web app is installed to the Home Screen | Guided install for parents and staff |
| Link previews in WhatsApp or email scanners open the trip link before the person does | The link locks to a phone only when the person taps **Confirm**, not when the page is first opened (TRIP-4) |
| Parents ignore the schedule and just turn up | Guardian confirmation at the gate; the 08:00 reminder; running-late prompts; the admin sees the share of pickups with a time set |
| Free-plan limits (email, maps, routing, hosting) | 50 children is far below any limit; tracked in `docs/infrastructure/services.md` |

## 5. Programmes at Karve Road (starting data)
Taken from jumpstartpreschool.in on 2026-09-24: the Preschool and 360° programme pages, the Learning Center, After School, Preschool Readiness and Parent Toddler pages, the Karve Road centre page and the FAQ. **The core team confirms or corrects these in the app before launch** (D19). Proposed windows use the first 30 minutes of the day for drop-off and the last 30 minutes for pickup, following the owner's example; "flexible" means each child's own times, set by the core team.

| Programme | Ages | Days | Term | Hours | Drop-off window | Pickup window |
|---|---|---|---|---|---|---|
| Playgroup · Half day (morning) | 2–3 y | Mon–Fri | Jun–Mar | 09:00–11:30 | 09:00–09:30 | 11:00–11:30 |
| Playgroup · Half day (afternoon) | 2–3 y | Mon–Fri | Jun–Mar | 11:45–14:15 | 11:45–12:15 | 13:45–14:15 |
| Playgroup · 360° | 2–3 y | Mon–Fri | Jun–Mar | 11:45–17:30 | 11:45–12:15 | 17:00–17:30 |
| Playgroup · 360°+ | 2–3 y | Mon–Sat¹ | Jun–May | 09:00–19:00 | flexible | flexible |
| Nursery · Half day (morning / afternoon), 360°, 360°+ | 3–4 y | as Playgroup | as Playgroup | as Playgroup | as Playgroup | as Playgroup |
| Jr KG · Half day | 4–5 y | Mon–Fri | Jun–Mar | 09:00–13:00 | 09:00–09:30 | 12:30–13:00 |
| Jr KG · 360° | 4–5 y | Mon–Fri | Jun–Mar | 09:00–16:30 ² | 09:00–09:30 | 16:00–16:30 |
| Jr KG · 360°+ | 4–5 y | Mon–Sat¹ | Jun–May | 09:00–19:00 | flexible | flexible |
| Sr KG · Half day, 360°, 360°+ | 5–6 y | as Jr KG | as Jr KG | as Jr KG | as Jr KG | as Jr KG |
| Learning Center (daycare) | 6 m–8 y | Mon–Sat¹ | all year, paid monthly | 09:00–19:00 | flexible | flexible |
| After School Program | 4–8 y ³ | Mon–Fri | — | 16:00–19:00 ³ | 16:00–16:30 | 18:30–19:00 |
| Preschool Readiness Program | 18 m–2 y | Mon–Fri | 3-month course | 11:30–13:00 | 11:30–11:45 | 12:45–13:00 |
| Parent Toddler Program | 6 m–2 y | 2 days a week | — | 17:00–18:00 (Karve Road) | not in release 1 (D22) | — |

¹ Mon–Sat except the 2nd and last Saturday of the month. 360°+ is the preschool class plus the Learning Center from June to May.
² The programme page says Jr KG 360° runs 09:45–16:30; the FAQ says 09:00–16:30. The FAQ is used here.
³ The Karve Road page says After School runs 16:00–19:00 for ages 3–8; the general programme page says 14:00–18:00 for ages 4–8. The Karve Road page is used here.

Other things the website says that affect the app:
- **Ages differ between pages:** the FAQ gives Playgroup 1.5–2.5 y, Nursery 2.5–3.5 y, Jr KG 3.5–4.5 y and Sr KG 4.5–5.5 y. The app doesn't use age bands for any rule, so this only matters for how classes are named.
- **Single entry and exit point** for children, with a 24×7 security guard. This matches the one gate queue.
- **"Detailed information of the child for the day is communicated through the Jumpstart app"** (FAQ): the school already uses an app for daily updates to parents (open question).
- **"Availability of transport facility"** (FAQ): the owner has said there is no transport; release 1 follows the owner.
- School contact number on the Karve Road page: 98811 10011 (used for **Call school**, kept as a setting).
