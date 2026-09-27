"""
Pronunciation QA: makes each test name (and a full gate sentence) with the real model, times it, and saves the clips to
qa-out/ for a person to listen to. The question is not "did it return audio" but "would an Indian staff member at the
gate instantly understand this name?" Record the verdicts in docs/architecture/voice-architecture.md.

    uv run python qa_names.py            # every name
    uv run python qa_names.py Aaradhya   # just these
"""

import sys
import time
from pathlib import Path

import app as service

# Names from many Indian languages, chosen because English spelling hints poorly at how they're said.
NAMES = [
    "Aaradhya Sharma", "Aadhya", "Ananya", "Ishaan", "Dhruv", "Rishabh", "Shaurya", "Advait", "Vihaan", "Aarav",
    "Saanvi", "Kiara", "Prisha", "Myra", "Vedant", "Atharv", "Tanmay", "Yuvraj",
    "Shreyas Kulkarni", "Anvita Deshpande",  # Marathi
    "Arnav Chatterjee", "Srijani Bhattacharya",  # Bengali
    "Tharun Subramanian", "Nila Venkatesan",  # Tamil
    "Sai Charan Reddy", "Harshitha Naidu",  # Telugu
    "Jash Patel", "Dhruvi Mehta",  # Gujarati
    "Gurleen Kaur", "Harjot Singh Gill",  # Punjabi
    "Prajwal Gowda", "Chinmayi Hegde",  # Kannada
    "Aadhi Nair", "Gauri Menon",  # Malayalam
]
SENTENCE = "Pickup for Aaradhya Sharma, Nursery A."


def main() -> None:
    wanted = sys.argv[1:] or NAMES
    out = Path(__file__).parent / "qa-out"
    out.mkdir(exist_ok=True)
    started = time.monotonic()
    voice = service.ParlerVoice(service.pick_device())
    print(f"model loaded on {voice.device} in {time.monotonic() - started:.1f}s")
    timings = []
    for text in [*(f"{n}." for n in wanted), SENTENCE]:
        t0 = time.monotonic()
        try:
            audio = service.best_take(voice, text)
        except service.Unusable as reason:
            print(f"UNUSABLE  {text:<32} {reason}")
            continue
        ms = (time.monotonic() - t0) * 1000
        timings.append(ms)
        mp3 = service.to_mp3(audio, voice.sampling_rate)
        (out / f"{text.strip('.').replace(' ', '_').replace(',', '')}.mp3").write_bytes(mp3)
        print(f"{ms:7.0f} ms  {audio.size / voice.sampling_rate:4.1f}s audio  {len(mp3) / 1024:5.1f} KB  {text}")
    if timings:
        timings.sort()
        print(f"\n{len(timings)} clips. median {timings[len(timings) // 2]:.0f} ms, slowest {timings[-1]:.0f} ms. Listen in {out}")


if __name__ == "__main__":
    main()
