# Gate voice: self-hosted Indian pronunciation

Status: **built** (2026-09-27, D48). Replaces D32 and D43, and the voice part of D47.

## Functional DAG

```text
 INPUTS                    BUILD                                        INTEGRATE                          VERIFY
 ───────────────────────   ──────────────────────────────────────────   ────────────────────────────────   ──────────────────────
 old voice code ─────────► removed: voice-say (Azure/ElevenLabs),     ─┐
                           Kokoro, voice picker, word list             │
 AI4Bharat model ────────► tts-service/ (FastAPI, loaded once,        ─┤
 (gated, Apache-2.0)       one sentence at a time, shared secret)      │
 children table ─────────► 0030: child_pronunciations, claim/finish,  ─┼─► pronounce function: staff clips, ─┐
                           voice-audio bucket, minute job              │   background drain, time budget     │
 gate.ts sentences ──────► _shared/announce.ts: one sentence builder, ─┘                                     ├─► npm test (107)
                           pronunciation, clip keys                    ┌─► sound.ts + voiceClips.ts: cached, ─┤   npm run test:db
                                                                       │   1.2 s budget, silent on Stop       │   pytest (15)
                                                                       └─► PronunciationCard + Settings list ─┘   qa_names.py (listened)
```

## Decisions (owner, 2026-09-27)

| Question | Decision |
|---|---|
| Where the model runs | An always-on school computer, reached through a free Cloudflare Tunnel. ₹0 per announcement; the computer's electricity and upkeep are the real cost. |
| What the gate says | Today's full sentence (gate.ts `spokenText`), unchanged. |
| When audio is missing | The tablet's own Indian English voice for that announcement, with no picker. Without one, the chime and the screen. |
| Who edits and approves | Admin and head office. Center leaders hear the result at the gate. |

## How it works

```text
Parent taps "On my way" ─► trip row ─► Realtime ─► gate tablet queue ─► chime (0.9 s) ─► speech
                                                            │                    ▲
                                    clips requested at once ┘                    │ from, fastest first:
                                                                                 │ memory → tablet cache → Storage
Admin adds or renames a child ─► 0030 trigger ─► pending ─► minute job ─► pronounce ─► school computer ─► Storage
```

1. **One sentence builder** (`supabase/functions/_shared/announce.ts`) is used by the gate, the admin preview and the background job, so all three produce the same words and the same clip keys. `VOICE_VERSION` names the model revision, speaker, description, seed and format. Changing it makes every clip again.
2. **Clips** are one MP3 per sentence at `voice-audio/sentences/<sha256(VOICE_VERSION + words)>.mp3`. Paths never contain names. Staff read the private bucket directly from the tablet (storage policy `voice_audio_staff_read`). Only the `pronounce` function writes to it.
3. **Pronunciation** (`child_pronunciations`, one row per child): `spoken_name` is null to say the registered name as written, or the name written the way it sounds ("Aa-raadh-ya Sharma"). `approved` records that a person listened. It applies only inside that child's own announcement: word by word when the word counts match, otherwise the whole name. It also covers possessives ("Aa-raadh-ya's mother"). A new registered name clears it. `children.full_name` is never changed.
4. **Background making**: adding a child or changing their name, class, collectors or pronunciation sets them to `pending` and asks `pronounce` to start right away (pg_net). A minute job catches anything missed. `pronounce` makes the shared phrases once per voice version (the leads, "Arriving now.", and every 5-minute time from 7 AM to 8 PM), then each pending child's everyday sentences: their name, pickup and drop-off with their class, "Please get … ready.", both cancellations, and "… is on the way." for each active collector. Each child gets 3 tries, 1 and then 4 minutes apart, then `failed` until someone taps Try again. A run that hits its time budget hands the child back without using a try. If the school computer is off, nothing is tried and no tries are used.
5. **At the gate** (`sound.ts`, `voiceClips.ts`): on duty, the tablet copies every child's clips to its own Cache Storage (a few MB once; then almost nothing). An announcement requests its clips while the chime plays. If they're all ready within `CLIP_BUDGET_MS` (1.2 s) after the chime, the school voice plays them. Otherwise the tablet's Indian English voice says the whole announcement, so one announcement is never spoken in two voices. Clips still being made are kept for the 2-minute repeat.
6. **Silence on Stop**: End duty, Mute, acknowledging, and leaving the duty screen by any route call `stopSound()`. It stops chime notes and clips mid-sound and cancels the device voice. It also bumps a counter, so audio still downloading or queued never starts afterwards (`sound.test.ts`).
7. **Isolation**: the gate loads pronunciations in their own query and ignores failures there. A voice failure resolves; it never throws into the queue. Trips, check-in, realtime and sign-in never call the voice.

## Admin

