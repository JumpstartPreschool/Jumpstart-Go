"""The service's contract without the model: auth, input checks, the clip's format and version, and failure handling."""

import re
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as service

SECRET = "s" * 40
AUTH = {"Authorization": f"Bearer {SECRET}"}


class ToneVoice:
    """A test double: a 1.5 s tone with silence around it, as a sentence's audio would have."""

    sampling_rate = 44100

    def __init__(self, fail: Exception | None = None, seconds: float = 1.5) -> None:
        self.fail, self.seconds, self.calls, self.seeds = fail, seconds, 0, []

    def speak(self, text: str, seed: int = 0) -> np.ndarray:
        self.calls += 1
        self.seeds.append(seed)
        if self.fail:
            raise self.fail
        tone = 0.3 * np.sin(np.linspace(0, 2 * np.pi * 440 * self.seconds, int(self.sampling_rate * self.seconds)))
        silence = np.zeros(self.sampling_rate // 2)
        return np.concatenate([silence, tone, silence]).astype(np.float32)


def client(voice: ToneVoice) -> TestClient:
    return TestClient(service.create_app(lambda: voice, secret=SECRET))


def test_voice_version_matches_the_app():
    shared = Path(__file__).parent.parent / "supabase/functions/_shared/announce.ts"
    match = re.search(r"export const VOICE_VERSION = '([^']+)'", shared.read_text())
    assert match and match.group(1) == service.VOICE_VERSION


def test_refuses_a_short_secret():
    with pytest.raises(SystemExit):
        service.create_app(lambda: ToneVoice(), secret="short")


def test_every_endpoint_needs_the_secret():
    with client(ToneVoice()) as c:
        assert c.get("/health").status_code == 401
        assert c.post("/synthesize", json={"text": "Aarav."}, headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert c.get("/docs", headers=AUTH).status_code == 404


def test_health_reports_ready_and_version():
    with client(ToneVoice()) as c:
        body = c.get("/health", headers=AUTH).json()
        assert body == {"ready": True, "version": service.VOICE_VERSION, "busy": False}


def test_makes_a_trimmed_mp3_with_the_voice_version():
    voice = ToneVoice()
    with client(voice) as c:
        res = c.post("/synthesize", json={"text": "Pickup for Aaradhya Sharma, Nursery A."}, headers=AUTH)
        assert res.status_code == 200
        assert res.headers["content-type"] == "audio/mpeg"
        assert res.headers["x-voice-version"] == service.VOICE_VERSION
        assert res.content[:3] == b"ID3" or res.content[0] == 0xFF  # an MP3 frame or tag
        assert 5_000 < len(res.content) < 40_000  # ~1.7 s of speech at 64 kbit/s
        assert voice.calls == 1


@pytest.mark.parametrize("text", ["", " ", "a" * 401, "<script>", "Aarav_1", "Hello\u0000", "😀"])
def test_rejects_text_that_cant_be_spoken(text):
    voice = ToneVoice()
    with client(voice) as c:
        assert c.post("/synthesize", json={"text": text}, headers=AUTH).status_code in (400, 422)
        assert voice.calls == 0


def test_accepts_indian_scripts_and_names():
    assert service.check_speech("आराध्या शर्मा") == "आराध्या शर्मा"
    assert service.check_speech("  Shaurya   D'Souza, Nursery-A. ") == "Shaurya D'Souza, Nursery-A."
    assert service.check_speech("அனன்யா") == "அனன்யா"


def test_a_failing_model_is_a_clean_error():
    with client(ToneVoice(fail=RuntimeError("MPS out of memory"))) as c:
        res = c.post("/synthesize", json={"text": "Aarav."}, headers=AUTH)
        assert res.status_code == 500
        assert "MPS" not in res.text


def test_a_runaway_take_is_tried_with_new_seeds_then_rejected():
    voice = ToneVoice(seconds=20)
    with client(voice) as c:
        assert c.post("/synthesize", json={"text": "Aarav."}, headers=AUTH).status_code == 502
    assert voice.seeds == [service.SEED, service.SEED + 1, service.SEED + 2]


def test_a_take_that_ran_to_the_limit_gets_a_fresh_seed():
    class OnceRunaway(ToneVoice):
        def speak(self, text, seed=0):
            if not self.seeds:
                self.seeds.append(seed)
                raise service.Unusable("ran to the length limit")
            return super().speak(text, seed)

    voice = OnceRunaway()
    with client(voice) as c:
        assert c.post("/synthesize", json={"text": "Aadhya."}, headers=AUTH).status_code == 200
    assert voice.seeds == [service.SEED, service.SEED + 1]
