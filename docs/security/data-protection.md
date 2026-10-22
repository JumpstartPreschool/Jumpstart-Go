# Data protection

## Gate voice: what Microsoft receives (D50)

**What is sent.** When a child is added or changed, the `pronounce` function sends Microsoft Azure AI Speech (Central India region) the child's announcements, one at a time: the child's full name (or the approved way to say it), the relation of the person coming ("mother", "pickup person"), and fixed wording. Staff previews send the same kind of sentence. Nothing else: no IDs, phone numbers, locations, times, codes or photos. Requests carry the school's key, not any person's identity.

**What Microsoft keeps.** Microsoft states: "Microsoft doesn't retain or store the text that you provide with the real-time synthesis text to speech API", and it doesn't store the audio ([data, privacy and security](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security)).

**What we keep.** The recordings, in the private `voice-audio` bucket (staff only) and on the gate's iPads. File names are hashes; no name is in a path. They're replaced when the name, pronunciation, voice or wording changes.

**Why this is acceptable.** The same words are shown on every coordinator's iPad and spoken aloud at the gate; the voice adds no new data. Parents are told in the privacy policy and asked again (`CONSENT_VERSION` 2026-09-29). Processing is in India.

**The key.** `AZURE_SPEECH_KEY` is a Supabase function secret, sent only in a request header. If it leaks: regenerate it in the Azure portal (Keys and Endpoint) and set the new one; on the Free F0 tier the worst case is used-up free characters, never a charge.

## Gate voice on phones in the background (2026-10-22)

**What travels.** Each gate alert to a phone carries the first-name-only title and body it always had, plus each recording's key (a hash; no name) and a link to that one recording in the private `voice-audio` bucket. The link is signed by `push-send` for that alert and stops working when the alert expires (at most 10 minutes). The announcement's full words, with the child's surname, are **not** sent: FCM data messages are encrypted in transit but readable by Google, unlike web push, which is end-to-end encrypted.

**Who gets it.** Only the devices the alert was queued for: the child's gate team and, on escalation, Center Leaders (`app.notify`, `coordinators_for`). A parent's alert about a trip carries no recording and is never spoken.

**What the phone keeps.** The recordings it played, in the app's private cache (Android: newest 300; iOS extension: newest 40 sounds in the app group), named by hash. They hold the same words the duty screen shows and says aloud. Signing out doesn't clear them; uninstalling does.

**Receipts.** The phone reports `displayed` and `spoken` with the alert's receipt id; the server keeps only the times (`push_outbox`, kept 14 days) and, for a gate request, that the person heard it (`app.gate_heard`).
