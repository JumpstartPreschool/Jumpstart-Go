# Notification architecture

**Status:** built 2026-09-25 (migration `0016`, Edge Function `push-send`, `public/push-sw.js`). PRD D17, D33.

## What is sent, and to whom
| Event | Who hears it | Tag (a newer one replaces the older) |
|---|---|---|
| New request, or a new time, not yet acknowledged | Coordinators of the child's class; every coordinator if nobody covers it (D11) | `trip-<id>` |
| Someone else on the way (the other parent, a logged call, a link sent) | The child's other guardians who chose "when the other parent changes something" | `trip-<id>` |
| Ready at the gate · collected · checked in | All the child's guardians | `trip-<id>` |
| Cancelled by someone else | Other guardians who chose it | `trip-<id>` |
| Handover locked after three wrong codes | The child's guardians and the admins | `lock-<id>` |
| Announcement | Its recipients (all parents or one class, with the app) | `ann-<id>` |
| The school replied in Messages | The child's guardians | `msg-<child>` |
| Absence reported by one parent | Other guardians who chose it | `abs-<child>` |
| 08:00 reminder (D17) | Guardians with it on, per child with school today and not away | `morning-<child>` |

Nobody is told about their own action. Only people on the record, with app access and at least one registered device (a web subscription or a phone token), are queued.

Gate alerts also repeat; see Repeating gate alerts below.

