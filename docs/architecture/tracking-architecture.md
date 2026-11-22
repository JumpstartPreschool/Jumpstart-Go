# Tracking Architecture — Release 1 (Stage 3)

> **Who shares and who sees (PRD D38, migration 0024):** only someone collecting with a one-time link shares their location, if they agree, and only the parent who sent the link sees it. Parents and family never share; the school and the gate never see location. Where this document describes parents sharing or the gate seeing a position, D38 applies instead.

**Status:** Draft for owner review (2026-09-24) · Covers trip states, location collection and checks, freshness, ETA, arrival detection, "get ready" and running-late timing, live delivery, replay, privacy and failure handling.

Related: [prd.md](../product/prd.md) (D2, D4, D8, D12–D14, D19–D21) · [requirements.md](../product/requirements.md) (TRIP, TRK, ANN) · [user-journeys.md](../product/user-journeys.md)

Provider choices (map tiles, routing, real-time transport) are **provisional** here and are decided in `system-architecture.md` and `docs/infrastructure/services.md`. Everything in this document works through the interfaces in §11, so any provider can be swapped.

## 1. Principles
1. **The handover check is the safety control; GPS is supporting information.** A lost or wrong location never blocks or authorises a handover.
2. **Honest data.** Every position shows its age. A position is never extrapolated, predicted or animated beyond the last real point.
3. **One source of truth.** The server computes trip state, ETA, lateness and arrival. The parent, coordinator and admin screens show the same numbers.
4. **Minimum collection.** Location is collected only from the adult travelling, only during an active trip, only after they allow it, and it stops automatically.

## 2. Trip model
A **trip** is one child, one direction (drop-off or pickup), one school day. The database allows at most one open trip per child per direction per day (TRIP-1).

