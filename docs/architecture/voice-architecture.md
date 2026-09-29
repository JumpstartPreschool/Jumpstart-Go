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

| When | Message (pickup; drop-off names the child only and skips "Please get … ready.") |
|---|---|
| Parent taps "On my way" | "Vihaan Kulkarni's father is on the way for pickup. Please get Vihaan ready." |
| About 12 to 7 minutes before the chosen time | "Vihaan Kulkarni's father will arrive for pickup in about ten minutes. Please get Vihaan ready." |
| 7 minutes or less | "… will arrive for pickup in about five minutes. …" |
| Parent taps "I've arrived", or the collector taps "I'm at the gate" on their link (0036) | "Vihaan Kulkarni's father has arrived for pickup. Please get Vihaan ready." (a collector is "pickup person") |
| Cancelled | "Pickup for Vihaan Kulkarni is cancelled." |

Openings: "New announcement." / "Urgent new announcement." (outside the child's window, within five minutes, or arrived) / "This is a reminder." (every 2 minutes until someone taps Seen). The relation comes from the trip ("mother", "grandmother"); someone with a one-time link, or with no relation on record, is "pickup person". The class, the time and any reason stay on screen and are never spoken, so every message can be made ahead. The phase is worked out from the parent's chosen time each time the gate looks (`phaseOf`), so after a reconnect the gate says where the trip is now, never a backlog. Programme windows and times are unchanged.

## How it works

```text
Admin adds a child, changes a name, relation or pronunciation ─► 0030 triggers queue the child ─► minute job (pg_cron + pg_net)
  ─► pronounce drain ─► voice_count (cap) ─► AzureSpeechProvider ─► MP3 in voice-audio/sentences/<sha256(version + words)>.mp3

Parent taps "On my way" / "I've arrived" ─► start_trip / arrive_trip (server checks the family) ─► Realtime ─► gate iPad
  ─► announcer (urgent first, one at a time, no duplicates) ─► prepare() before the chime ─► memory → iPad cache → store
  ─► chime ─► opening + message
```

1. **Made ahead, never during a tap.** `childMessages()` lists every recording a child can need: each phase of pickup for each relation on their record and for a pickup person, each phase of drop-off, and both cancellations (about 18 clips a child). The same `message()` builds the gate's words, and a test checks every gate announcement is in that list (`announce.test.ts`).
2. **Version.** `voiceVersion(voice)` = provider, voice (`AZURE_SPEECH_VOICE`), audio format and `WORDING_VERSION`. A new voice or new wording requeues every child once; the pronounce function publishes the version in `voice_meta` once the openings exist, and iPads read it with `voice_version()`. Clip keys include it, so an old clip is never played in a new voice, and iPads delete old versions on Start duty.
3. **The iPad** (`voiceClips.ts`): on duty it copies every child's clips from the store to Cache Storage (`warmClips`, never makes one). A clip is looked for in memory, then the iPad's cache, then the store; only a sentence nobody made ahead (a relation added today) is made live through `pronounce`, capped.
4. **Playback** (`sound.ts`): the opening plays as soon as it's ready after the chime; the message follows after a 150 ms pause. Whichever isn't ready within 300 ms is said by the iPad's own Indian English voice (a woman's voice first). Mute, End duty and acknowledging stop everything at once.
5. **Pronunciation**: `child_pronunciations.spoken_name`, written the way it sounds ("Aa-raadh-ya Sharma"), previewed live and approved by the admin or head office; coordinators listen. Applied only within that child's announcements. The registered name never changes; a new registered name clears the pronunciation. Status on the child's page: Ready, Getting ready, or Couldn't be made with Regenerate.
6. **Bluetooth**: iPadOS sends all sound to a connected speaker. The duty bar's Speaker button opens Apple's own speaker list and plays a test.

## Cost (Azure Free F0)

- Free F0 includes 0.5 million neural characters a month ([pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/), checked 2026-09-29). The database stops at **450,000** (`voice_count`, `voice_usage`) before Azure is called; the minute job stops and carries on next month.
- One child's clips: about 18 × 85 characters ≈ 1,500. Fifty children ≈ 75,000 once, then only when something changes. Previews and live sentences add a little. Admins can read `voice_usage` and `voice_usage_days`.
- Never made on: a tap, page load, reconnect, playback, or reading a clip. Only the minute job (queued children) and staff previews.

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
