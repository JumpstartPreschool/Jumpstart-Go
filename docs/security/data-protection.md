# Data protection

## Gate voice: what Microsoft receives (D50)

**What is sent.** When a child is added or changed, the `pronounce` function sends Microsoft Azure AI Speech (Central India region) the child's announcements, one at a time: the child's full name (or the approved way to say it), the relation of the person coming ("mother", "pickup person"), and fixed wording. Staff previews send the same kind of sentence. Nothing else: no IDs, phone numbers, locations, times, codes or photos. Requests carry the school's key, not any person's identity.

**What Microsoft keeps.** Microsoft states: "Microsoft doesn't retain or store the text that you provide with the real-time synthesis text to speech API", and it doesn't store the audio ([data, privacy and security](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security)).

**What we keep.** The recordings, in the private `voice-audio` bucket (staff only) and on the gate's iPads. File names are hashes; no name is in a path. They're replaced when the name, pronunciation, voice or wording changes.

**Why this is acceptable.** The same words are shown on every coordinator's iPad and spoken aloud at the gate; the voice adds no new data. Parents are told in the privacy policy and asked again (`CONSENT_VERSION` 2026-09-29). Processing is in India.

**The key.** `AZURE_SPEECH_KEY` is a Supabase function secret, sent only in a request header. If it leaks: regenerate it in the Azure portal (Keys and Endpoint) and set the new one; on the Free F0 tier the worst case is used-up free characters, never a charge.