Each trip carries:
- **status**, the traveller's progress (§3);
- **readiness**, set by the school (`not_ready` → `ready`), pickup only;
- **flags:** `short_notice`, `off_schedule` (with reason), `acknowledged_by/at`, `late_band` (0, 10, 20… minutes), `entered_by` (staff on a parent's behalf);
- **scheduled_time** (from the regular times, replaced by today's change);
- **traveller:** a guardian (default) or a third person (name, phone, relation, optional WhatsApp number);
- **tracking_source:** `none`, `guardian_app`, `third_person_link`;
- **version** (a number used for optimistic locking; a write with an old version is rejected and the screen refreshes).

## 3. Trip states

### Pickup
```
EXPECTED ──(third person chosen)──▶ INVITED ──(Confirm on link)──▶ CONFIRMED
   │                                   │                              │
   │(guardian shares location)         │                              │(Start trip)
   ▼                                   ▼                              ▼
EN_ROUTE ◀──────────────────────────────────────────────────────── EN_ROUTE
   │(inside the arrival radius)
   ▼
ARRIVING ──(code entered / guardian confirmed)──▶ HANDED_OVER ──▶ HOME_BOUND ──▶ CLOSED
Any state before HANDED_OVER ──(parent or staff cancels)──▶ CANCELLED
```

| From | To | Who | Server rule |
|---|---|---|---|
| — | EXPECTED | System (00:05 job), parent ("Pickup now"), staff (on a parent's behalf) | Inside school hours 09:00–19:00; reason required outside the programme window; one open trip per child and direction |
| EXPECTED | INVITED | Parent | Creates the link token and handoff code |
| INVITED | INVITED | Parent (replace link / change person) | Old token and code revoked at once; new ones issued |
| INVITED | CONFIRMED | Third person (Confirm) | Token valid; binds the link to this device (§4.1) |
| EXPECTED, CONFIRMED | EN_ROUTE | Traveller (Start trip, or guardian turns sharing on) | Location permission granted, or the trip continues as UNAVAILABLE |
| EXPECTED … ARRIVING | ARRIVING | System | Arrival rule (§7); skipped when there's no tracking |
| EXPECTED … ARRIVING | HANDED_OVER | Coordinator, admin | Third person: correct code (3 attempts, then locked and parent + admin alerted). Guardian: a registered guardian chosen from the child's list. Waits for the server before showing success |
| HANDED_OVER | HOME_BOUND | System | Immediately when tracking is active; otherwise HANDED_OVER → CLOSED |
| HOME_BOUND | CLOSED | Traveller (Reached home), parent (Received), system (home location reached, or 60 min after handover) | Tracking stops; link dies |
| Any before HANDED_OVER | CANCELLED | Parent, core team, admin | Announced at once; link dies |

**Readiness** is independent of the traveller: a coordinator can mark **Ready** from EXPECTED onwards, and the parent is notified.

### Drop-off
`EXPECTED → (INVITED → CONFIRMED) → EN_ROUTE → ARRIVING → CHECKED_IN (closed)`, or `CANCELLED`. "Absent today" from the parent cancels the trip with the reason `absent` and sets attendance to absent. No handoff code; tracking stops at check-in.

Every transition writes a **trip event** (who, role, when, from which device/IP, old → new) that feeds the timeline (§9) and the audit log. Every command carries an **idempotency key**, so a double tap or a retry never applies twice (TRIP-10).

## 4. Collecting location

### 4.1 Who sends it
| Traveller | How | Authentication |
|---|---|---|
| Guardian | Parent app, **Share my location** switch on the trip | Parent session; the user must be the trip's traveller |
| Third person | `/t/{token}` page | The link token **plus a device key** created when they tap Confirm. The device key is a random secret kept in that browser's storage and sent with every request. Another phone with the same link gets "already in use" (TRIP-4) |

Opening the link (a GET) never changes anything, so WhatsApp link previews can't lock or use it.

### 4.2 On the phone
- `navigator.geolocation.watchPosition` with high accuracy, `maximumAge: 0`, `timeout: 20 s`.
- **Send rate:** a point when the person has moved 10 m or more, at most one every 5 s; and at least one every 10 s while still, so a waiting person stays LIVE.
- **Screen Wake Lock** while the trip page is open, with a "keep this page open" banner. When the page is hidden, the browser stops sending locations; when it is visible again, a fresh fix is sent at once.
- **Offline:** points are kept in the page (and in IndexedDB, so a reload doesn't lose them) and sent in batches of up to 50 when the connection returns. Buffered points fill in the route history; they never make the marker look LIVE (§6).
- **Permission denied:** browser-specific steps to allow it, or **Continue without location**, which sets tracking to UNAVAILABLE. The trip and the handover still work.

### 4.3 Server checks on every point (TRK-2)
| Check | Rule | On failure |
|---|---|---|
| Trip and sender | Trip is in a tracking state (CONFIRMED to HOME_BOUND, or drop-off before CHECKED_IN); the sender is the trip's traveller | Reject (403/404, never revealing whether the trip exists) |
| Shape | Latitude −90…90, longitude −180…180, accuracy > 0 | Reject |
| Accuracy | ≤ 100 m: normal. 100–500 m: stored as **coarse**, shown with an accuracy ring, never used for ETA, arrival or home detection. > 500 m | Reject |
| Time | Fix time no more than 30 s ahead of the server clock and not before the trip started. Points older than 2 min on arrival are **backfill** (history only) | Reject future and pre-trip points |
| Speed | Distance from the last accepted point, minus both accuracies, divided by the time between them, must be ≤ 33 m/s (120 km/h) | Reject as implausible. After 5 rejections in a row, accept the next good-accuracy point as a new anchor and log a "position jump" event, so one bad point can't block the whole trip |
| Rate | Average ≤ 1 point per 2 s per trip; ≤ 50 points per batch | 429; the phone backs off |

Accepted points are stored with `fix_at` (from the phone), `received_at` (server), latitude, longitude, accuracy, and optional speed and heading.

## 5. Delivering updates live
- The server **pushes** updates over one real-time connection per screen (WebSocket or server-sent events, decided in `system-architecture.md`), with a target of < 2 s from phone to viewer at p95 (NFR-2).
- **Channels** and who may join, checked by the server when a screen subscribes:
  - `trip:{id}` for the child's guardians, the traveller, and staff with access to the child **until handover**. After HANDED_OVER the server stops sending positions to staff; it isn't only hidden in the screen (TRK-9).
  - `gate:{branch}` for on-duty coordinators and the admin: queue changes and announcements.
- **Message:** trip id, latitude, longitude, accuracy, `fix_at`, `server_now`, ETA low/high, status, readiness, flags, version. No names or phone numbers in position messages.
- If the connection drops, the screen reconnects with backoff and fetches the current state before applying new updates, so nothing is missed or applied out of order (the version decides).

## 6. Freshness (TRK-3)
`age = now − min(fix_at, received_at)` for the newest point that isn't backfill. Using the earlier of the two times means a phone with a wrong clock can't make a position look newer than it is. Screens keep their clock in step using `server_now`, and recompute the label every second without waiting for new data.

| Label | Rule | Marker | ETA |
|---|---|---|---|
| **LIVE** | age < 15 s | Glides from the previous point to the new one over up to 5 s; never beyond the latest real point. With reduced motion: jumps | Shown |
| **RECENT** | 15–60 s | Stops; "Updated 32 s ago" | Shown |
| **STALE** | > 60 s | Stops, muted grey, "Last update 3 min ago" | **Hidden** |
| **UNAVAILABLE** | Permission denied, no point yet, tracking not used, or tracking stopped | No marker; status and timeline only | Hidden |

Freshness is shown with a colour **and** an icon and text everywhere (parent map, queue rows, admin dashboard).

## 7. Arrival and reached-home detection
- **School:** 18.50885, 73.83280 (11/7 Matoshri, Karve Road, Erandwane). **Arriving** when two accepted points in a row are inside the arrival radius (default 200 m, set by the admin), or one point inside half the radius, using only points with accuracy ≤ 100 m. Once ARRIVING, a trip never goes back; coordinators hear "Aarav's pickup is arriving."
- **Home** (only when the parent who arranged the trip has saved a home location, TRK-8): during HOME_BOUND, two points in a row within 100 m of home close the trip as "Reached home (detected)".
- **Hard stop:** tracking ends 60 minutes after handover at the latest (TRK-7).

## 8. ETA (D12, TRK-5)
- **Route:** from the traveller's position to the school (before handover) or to the saved home (after it), through the `RoutingProvider` interface (§11). Worked out when tracking starts, and again only when the person is more than 100 m off the route for two points in a row, at most once a minute. For 50 children that's a few hundred route requests a day, inside any free plan. Provisional provider: OpenRouteService's free plan, or OSRM self-hosted with the Maharashtra map extract if free limits or terms don't fit.
- **Between route requests:** the position is matched to the route line, and the remaining time is the route's time for the part still to go.
- **Range:** low = remaining × 1.0, high = remaining × 1.5 (Pune traffic without live data), rounded to whole minutes, at least 2 minutes wide. Shown as "about 10–15 min". Under 2 minutes: "Arriving now". Each trip stores predicted and actual arrival so the two multipliers can be adjusted after the first weeks; the adjustment is proposed with evidence, never applied automatically.
- **Labelled** "Estimate · no live traffic". Hidden when STALE, UNAVAILABLE or coarse.

## 9. Timeline and replay (TRK-4)
- **Timeline:** trip events in order with their times (Requested, Link sent, Confirmed, Started, Ready, Arriving, Running late 10 min, Handed over to Ramesh at 1:01 PM, Reached home), plus tracking events (Location off, Updates stopped, Position jump).
- **Replay:** points ordered by `fix_at`; a gap of more than 60 s between points breaks the line and is labelled with its length. There is never a straight line drawn through a gap.
- **Who sees what:** guardians see the whole trip; coordinators see today's trips up to handover; core team and admin see up to handover for 30 days; the admin can open the part after handover only by entering a reason, which is audit-logged (TRK-9).

## 10. Timed rules
One job runner checks timers every 30 seconds and also reacts to each ETA update. Every rule fires **at most once per trip per step** (stored as a keyed trip event), so running it twice never repeats an alert.

| Rule | When | Who is told |
|---|---|---|
| Create the day's trips | 00:05 school days (D13) | — |
| Schedule reminder | 08:00 school days (D17) | Parent (unless switched off) |
| **Get ready** (D14) | The first of: scheduled time − lead time (default 10 min); ETA low end ≤ lead time; or straight away if the request is made inside the lead time | Coordinators of the child's class |
| Flag not acknowledged | 5 min (TRIP-6); escalation to all on-duty coordinators after 2 min (D11) | Coordinators, then admin |
| **Running late, live** (D20) | Projected arrival (now + ETA low end) is at least the late threshold (default 10 min) past the scheduled time, held for two ETA updates in a row (at least 30 s) so it doesn't flicker; announced again at each further 10 minutes | Coordinators; the parent too when a third person is late |
| **Running late, silent** | Scheduled time + threshold passes: not arrived, no LIVE or RECENT location | Coordinators; parent gets "Are you on the way?" |
| Parent's **Running late** | Immediately; moves the scheduled time and resets the late band | Coordinators |
| Link not confirmed | 10 min after sending | Parent (with Resend) |
| Tracking stale | 5 min STALE during an active trip | Parent and coordinators |
| Not closed | 30 min after the expected arrival | Parent |
| Drop-off not checked in | Scheduled time + threshold | Parent ("Running late / Absent today") |
| End of day | Drop-offs open at 14:30, pickups open at 19:30 | Admin |
| Link expiry | 19:00 if not started; otherwise at close or 60 min after handover | — |

Announcement delivery (chime, speech queue, repeats, escalation, web push) is specified in `notification-architecture.md`.

## 11. Interfaces (replaceable providers)
```ts
interface RoutingProvider { route(from: LatLng, to: LatLng): Promise<{ line: LatLng[]; distanceM: number; durationS: number }> }
interface MapTiles        { styleUrl(theme: 'light' | 'dark'): string }         // provisional: MapLibre GL with free vector tiles
interface RealtimeBus     { publish(channel: string, msg: unknown): Promise<void> }
interface LinkMailer      { sendTripLink(to: string, link: string, trip: TripSummary): Promise<'sent' | 'failed'> }
```
The WhatsApp link needs no provider: it is a `https://wa.me/<number>?text=<message>` link opened on the parent's phone.

## 12. Storage and retention (D9)
| Data | Kept | Removed by |
|---|---|---|
| Location points | 30 days | Daily job |
| Trip events and trips | 30 days (anonymous daily totals kept for trends) | Daily job |
| Handoff code | Stored encrypted; shown only to the parent and the link holder; cleared at close | Trip close |
| Link token | Stored hashed; device key stored hashed | Trip close / expiry |
| Saved home location | Until the parent deletes it or leaves the school; visible only to that parent | Parent / account removal |

A 4-digit code can't be protected by hashing (it can be guessed offline), so its protection is encryption at rest plus the server's 3-attempt limit.

## 13. Development mode
A **simulated traveller** (a scripted route) exists only in development builds, is labelled **SIMULATED** on every screen, and is rejected by the production server (TRK points carry their source, and `simulated` is refused outside development) (NFR-7).

## 14. Failure handling
| Situation | What happens |
|---|---|
| Third person locks the phone or switches app | Updates stop → RECENT → STALE; after 5 min parent and coordinators alerted; the handover still works with the code |
| No signal on the way | Points buffered and sent later; the marker shows STALE meanwhile; the replay fills in with backfill points |
| Wrong phone clock | Freshness uses the earlier of phone and server time; future points rejected |
| GPS jump (tunnel, tall buildings) | Speed check rejects it; re-anchors after 5 in a row |
| Routing provider down | ETA hidden with "ETA unavailable"; tracking, freshness, arrival and handover unaffected |
| Real-time connection drops | Screen shows the offline banner, reconnects, reloads the current state; iPad announcements paused with a loud banner |
| Link forwarded to someone else | Only the phone that confirmed can use it; the code is still needed at the gate |
| Wrong code entered 3 times | Handover locked; parent and admin alerted; the admin can unlock with a reason, which is audit-logged |

## 15. Admin settings vs fixed values
- **Admin sets:** arrival radius (200 m), "get ready" lead time (10 min), running-late threshold (10 min).
- **Fixed in code** (changing them needs a documented reason): school hours 09:00–19:00, freshness thresholds 15 s / 60 s, speed limit 120 km/h, accuracy limits 100 m / 500 m, 3 code attempts, tracking hard stop 60 min after handover, 30-day retention.
