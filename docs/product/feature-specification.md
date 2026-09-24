# Feature Specification — Screens, Navigation and States (Release 1)

This is the UX stage output: every screen, what it's for, its main action, and every state it can be in. Visual design (tokens, glass surfaces, motion) is defined in `docs/design/`. Roles are in [user-roles.md](user-roles.md), flows in [user-journeys.md](user-journeys.md).

## 1. UX rules that apply everywhere
- **One main action per screen,** always within thumb reach (bottom third on a phone). Secondary actions are visually quieter.
- **The next step is the button.** A row's button shows the next valid step for that trip (Acknowledge → Ready → Enter code → Handed over). Staff never search for what to do.
- **Most-used actions are never hidden in a menu.**
- **Bottom sheets for quick choices** on phones (choose child, choose person, choose time). Full screens only for tasks with several steps.
- **Every change shows up immediately and is undone if the server rejects it,** except handover, check-in and code entry: those wait for the server to confirm before showing success.
- **Every screen defines** its loading (a skeleton shaped like the final layout), empty, error, offline and stale states. None of these may be blank.
- **Offline banner** at the top whenever the connection drops, with actions that need the server disabled. Screens show the last data received, with its age.
- **Install prompt:** Android uses the browser's own install prompt. iPhone and iPad get a short illustrated guide ("Share → Add to Home Screen"), shown after the first successful action rather than on first launch (for coordinators: during Start duty). Push notifications are only offered after the app is installed on iPhone or iPad.
- **Freshness badge** on every live element: `● LIVE` / `RECENT · 32s` / `STALE · 3 min` / `UNAVAILABLE`, each with its own colour **and** icon, so it doesn't rely on colour alone.

## 2. Parent — `/parent` (phone first)
**Bottom navigation:** Today · Updates · Messages · Account

| Screen | Purpose | Main action | States |
|---|---|---|---|
| **Today** | Each child's day at a glance: status, drop-off and pickup time, who is going | Depends on context: **Change time / Who's picking up? / Running late / Track** | Before drop-off · On the way to school (live mini-map) · Checked in · Ready · Pickup on the way (live mini-map) · Collected · Reached home · Absent / on leave / off · Holiday · Skeleton · Offline |
| Change time (sheet) | Pick today's time inside the programme window (for flexible programmes, any time within the programme's hours), showing how busy each slot is | **Save time** | Inside window (default; only window slots shown) · **Other time** (outside the window, reason required, off-schedule warning) · Short notice (warning) · Outside school hours 9 AM–7 PM (disabled, with **Call school**) · Saving · Error |
| Running late (sheet) | Tell the school the adult will be late | **+10 / +20 / +30 min** | Normal · Goes past the window (off-schedule warning) · Past 7 PM (disabled, with **Call school**) · Saving · Error |
| Who's going (sheet) | Me / saved person / new person | **Confirm** | List · Empty ("No saved people yet") · Adding new (name, phone with +91 keypad, relation; "WhatsApp on a different number" switch; optional email) · Invalid phone or email |
| Trip confirmation | Send the link and show the code | **Send on WhatsApp** (secondary: **Copy link**) | Email sending · Email sent ✓ · Email failed (resend) · Not sent yet (reminder) · Confirmed by the person · Link cancelled or replaced |
| **Live trip** | Uber-style tracking | **Call** (the person) / **Cancel** | LIVE · RECENT · STALE (marker stops and fades, "Last update 3 min ago") · UNAVAILABLE (no map dot; status and timeline only) · Arriving · Handed over · Reached · Cancelled |
| Trip history + replay | Last 30 days, own children only | **Replay** | List · Empty · Replay: slider, gaps shown as gaps |
| **Updates** | Announcements and notifications | Open an item | Unread first · Empty ("You're all caught up") |
| **Messages** | One conversation per child | **Send** | Conversation · Empty · Outside school hours note · Sending · Failed (tap to retry) |
| **Account** | Children, attendance, saved people, notifications, report absence, sign out | — | — |
| Report absence (sheet) | Date(s) and reason | **Report** | Normal · Overlaps a trip already on the way (warning) |

**Live trip layout:** a full-screen map with a glass bottom sheet in three positions.
- *Collapsed:* status, ETA range and freshness.
- *Half (default):* the person card (name, relation, Call), the handoff code, and trip progress (Requested → Ready → On the way → Arriving → Handed over → Reached).
- *Full:* the timestamped timeline.

The map shows the route travelled as a solid line, the remaining route dashed, the destination pin and the person's marker. A **Recenter** button appears after the parent pans the map.

## 3. Third person — `/t/{token}` (standalone page, no bottom navigation)
One screen that changes as the trip progresses. Very little code, fast on any phone, English with large, clear text.

| Step | Shows | Main action |
|---|---|---|
| Invitation | "Pick up **Aarav K.** from Jumpstart Preschool, Karve Road at **1:00 PM**", requested by the parent (first name) | **Confirm** |
| Location explainer | Why location is needed, who sees it, and that it stops when the trip ends | **Allow location** |
| Travelling to school | Map to the school, ETA, "Keep this page open" banner, screen kept awake | (Show code when at the gate) · secondary: **Running late** |
| At the gate | **Large handoff code** | — |
| Travelling home | Map, "Tap when you reach" | **Reached home** |
| Done | "Thank you." The link is now dead | — |

