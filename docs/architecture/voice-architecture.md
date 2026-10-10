# Gate voice: Azure AI Speech, made ahead

Status: **built, not yet deployed** (2026-09-29, D50). Needs the owner's Azure Speech resource (see environments.md).

## Functional DAG

```text
 INPUTS                        BUILD                                        INTEGRATE                           VERIFY
 ───────────────────────────   ──────────────────────────────────────────   ─────────────────────────────────   ─────────────────────
 Microsoft docs (2026-09-29) ─► _shared/tts.ts: TTSProvider,              ─┐
                               AzureSpeechProvider (escaped SSML)          │
 owner's wording ────────────► _shared/announce.ts: templates, phases,   ─┼─► pronounce: minute job makes each ─┐
                               childMessages (everything made ahead)       │   child's clips into voice-audio    │
 0030 queue + bucket ────────► 0035: cap, voice_version, arrive_trip     ─┘   (voice_claim / voice_finish)      ├─► npm test
 trips + Realtime ───────────► gate.ts: phaseOf, spokenText ─────────────► GateQueue: warm clips on duty,  ────┤   npm run test:db
                                                                           announce each phase ─► announcer ──┘   deno check
```

## What the gate says

Every announcement is an opening, then one message (templates in `_shared/announce.ts`, owner's wording 2026-09-29):

The wording, openings and timings are the admin's (Admin → Settings → Gate announcements, 0042, PRD D53); these are the defaults.

| When | The gate hears |
|---|---|
| Parent taps "On my way" (15 min) | "New announcement. Vihaan Kulkarni's father will arrive for pickup in about fifteen minutes. Please get Vihaan ready." |
| Each reminder (every 2 min until acknowledged) | "This is a reminder. … in about ten minutes. …", with the time left at that moment |
| Get ready (10 min) and urgent (5 min) | A new announcement at each; urgent says "Urgent new announcement." and plays first |
| The time comes with no arrival | "… will arrive for pickup any moment now. …" |
| Parent taps "I've arrived", or the collector taps "I'm at the gate" (0036) | "Urgent new announcement. Vihaan Kulkarni's father has arrived for pickup. …", even after an acknowledgement |
| Parent taps Running late (0043, D54) | "Pickup update. Vihaan Kulkarni's father is running late and will arrive in about ten minutes.", once and at once; reminders after it use the new time; the parent's note is shown, never spoken |
| Cancelled | "Pickup for Vihaan Kulkarni is cancelled.", once |

**The ETA rule** (`etaOf`, one function): from `arrive_at − now`. Within a minute or past it, "any moment now"; up to about an hour, the nearest of 2, 5, 10, 15, 20, 25, 30, 45 and 60 minutes (13 is about fifteen, 6 about five); further out, the clock time in India time ("at about two twenty two in the afternoon"). The stage (`stageOf`: far, early, get ready, urgent, due, arrived) comes from the same timestamps and the admin's timings, worked out afresh on every pass, so a new time (running late, change time) replaces everything queued and a reconnect hears where the trip is now. The relation comes from the trip; a one-time collector is "pickup person". The class, phone numbers, codes, location and any reason stay on screen.

**Queue order** (fixed, not the admin's): arrived, then urgent or due, then running late, then outside the usual time, then the rest; every reminder after every new announcement; the earliest arrival first within a priority.

## How it works

```text
Admin adds a child, changes a name, relation or pronunciation ─► 0030 triggers queue the child ─► minute job (pg_cron + pg_net)
  ─► pronounce drain ─► voice_count (cap) ─► AzureSpeechProvider ─► MP3 in voice-audio/sentences/<sha256(version + words)>.mp3

Parent taps "On my way" / "I've arrived" ─► start_trip / arrive_trip (server checks the family) ─► Realtime ─► gate iPad
  ─► announcer (urgent first, one at a time, no duplicates) ─► prepare() before the chime ─► memory → iPad cache → store
  ─► chime ─► opening + message
```

1. **Made ahead, never during a tap.** `childMessages()` (`_shared/gateAnnounce.ts`) lists the recordings a child is likely to need from the admin's settings: for each relation on their record and a pickup person, 2, 5, 10 and 15 minutes, any moment now and arrived; the same for drop-off; and both cancellations (about 32 clips a child with the defaults). The same `messageFor()` builds the gate's words, and a test checks that every sentence the 5, 10 and 15 minute buttons can produce, at any moment of the trip, is in that list (`announce.test.ts`). Rarer times (20 minutes and up, or a template with a clock time) are made live the first time, ahead of the reminder that needs them (`warm`), and kept. A saved change to the wording requeues every child; only sentences whose words changed are new clips.
2. **Version.** `voiceVersion(voice)` = provider, voice (`AZURE_SPEECH_VOICE`), audio format and `WORDING_VERSION`. A new voice or new wording requeues every child once; the pronounce function publishes the version in `voice_meta` once the openings exist, and iPads read it with `voice_version()`. Clip keys include it, so an old clip is never played in a new voice, and iPads delete old versions on Start duty.
3. **The iPad** (`voiceClips.ts`): on duty it copies every child's clips from the store to Cache Storage (`warmClips`, never makes one). A clip is looked for in memory, then the iPad's cache, then the store; only a sentence nobody made ahead (a relation added today) is made live through `pronounce`, capped.
4. **Playback** (`sound.ts`): the opening plays as soon as it's ready after the chime; the message follows after a 150 ms pause. Whichever isn't ready within 2.5 s (8 s for the sound check) is said by the device's own voice. Mute, End duty and acknowledging stop everything at once; a trip re-announced while it is being said (a new time or stage) waits for the sentence to finish and plays straight after, never cutting it.
5. **The device's voice is always a woman's** (`pickFallbackVoice`, 2026-10-04): an Indian English woman's voice first (Isha, Veena, Heera, Neerja…), else another English woman's voice known by name (Karen, Samantha, Google UK English Female, Zira…), never a man's or an unknown voice (browsers don't say a voice's gender). With none, it logs `device-voice-unavailable` and the screen shows the announcement. Before this, only Indian women's voices were allowed, so on most Macs, on Windows without Heera and on iPads without Isha (whose only Indian voice, Rishi, is a man's) a clip that wasn't ready meant silence. The silent unlock word said at Start duty ("Ready.") uses the same voice: iPhone and iPad ignore its volume, and with no voice chosen an Indian iPad said it aloud in Rishi's voice.
6. **Log** (every build, browser console, `[voice]`): `version`, `clip-loaded` / `clip-made` / `clip-ready` / `clip-failed`, `playback-start` / `playback-end` / `playback-cut`, `school-voice-not-ready`, `audio-paused`, `device-voice-start` / `-end` / `-failed` / `-not-preferred` / `-unavailable`. Stages, sizes and seconds only, never the words or a name.
7. **The sound check** (Start duty, Play a test on the duty bar, and the Speaker sheet) goes through exactly this path, so it hears what announcements will. It waits for the clips' voice version before looking for its clip, so it plays the school's stored recording instead of having a new one made each time.
8. **Pronunciation**: `child_pronunciations.spoken_name`, written the way it sounds ("Aa-raadh-ya Sharma"), previewed live and approved by the admin or head office; coordinators listen. Applied only within that child's announcements. The registered name never changes; a new registered name clears the pronunciation. Status on the child's page: Ready, Getting ready, or Couldn't be made with Regenerate.
9. **Bluetooth**: iPadOS sends all sound to a connected speaker. The duty bar's Speaker button opens Apple's own speaker list and plays a test.

## Cost (Azure Free F0)

- Free F0 includes 0.5 million neural characters a month ([pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/), checked 2026-09-29). The database stops at **450,000** (`voice_count`, `voice_usage`) before Azure is called; the minute job stops and carries on next month.
- One child's clips: about 32 × 85 characters ≈ 2,700. Fifty children ≈ 136,000 once, then only when something changes. A change to one wording re-records only that wording's sentences (roughly a fifth to a third of that). Previews and live sentences add a little. Admins can read `voice_usage` and `voice_usage_days`.
- Never made on a page load, reconnect, playback or reading a clip. Made by the minute job (queued children), staff previews (Play preview in Settings), and once for a rarer arrival time on the gate.

## Security

- `AZURE_SPEECH_KEY` and the region are Supabase function secrets; the key goes in the `Ocp-Apim-Subscription-Key` header, never a URL, log or browser. Settings are checked when the function starts (a malformed voice or region is refused).
- SSML: the voice name and text are XML-escaped (`xmlText`), and text must pass `checkSpeech` (letters, marks, digits, spaces and pauses only). A test injects `<break>` tags and quotes and checks they arrive escaped.
- `arrive_trip`: the child's family or the school only, open trips only, once. `voice_spend`: staff only, 300 an hour. `voice_count`, `voice_claim`, `voice_finish`: service role only. `set_child_pronunciation`: admin and head office, rate-limited, audit-logged.
- What Microsoft receives and why that's acceptable: [data-protection.md](../security/data-protection.md).

## Measured

Lag test page `/scripts/qa/voice-lag/` (dev server) runs real announcements through the app's code. 2026-09-29, Chrome, clips arriving 900 ms after the request: speech 0–1 ms after the chime, message 150–152 ms after the opening, 8 of 8. At 1,500 ms the iPad's voice took over 301 ms after the chime. With clips made ahead and kept on the iPad the wait is only decoding. **Not yet measured**: a real iPad with real Azure clips.

## Limitations

- The voice isn't chosen by ear yet: default `en-IN-NeerjaNeural`; Aarti, Aashi, Ananya and Kavya are the other en-IN female voices.
- Until the minute job has made a new child's clips (a minute or two), their first announcement is made live or said by the iPad's voice.
- The school computer's voice (tts-service) keeps serving the gate until this is deployed; stop it afterwards.