## How it flows
1. Triggers on `trips`, `app.trip_links`, `announcements`, `messages` and `attendance` call `app.notify`, which writes one row per alert and device (web subscription or phone token) to `app.push_outbox` (not readable through the API). Each row has an expiry: 10 minutes for gate alerts (`trip-` and `duty-` tags), an hour for the rest.
2. An insert statement asks `push-send` to run now (`pg_net`, after the transaction commits, so an alert is always persisted before it is dispatched). A job every 10 seconds (`push-flush`, pg_cron 1.5+) catches anything missed and sends retries once their wait is over.
3. `push-send` (secret-checked) claims a batch with `push_claim` (`for update skip locked`, so two runs never send twice; `platform` is `web`, `android` or `ios`), sends each to its device (web with `web-push`; phones through Firebase Cloud Messaging), and records the result with `push_result`. Before claiming it marks rows `expired` (past their expiry), `gone` (device forgotten since) or `skipped closed` (a gate alert whose trip is no longer on the way). A gate alert queued before someone acknowledged the trip is also skipped (unless the collector arrived after that). A failed send is retried on that device only, after 15 s then 30 s, at most 3 tries and only before the expiry. The push service's time to live is what is left of the expiry. A 404 or 410 from the push service deletes that device. A web alert about a trip (`trip-` tag) is held by the push service for 10 minutes at most, any other for an hour.
4. The service worker (`public/push-sw.js`, loaded into the app's worker) shows it and posts a receipt to `push-send/receipt` (`displayed`, and `opened` on a tap). The receipt id travels only inside that device's encrypted push, so no sign-in is needed and it can mark only that row. It also tells any open window to read its data afresh. A gate alert is shown without its own sound only on a device whose duty screen is focused, visible, sound on, and has told the worker it is announcing that very request (`jumpstart-announcing`); everything else always sounds, including tests and `duty-` alerts. A queued alert is never delivered to a device that has since moved to someone else (a shared iPad); that device also starts with no test evidence. A gate alert opens `/coordinator?trip=<id>`; on a duty screen that is already open it selects the request without reloading (a reload would end the duty session). A tap never reloads a duty screen at all: a test alert, an office message or any other page only brings the open window forward, so a test in progress and the duty's sound survive. The receipt endpoint reads at most 1 KB for at most 3 seconds, whether or not the request states its length, since a proxy may forward it without one. Its rate limit (60 a minute per address, per function instance) counts only bad receipts and is checked before the body is read, so junk cannot crowd out real devices that share an address. Only the child's gate team or a Center Leader can report a request as heard (`gate_heard`). A gate alert for an unusual time says "Outside the usual time." and never the parent's reason, because it stays on a shared tablet's lock screen. When the duty screen sees that a request has been handled (closed, cancelled, or acknowledged with no arrival since), it takes that request's alerts off this device's lock screen.
5. The outbox keeps 14 days.

## Devices
- `push_subscriptions`: one row per device, owned by the person signed in on it; a shared iPad moves to whoever signs in.
- Turned on from **Account** (parents), **Start duty** (coordinators) or the account sheet (other staff), always from a tap. iPhone and iPad need the Home Screen app (iOS 16.4+); the switch says so.
- No VAPID key in the build means the switch says notifications aren't set up yet, rather than failing.

- `device_tokens`: one row per phone running the native app (`platform` android or ios), saved with `save_device_token`, moved to whoever signs in on it, removed with `delete_device_token` or when Firebase reports it unregistered (`push_forget_token`). Each person keeps their 10 newest.
- Android phones get a data-only FCM message (`kind`, `tag`, `title`, `body`, `url`, `speak`, `outbox_id`, `expires`, `receipt`, `ack`, high priority, collapse key = tag, 10 minutes to live for a trip). For a gate request it also carries the school's recordings for the duty screen's words at that moment (`clips`: each key and a storage link valid until the alert expires), the chime and the queue place (`_shared/phoneVoice.ts`); a test alert carries the sound check. The app's own service shows it and plays the chime and the school's voice, so the screen can be off ([android-app.md](android-app.md)). `kind` is `gate` only for alerts to the gate team (link `/coordinator`) and silent-device warnings, `test` for test alerts, otherwise `info`: a parent's alert about a trip is never spoken. iOS gets a time-sensitive alert, with `mutable-content` when there are recordings, for the notification service extension to turn them into the alert's sound ([ios-app.md](ios-app.md); not built yet). `push-send` signs into Firebase with the `FCM_SERVICE_ACCOUNT` secret; without it native rows are recorded `skipped no fcm` and not retried, and web delivery carries on.
- Start duty asks the coordinator to turn notifications on first, because a locked screen is reached only by push; a small "Start without notifications" button keeps duty possible.

## Duty: a state the person sets (0061, PRD D62)
Duty is **Active**, **Paused**, or off (no row), kept on the server in `app.gate_duty` and changed only by `set_duty` from an explicit tap: Start duty (after the sound check), Pause duty (optional reason), Resume duty, End duty. Nothing else changes it: not switching apps, locking, the screen timing out, a reload, closing the app, a restart, a lost connection or WebSocket, midnight, or inactivity.

| Fact | Where | Changed by |
|---|---|---|
| Duty: Active / Paused / off | `app.gate_duty.status` (+ `started_at`, `paused_at`, `resumed_at`, `changed_at`, `changed_by`, `change_reason`, `version`); every change in `audit_log` | `set_duty(p_status, p_version, p_reason)`: the person themselves, gate roles only, under a row lock; the same status again is a no-op; an out-of-date `p_version` is refused (`duty_conflict`), so a device that was offline never overwrites a newer change from another device |
| Reachable / can be heard | `app.gate_duty.seen_at`, `audible` | `gate_heartbeat(p_on, p_start)` every 30 s from the duty screen. Never changes duty. Only an app from before 0061 (no `p_start`) starts duty with its first heartbeat; this app passes `p_start => false`, so a device whose duty was ended elsewhere can't restart it |
| Connection (shown on the duty screen) | the device | Online only when the school answered in the last 90 s; Offline, Reconnecting or Checking otherwise ("Duty is unchanged") |
| Alerts (shown on the duty screen) | the device | Ready, Permission required, Temporarily unavailable, Unsupported (from the push state) |

**Root cause of "Resume duty" after every app switch.** The duty screen kept duty in page memory, so every time iOS or Android discarded the backgrounded page (or it reloaded) it opened on Start or Resume duty. On the server, `gate_heartbeat(false)` deleted the duty row whenever the page reported it couldn't be heard (Mute, iOS pausing audio on an app switch, the duty screen closing), rows were purged a day after the last heartbeat, and duty restarted at midnight.

**The app now** reads `my_duty()` on opening and every time it comes back (and every 30 s), and opens straight onto the duty screen when duty is Active or Paused. The last confirmed duty is cached per person, so an app opened offline shows it marked "Last confirmed state, checking…", never as Paused. After a reload, iOS needs one tap before a page may play sound; the duty screen then says "You're on duty, but this device needs one tap to play sound", which is about sound only. A pause or resume made offline is refused with "Your duty hasn't changed", never queued and applied later. Updates of the app wait for a tap while duty is Active or Paused.

**Who is alerted.** Gate alerts go to the child's gate team less anyone who paused (`app.gate_team_for`), unless that leaves nobody. Reminders go to those whose duty is Active (from any day) when there are any. The silent-device warning is for Active duty only. A paused device holds its queue (nothing dropped, nothing played) and stops the Android duty service.

## Repeating gate alerts
- Duty is kept on the server (above); `seen_at` is the 30-second `gate_heartbeat`.
- `app.send_gate_reminders()` runs every minute (job `gate-reminders`). For each open trip today that the gate has not acknowledged (or whose collector arrived after the last acknowledgement), once the latest news is `reminder_min` minutes old (Gate announcement settings: 2, 3 or 5), it sends "Reminder: Arnav, pickup at 4:15 PM" (or "Reminder: Meera has arrived for Arnav") under the trip's tag, so it replaces the earlier alert. At most 30 reminders per cycle; `app.gate_reminders` holds the count. Acknowledging ends the cycle, and a late update or a new arrival starts a fresh count.
- It tells the coordinators and leaders who cover the child and are on duty today; when none of them is on duty, all who cover the child. After two unanswered reminders (one for an arrival or a request outside the usual time) it escalates: everyone who covers the child and every Center Leader, with "Nobody has answered yet."
- Acknowledging ends the cycle. A later "I've arrived" starts a new one.
- `app.alert_silent_duty()` (same job) tells every Center Leader and the person themselves, once, when a device on duty has not checked in for 2 minutes between 08:00 and 19:30: "No signal from Kavita's device. Announcements may not play on it. Open Jumpstart Go on that device." It fires again only when the device came back and went silent again, at most once every 30 minutes per person (a web app on an iPad goes silent whenever its screen locks).

## What is recorded, and what each word means
Six separate facts, never inferred from one another:

| Fact | Where | Set by |
|---|---|---|
| Accepted | `push_outbox.result = 'sent'` | the push service answered 2xx to `push-send` |
| Displayed | `push_outbox.displayed_at` | the device's service worker, after `showNotification` resolved |
| Opened | `push_outbox.opened_at` | the service worker, on a tap |
| Spoken on a phone in the background | `push_outbox.spoken_at`, and `app.gate_heard` for a gate request | the Android app, after it said the alert to its end (school's voice or its own) (0060) |
| Spoken | `app.gate_heard` | the duty screen, after the announcer finished a sentence (not cut off, muted or silent) |
| Acknowledged | `trips.acknowledged_at` | a person tapping Acknowledge |

Displayed means the system was asked to show it; whether it made a sound depends on the device's settings (Silent, Focus, notification settings), which no web page can read. **Who gets alerts** on the duty screen (`gate_delivery_report`, gate team and Head office only) lists gate staff with no device, failures today, and each open request's counts.

## Announce when the screen is off

Start duty has one switch for Center Coordinators and Center Leaders, "Announce when the screen is off" (`ScreenOffSwitch`). On, this device is registered for alerts, and in the Android app the duty service keeps the announcements speaking with the screen off or the app in the background. Off, the device gets no alerts and announcements play only while Jumpstart Go is open on screen. What "on" does depends on the device, and the switch says so:

- **Android app:** speaks every announcement aloud in the school's voice. While the page can play sound, the page speaks it at media volume. When it can't (screen off and the page suspended or silenced), the phone plays the same chime and the same Azure recording itself at full alarm volume, even in silent mode, ducking other sound, then puts the alarm volume back; only if the recording can't be fetched in time does the phone's own en-IN voice read the alert. The page tells the phone it is speaking (`nativeAlive`) only while its sound really plays, so a running but silenced page never stops the phone's voice.
- **iPhone and iPad (Home Screen app):** an alert with the notification sound. iOS gives a web app no way to speak while locked; the full announcement plays when the alert is opened.
- **Other browsers:** an alert with the notification sound and vibration.

A deliberate Off is remembered on the device (`pushTurnedOff`), so Start duty stops asking for notifications. Signing out clears it, so the next person on a shared phone starts with alerts on. A device that is off appears in the delivery report without a device, and unanswered requests escalate to the others as usual.

## Device readiness
Start duty (once notifications are on) and **Who gets alerts** show this device's state: Ready, Setup required, Notifications blocked, Unsupported or Needs attention (`readiness.ts`). Ready needs evidence from the last 7 days: this device displayed a test alert, and the person said they heard it. Permission and a saved subscription alone are Needs attention.

**Send a test alert** (`send_test_push`, staff only, one a minute) queues a real alert to all the person's devices, sent 10 seconds later so the screen can be locked first. The panel follows this device's own row (`test_push_status`): accepted, then displayed. The person then answers "Did you hear its sound?" (`confirm_test_heard`, only within 10 minutes of a displayed test on that device). The report lists each web device's last test, whether it was heard and its last displayed alert. The Android app reports `displayed` and `spoken` (0060), and its test alert plays the school's sound check through the background path; its readiness is still confirmed by ear.

## What a web app can and cannot do
- **Open, sound on (after Start duty):** the announcer speaks every request in the school's voice. Reminders and new stages repeat until acknowledged.
- **Backgrounded, locked or closed:** the operating system suspends the page, so nothing can be spoken. A push still shows on the lock screen with the system's notification sound when notifications are allowed (iPhone and iPad: the Home Screen app, iOS 16.4 or later).
- **Tapped notification:** the app opens at the request. Browsers do not count a notification tap as permission to play sound, so iPad and iPhone show "Tap here to turn announcements back on" (or Resume duty if the app was closed). One tap brings the voice back, and every unacknowledged request plays again.
- **Silent mode, Focus, Do Not Disturb:** the operating system decides whether a push makes a sound. Time-sensitive alerts and critical alerts are not available to web push.
- **Offline:** pushes wait at the push service until the expiry; the outbox retries failed sends; on reconnect the duty screen reads today's trips afresh and announces what is still open.

## Physical-device verification matrix
Nothing below has been run on a device yet. Mark a cell only after running it on that device.

| Test | iPhone PWA | iPad PWA | Android phone PWA | Android tablet PWA | Desktop browser |
|---|---|---|---|---|---|
| 1. Foreground, screen on: voice within 3 s, full sentence | not run | not run | not run | not run | not run |
| 2. Background, screen on: banner with sound | not run | not run | not run | not run | not run |
| 3. Locked: lock-screen alert with sound | not run | not run | not run | not run | n/a |
| 4. App closed normally: alert arrives | not run | not run | not run | not run | not run |
| 5. Tap alert: opens the request, duty kept, voice after one tap | not run | not run | not run | not run | not run |
| 6. Offline 2 min, reconnect: missed requests announced | not run | not run | not run | not run | not run |
| 7. Notifications denied: Blocked state, steps shown | not run | not run | not run | not run | not run |
| 8. Silent mode: note what is heard | not run | not run | not run | not run | n/a |
| 9. Focus / Do Not Disturb: note what is heard | not run | not run | not run | not run | not run |
| 10. Battery saver / restricted | n/a | n/a | not run | not run | n/a |
| 11. Two devices, one account: each gets it once | not run | not run | not run | not run | not run |
| 12. Three pickups at once: one voice at a time, urgent first | not run | not run | not run | not run | not run |
| 13. Cancelled before delivery: no gate alert | not run | not run | not run | not run | not run |
| 14. End duty, start again: no stale or doubled speech | not run | not run | not run | not run | not run |
| 15. New version deployed while on duty: no reload mid-duty, alerts keep coming | not run | not run | not run | not run | not run |
| Test alert: Ready reached | not run | not run | not run | not run | not run |

Force-stop (Android Settings, Force stop) is not the same as closing the app: Chrome then receives no push until it is opened again. Closing from the app switcher is a normal close.

## Privacy
Lock-screen text names the child's first name only (never the surname) and a time, never a location. The morning reminder and "other parent" alerts can be turned off per person. Provider: the browser's own push service; no third-party messaging account.