**Error states:**
- *Location denied:* browser-specific steps to allow it, or **Continue without location** (the trip is marked UNAVAILABLE).
- *Link confirmed on another phone:* "This link is already in use on another phone. Ask the parent to send a new link."
- *Link expired or cancelled:* "This trip is no longer active."
- *Offline:* "Reconnecting…", with locations kept and sent once the connection is back.

## 4. Coordinator — `/coordinator` (iPad first; also works on a phone)
Coordinators carry iPads between the gate and the classrooms, so this area is designed for iPad in landscape and portrait, used standing up and one-handed: large rows, big buttons in reach of the thumbs, readable at arm's length.
**Navigation:** a side rail on iPad (Queue · Messages · Account); bottom navigation on a phone. **Floating button:** **+ Log for parent**.

| Screen | Purpose | Main action | States |
|---|---|---|---|
| Start duty | One tap unlocks sound and keeps the screen awake; a checklist confirms the speaker plays, the app is installed to the Home Screen, notifications are allowed and the iPad is charging | **Start duty** | All good · Sound blocked (retry) · Not installed (guide) · Notifications off (guide) · Screen-awake not supported (warning) |
| **Queue** | **Arriving next** (live, sorted by ETA) · **Coming up** (scheduled times) · **Done today**; **My classes / All classes** switch | Each row's next step | Flagged rows at the top (amber) · Running late (with minutes) · Escalated from another class · Stale ETA shown as stale · Empty ("No pickups in the next hour") · Offline (announcements paused, **loud** banner) |
| Trip detail | Map, person, timeline; code entry for a third person, guardian list for a parent | **Enter code → Handed over** / **Confirm guardian → Handed over** / **Check in** | Wrong code (attempts left) · Locked after 3 wrong codes · Guardian list · Waiting for the server |
| Log for parent | Create a trip for a parent who phoned in | **Create** | Validation · Duplicate (open trip already exists) |
| **Messages** | Today's conversations with parents | **Reply** | Same as the parent's Messages screen |

**iPad landscape:** the queue on the left (about 40%), the selected trip's map and details on the right. **iPad portrait and phone:** the queue full width; a trip opens as a sheet.
**Announcements** have a persistent mini-player at the top showing what's being read, with Mute for 5 minutes (the mute time is recorded).

## 5. Core team — `/core` (phone and iPad)
**Bottom navigation:** Today · Schedules · Coordinators · Messages · Announcements

| Screen | Purpose | Main action | States |
|---|---|---|---|
| **Today board** | Every child: expected times, today's changes, status; mark attendance in the same row | Change status (present / absent / on leave / off) | Filter by class · Changes highlighted · Skeleton · Empty (holiday) |
| **Schedules** | Two tabs. **Children:** each child's regular weekday times, picked inside the programme windows. **Programmes:** each programme's days, term, hours and windows (or flexible), drawn on a 9 AM–7 PM timeline | **Save schedule** / **Apply to class** / **Save programme** | Missing schedule (warning badge) · Outside the programme window after a programme change (warning, listed first) · Window outside the programme hours (error) |
| **Coordinators** | Each class with its coordinators (a class with nobody is flagged: its requests go to everyone on duty); the coordinators with their classes. Add a coordinator (pick a person the admin added, then tick classes; warning if they are also a parent), edit classes, remove the role | **Add coordinator** / **Save classes** | Loading · Empty · No classes yet · Access off · Save error · Also a parent (warning) |
| **Messages** | All parent conversations | **Reply** | Unread first |
| **Announcements** | Write and send, with read receipts | **Send** | Draft · Sending · Sent (x of y read) |

## 6. Admin — `/admin` (desktop first, still usable on a phone)
**Desktop:** a sidebar with Dashboard · Live gate · People · Programmes · Schedules · Attendance · Messages · Announcements · Reports · Audit log · Settings.
**Phone:** bottom navigation with Dashboard · People · Reports · More.

| Screen | Purpose | Main action |
|---|---|---|
| **Dashboard** | Today, updated live: attendance totals, trips expected / in progress / done, gate-rush chart by 15-minute slot, running late, flagged requests, open alerts, coordinators on duty | Open an alert |
| Live gate | The coordinator's Queue, read-only unless the admin also holds the Coordinator role | — |
| People | Children · Parents · Staff: search, add, edit, remove or deactivate; CSV upload (upload → preview → errors per row → confirm); assign roles; assign coordinators to classes | **Add** / **Upload CSV** |
| Programmes | Each programme's days, hours, drop-off window and pickup window, drawn on a 9 AM–7 PM timeline; classes in each programme | **Save** |
| Reports | 30-day trends; long-term totals; CSV export | **Export** |
| Audit log | Filter by person, action, child, date | — |
| Settings | Reminder lead time, running-late threshold, 08:00 reminder, wording templates (with preview and **Play**), arrival radius, holidays. School hours (9 AM–7 PM) are shown but fixed | **Save** |

## 7. Shared: login and consent
Phone or email → 6-digit code (auto-filled from SMS or email where the device supports it) → consent (parents, first time) → role home. States: unregistered number, wrong code, code expired (resend available after 30 seconds), too many attempts (locked for 15 minutes).
