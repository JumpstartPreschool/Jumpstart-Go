# User Roles

Release 1 has five roles. Each staff and parent role gets its **own area** in the web app, with a home screen built for that job. Areas share the design system and components, but never reuse screens from another role. The third person gets a separate, lightweight web page.

| Role | Surface | Main device | Home screen answers | Login |
|---|---|---|---|---|
| **Admin** | Web app — `/admin` | Laptop (desktop layout), also works on phone | "How is the branch doing today?" | Invite only, one-time code by phone or email |
| **Core team** | Web app — `/core` | Phone or iPad | "Who is expected when today, and who is here?" | Invite only, one-time code by phone or email |
| **Coordinator** | Web app — `/coordinator` | **iPad** (their own, carried between the gate and the classrooms); also works on a phone | "Who is arriving next, and what do I do now?" | Invite only, one-time code by phone or email |
| **Parent** | Web app — `/parent` | Phone | "Where is my child, and when is pickup?" | Invite only (admin adds them), one-time code by phone or email |
| **Third person** | Standalone web page — `/t/{token}` | Phone, from a WhatsApp or email link | "What do I do next?" | No account. The link gives access to one trip only. |

**How roles are assigned:**
- The **admin assigns roles** to each staff member; the **core team can give or remove the Coordinator role** (D23). One person can hold several roles; for example, someone on the core team who also works the gate has both Core team and Coordinator. A person with several roles, or a staff member who is also a parent, gets an area switcher.
- The **server checks the role on every request.** Hiding a button is never the only protection.

## Admin
Full access to everything in the branch, CEO-level. The admin alone holds the main access.
- **People:** the only role that adds, edits or removes parents and children and their details (single entry or CSV upload); invites staff and assigns roles; **assigns coordinators to classes** (the core team can too), which decides whose iPad announces which children; deactivates anyone, which logs them out everywhere immediately.
- **Dashboard:** today at a glance: present, absent, on leave, off, not yet arrived; pickups and drop-offs expected, in progress and done; gate rush by time slot; off-schedule and short-notice requests; open alerts.
- **Reports:** 30-day trends, including children collected, third-person pickups, on-time readiness, time from arrival to handover, and the busiest time slots; long-term trends come from anonymous daily totals. CSV export.
- **Settings:** announcement wording, how much notice changes need, "get ready" lead time, running-late threshold, arrival radius.
- **Audit log** of all sensitive actions.
- Can also do everything the core team and coordinators can do.

## Core team
Plans the day and keeps records accurate.
- **Programme timings:** sets each programme's days, term, hours and drop-off / pickup windows (e.g. Jr KG Half day 09:00–13:00: drop-off 09:00–09:30, pickup 12:30–13:00), or marks it flexible (Learning Center, 360°+). School hours are fixed at 09:00–19:00. The admin can do this too.
- **Regular schedules:** decides each child's regular pickup and drop-off times for each weekday, inside the child's programme windows (e.g. Aarav, Jr KG Half day: drop-off 9:15, pickup 12:45, Mon–Fri). The admin can do this too.
- **Attendance:** marks each child **present, absent, on leave or off** (off = not a scheduled day for that child, or a school holiday); reviews absences reported by parents.
- **Today board:** every child's expected times for today, parent changes to times, and who has arrived or been collected.
- **Messages** with parents about schedules; **announcements** to all parents or to one class (e.g. "Early closing Friday").
- **Coordinators:** gives or removes the Coordinator role and chooses each coordinator's classes, which decides whose iPad announces which children (D11, D23). Cannot give the Admin or Core team role.

## Coordinator
Brings children between the gate and the classrooms, working from an iPad.
- **Gate queue:** today's pickups and drop-offs for their classes in time order, with the live ETA and freshness label for anyone on the way, and a switch to see the whole school.
- **Spoken alerts** for the children in their classes, the moment a parent taps: new requests, time changes, running late, "get ready" reminders, arrivals, cancellations, off-schedule requests.
- **Actions:** Acknowledge → **Ready** (child prepared) → **Handed over** (after entering the handoff code for a third person, or confirming the guardian for a parent); **Check in** at drop-off; log a request for a parent who phoned in.
- **Messages** with parents about today's pickup or drop-off.

## Parent
A guardian linked to children by the admin. A child can have several guardians, each with their own login.
- **Today:** each child's status and today's pickup and drop-off times; **change today's time** or send someone else in a few taps.
- **Pickup / Drop-off now:** choose who goes (me / a saved person / a new person), send the link by WhatsApp or email, and track the trip live, minute by minute.
- **Running late:** one tap to tell the school (+10 / +20 / +30 minutes).
- **Notifications:** child checked in, ready, handed over, reached home; a reminder about today's schedule; replies from the school; announcements.
- **Saved people** (name, phone, relation, optional WhatsApp number and email; **no photos**); an optional saved **home location**; **report an absence**; attendance and 30-day trip history with route replay, **for their own children only**.

## Third person
The adult the parent chose for one trip. They have no account.
- Opens the link (from WhatsApp or email) → confirms → allows location → starts the trip → shows the handoff code at the gate → taps **Reached**.
- Sees only the child's first name and last initial, the school's name and location, and the code.
- The link works for one trip and locks to the phone that confirms it. It stops at 19:00 if the trip hasn't started, otherwise at trip close or 60 minutes after handover.

## What each role can do

| Capability | Admin | Core team | Coordinator | Parent | Third person |
|---|---|---|---|---|---|
| Add or edit parents and children, upload roster | ✓ | – | – | – | – |
| Assign staff roles and coordinator classes, settings, audit log | ✓ | – | – | – | – |
| Set programme days, term, hours and windows | ✓ | ✓ | – | – | – |
| Set a child's regular times (inside programme windows) | ✓ | ✓ | – | – | – |
| Change **today's** time | ✓ | ✓ | – | own children | – |
| Mark present / absent / on leave / off | ✓ | ✓ | check-in and check-out via the gate only | report leave for own children | – |
| Gate queue, Ready, Handed over, Check in | ✓ | – | ✓ | – | – |
| Hear spoken alerts | optional | optional | ✓ (their classes, then everyone's if unanswered) | – | – |
| Request a pickup or drop-off | on a parent's behalf | on a parent's behalf | on a parent's behalf | own children | – |
| See live location | until handover (after it, only with a logged reason) | until handover | until handover | own children's trips, including the way home | own position |
| Messages with parents | ✓ | ✓ | ✓ | own children | – |
| Send announcements | ✓ | ✓ | – | – | – |
| Trip history and route replay (30 days) | all | all | today only | own children | – |
| Reports and export | ✓ | – | – | – | – |

## Out of release 1
A separate **Teacher** role (for now the core team marks attendance) · **Child** experience · **Branch manager** (multiple branches).