- **Child page → "How the gate says the name"**: Play; "Sounds right" (approve); "Sounds wrong? Change how it's said" (write it the way it sounds, Preview, Save and approve); the status in words ("Ready", "Getting the announcements ready", or "couldn't be made" with Try again). No IPA, model or speaker names.
- **Settings → Name pronunciation**: every child still to listen to, or whose clips failed, with Play, "Sounds right" and a link to the child.

## Security

- `pronounce` checks the caller is staff and within 300 new sentences an hour (`voice_allowed`). Input is limited to 1–400 characters of letters, marks, digits, spaces and pauses, and is checked again by the TTS service. `set_child_pronunciation` and `retry_child_voice` are admin and head office only, rate-limited, and pronunciation changes are audit-logged. `voice_claim`, `voice_finish` and `voice_requeue_all` are service-role only.
- Load limits, so a flood can't jam pickup time: staff may have 60 new sentences made an hour each (`voice_make_allowed`), each at most 200 characters. The voice service lets 2 sentences wait and answers 503 (busy) beyond that. A bulk change starts at most one background run every 20 seconds. A busy or timed-out sentence goes back in the queue without using a try.
- The drain secret is compared in constant time. Set `APP_ORIGIN` in production so only the app's address may call `pronounce` from a browser.
- The TTS service rejects every request without the shared secret (constant-time compare), has no docs pages, and returns no internal errors. The secret and URL exist only as function secrets, never in the browser.
- The drain endpoint needs `VOICE_CRON_SECRET`. Logs record counts, sizes, timings and the voice version, never the words or who asked.
- Names now reach only the school's own computer. The consent version was raised and the privacy text rewritten.

## Resource needs (measured on this Mac, 2026-09-27)

| | Measured |
|---|---|
| Model on disk | 3.75 GB (`~/.cache/huggingface`, plus a 3 MB tokenizer) |
| Service environment | about 0.9 GB (`tts-service/.venv`) |
| Load time | 21–26 s (Apple M3, half precision on the GPU, codec on the CPU) |
| Memory while running | 3.0 GB after loading; 5.7–7.8 GB while making a sentence (GPU memory steady at 2.6 GB; the rest is the codec's temporary buffers on the CPU). No leak across 7 sentences |
| One sentence | 7–61 s, median 17 s (35 test names) on an 8 GB Apple M3 with 10.9 GB of swap already in use. This is memory-bound, not a model limit; expect much faster on a 16 GB machine or an NVIDIA GPU |
| Clip size | about 10–25 KB per sentence (MP3, 64 kbit/s) |

Apple GPUs can't run the codec's widest convolution (PyTorch: "Output channels > 65536 not supported at the MPS device"). The service keeps the codec on the CPU and everything else on the GPU in half precision, which measured faster than CPU-only here.

**On an 8 GB Mac** the service slows other apps while it makes clips. Clips are made once and kept, so the service only needs to run when names, classes or collectors change, and for the occasional new sentence (the tablet's own voice covers those when it's off). A 16 GB computer can leave it running all day.

**Unusable takes**: the model occasionally keeps making sound after the words and stops only at the length limit ("Aadhya." and "Ananya." did on the first seed). The service detects that, and a take that's silent or far too long, and tries the next seed, up to 3 takes. The same seed always gives the same take, so a retry with the same seed would never help.

## Replacing the model later

The app knows only `POST /synthesize {text}` → MP3 with an `x-voice-version` header. To change the voice: change `tts-service/app.py` (model, speaker, description, seed or format) and `VOICE_VERSION` in both `app.py` and `announce.ts` (a test checks that they match), then deploy. The next drain makes the shared phrases and every child's clips in the new voice. Tablets drop the old version's cache on their next Start duty.

## Pronunciation QA

`uv run python qa_names.py` makes each test name and saves it to `tts-service/qa-out/` to listen to. What matters is whether an Indian staff member at the gate would understand the name at once, not whether audio came back.

2026-09-27: all 35 names (Hindi-, Marathi-, Bengali-, Tamil-, Telugu-, Gujarati-, Punjabi-, Kannada- and Malayalam-origin, plus a full gate sentence) produced a clean take; "Aadhya" and "Ananya" needed a second seed. **Nobody has listened to them yet.** The owner's verdicts go here, and any name that needs a pronunciation is fixed on the child's page, not in code.

## Limitations

- Pronunciation is not always right. The approval step exists because of this.
- A sentence nobody has said before (a free-text reason, a new collector) takes seconds to make, so the tablet's own voice says that announcement. Its 2-minute repeat uses the school voice.
- If the school computer is off, new names wait. Clips already made keep playing from Storage and the tablets.
- The computer must stay on and awake, with the tunnel running. It's a single machine.
