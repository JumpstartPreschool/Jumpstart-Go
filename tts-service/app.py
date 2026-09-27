"""
Jumpstart's gate voice: AI4Bharat Indic Parler-TTS (Apache-2.0) behind a small private HTTP service.

It runs on the school's own computer and knows nothing about children: it turns one short sentence into an MP3 clip.
Only the Supabase `pronounce` function calls it, with a shared secret, through a Cloudflare Tunnel. The model is loaded
once at start-up and kept in memory; one sentence is made at a time, because one computer gains nothing from more.

    TTS_SHARED_SECRET=...  uv run uvicorn app:app --host 127.0.0.1 --port 8790

Environment: TTS_SHARED_SECRET (required, 32+ characters), TTS_DEVICE (auto | mps | cuda | cpu; default auto).
"""

from __future__ import annotations

import asyncio
import gc
import hmac
import io
import json
import logging
import os
import time
import unicodedata
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Callable, Protocol

import numpy as np
import soundfile as sf
from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

MODEL_ID = "ai4bharat/indic-parler-tts"
MODEL_REVISION = "7b527af5ee8ed1f9a28d80b19703ed9bb8ba10ca"
# "Mary" is the model's recommended Indian English woman's voice. The description is fixed: a calm, clear, slightly slow
# announcement, recorded close up with no background noise, so every clip sounds like the same person at the same desk.
DESCRIPTION = (
    "Mary speaks in a calm, clear and warm voice at a slightly slow pace with a moderate pitch. "
    "The recording is of very high quality, with the speaker's voice sounding clear and very close up, "
    "with no background noise."
)
SEED = 20260927
# Must equal VOICE_VERSION in supabase/functions/_shared/announce.ts (test_app.py checks). Change both together whenever
# the model, revision, speaker, description, seed or audio format changes, so every clip is made again in the new voice.
VOICE_VERSION = "indic-parler-tts@7b527af5|mary|calm-v1|seed-20260927|mp3-64k"
MAX_CHARS = 400
TAKES = 3
# Sentences allowed to wait while one is being made. More are refused (503) so a flood of requests can't queue up
# hours of work; the caller tries later and the gate uses the tablet's own voice meanwhile.
MAX_WAITING = 2
# Clips made recently, by exact words. When the caller gave up waiting (the pronounce function stops at 60 s) the clip
# still finishes here, and its next request is answered at once instead of making it all over again. ~20 KB each.
RECENT = 64
PAUSES = set(" .,'?!:;-")

log = logging.getLogger("jumpstart-tts")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def event(name: str, **extra: object) -> None:
    """One JSON line per event: counts, sizes and timings, never the words."""
    log.info(json.dumps({"voice": name, "version": VOICE_VERSION, **extra}))


def check_speech(text: str) -> str | None:
    """The sentence if it may be spoken (letters and marks in any script, digits, spaces, pauses; 1-400), else None."""
    text = " ".join(unicodedata.normalize("NFC", text).split())
    if not text or len(text) > MAX_CHARS:
        return None
    ok = all(ch in PAUSES or unicodedata.category(ch)[0] in "LMN" for ch in text)
    return text if ok else None


class Voice(Protocol):
    sampling_rate: int

    def speak(self, text: str, seed: int = ...) -> np.ndarray: ...


class ParlerVoice:
    """The model, loaded once. speak() is not thread-safe: the service calls it one sentence at a time."""

    def __init__(self, device: str) -> None:
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        self.torch = torch
        self.device = device
        started = time.monotonic()
        # Half precision on a GPU: half the memory (about 1.9 GB instead of 3.75 GB) and faster, with no audible loss.
        dtype = torch.float32 if device == "cpu" else torch.float16
        self.model = ParlerTTSForConditionalGeneration.from_pretrained(MODEL_ID, revision=MODEL_REVISION, torch_dtype=dtype).to(device).eval()
        if device == "mps":
            # Apple GPUs can't run the audio codec's widest convolution (PyTorch: "Output channels > 65536 not
            # supported at the MPS device"), so the codec runs on the CPU and everything else stays on the GPU.
            codec = self.model.audio_encoder.to("cpu", torch.float32)
            decode = codec.decode
            codec.decode = lambda audio_codes, **kw: decode(audio_codes=audio_codes.to("cpu"), **kw)
        self.prompt_tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
        self.description_tokenizer = AutoTokenizer.from_pretrained(self.model.config.text_encoder._name_or_path)
        self.sampling_rate = int(self.model.config.sampling_rate)
        # The description never changes, so it's encoded once.
        self.description = self.description_tokenizer(DESCRIPTION, return_tensors="pt").to(device)
        event("model_loaded", device=device, ms=round((time.monotonic() - started) * 1000))

    def speak(self, text: str, seed: int = SEED) -> np.ndarray:
        prompt = self.prompt_tokenizer(text, return_tensors="pt").to(self.device)
        # About 86 audio frames a second. Room for a slow reading of the sentence plus a pause; a runaway generation
        # (the model occasionally babbles) stops here and is rejected as too long by clean() below.
        frames = int((len(text) * 0.12 + 3) * 86)
        self.torch.manual_seed(seed)
        with self.torch.inference_mode():
            audio = self.model.generate(
                input_ids=self.description.input_ids,
                attention_mask=self.description.attention_mask,
                prompt_input_ids=prompt.input_ids,
                prompt_attention_mask=prompt.attention_mask,
                max_new_tokens=frames,
            )
        result = audio.cpu().numpy().squeeze().astype(np.float32)
        # Stopped by the limit, not by the model finishing: the take babbles on after the words (measured on "Aadhya.").
        ran_to_limit = result.size >= frames / 86 * self.sampling_rate * 0.93
        # Hand the GPU's scratch memory back after every sentence (measured: holds it at ~2.6 GB instead of growing).
        del audio, prompt
        gc.collect()
        if self.device == "mps":
            self.torch.mps.empty_cache()
        elif self.device == "cuda":
            self.torch.cuda.empty_cache()
        if ran_to_limit:
            raise Unusable("ran to the length limit")
        return result


def pick_device() -> str:
    wanted = os.environ.get("TTS_DEVICE", "auto")
    if wanted != "auto":
        return wanted
    import torch

    if torch.cuda.is_available():
        return "cuda"
    return "mps" if torch.backends.mps.is_available() else "cpu"


class Unusable(Exception):
    """The model produced something that isn't a clean reading of the sentence (silence, or far too long)."""


def clean(audio: np.ndarray, rate: int, text: str) -> np.ndarray:
    """Trims silence, rejects a runaway or empty take, evens out loudness and softens the edges (no clicks)."""
    if audio.size == 0 or not np.isfinite(audio).all():
        raise Unusable("empty")
    peak = float(np.max(np.abs(audio)))
    if peak < 1e-3:
        raise Unusable("silent")
    loud = np.flatnonzero(np.abs(audio) > peak * 0.02)
    pad = int(rate * 0.08)
    audio = audio[max(0, loud[0] - pad) : loud[-1] + pad]
    seconds = audio.size / rate
    if seconds < 0.3 or seconds > len(text) * 0.12 + 2.5:
        raise Unusable(f"{seconds:.1f}s for {len(text)} characters")
    audio = audio * (0.89 / float(np.max(np.abs(audio))))  # -1 dBFS peak: loud and clear at the gate, never clipped
    fade = min(int(rate * 0.01), audio.size // 2)
    ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
    audio[:fade] *= ramp
    audio[-fade:] *= ramp[::-1]
    return audio.astype(np.float32)


def best_take(voice: Voice, text: str) -> np.ndarray:
    """The first clean take. The same seed gives the same take, so an unusable one is tried again with the next seeds."""
    for take in range(TAKES):
        try:
            return clean(voice.speak(text, SEED + take), voice.sampling_rate, text)
        except Unusable as reason:
            event("take_unusable", reason=str(reason), chars=len(text), take=take + 1)
    raise Unusable(f"no usable take in {TAKES}")


def to_mp3(audio: np.ndarray, rate: int) -> bytes:
    """MP3 plays on every iPad, phone and browser (Web Audio decodes it everywhere); ~64 kbit/s keeps speech clear."""
    out = io.BytesIO()
    sf.write(out, audio, rate, format="MP3", subtype="MPEG_LAYER_III", bitrate_mode="CONSTANT", compression_level=0.88)  # ~64 kbit/s constant (0.99 would be 32)
    return out.getvalue()


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS * 2)


def create_app(load_voice: Callable[[], Voice], secret: str | None = None) -> FastAPI:
    secret = secret if secret is not None else os.environ.get("TTS_SHARED_SECRET", "")
    if len(secret) < 32:
        raise SystemExit("Set TTS_SHARED_SECRET to a random value of 32 or more characters (the same as the pronounce function's).")
    lock = asyncio.Lock()
    state: dict[str, Voice] = {}
    waiting = {"count": 0}
    recent: OrderedDict[str, bytes] = OrderedDict()

    def reply(mp3: bytes) -> Response:
        return Response(mp3, media_type="audio/mpeg", headers={"x-voice-version": VOICE_VERSION, "cache-control": "no-store"})

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        state["voice"] = await run_in_threadpool(load_voice)
        yield

    app = FastAPI(title="Jumpstart gate voice", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    @app.middleware("http")
    async def require_secret(request: Request, call_next):
        given = request.headers.get("authorization", "")
        if not hmac.compare_digest(given.encode(), f"Bearer {secret}".encode()):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)

    @app.get("/health")
    async def health() -> dict[str, object]:
        return {"ready": "voice" in state, "version": VOICE_VERSION, "busy": lock.locked()}

    @app.post("/synthesize")
    async def synthesize(body: SpeakRequest) -> Response:
        text = check_speech(body.text)
        if text is None:
            return JSONResponse({"error": "That can't be spoken."}, status_code=400)
        voice = state["voice"]
        if text in recent:
            recent.move_to_end(text)
            event("recent_hit", chars=len(text))
            return reply(recent[text])
        if lock.locked() and waiting["count"] >= MAX_WAITING:
            event("busy", chars=len(text))
            return JSONResponse({"error": "Busy. Try again shortly."}, status_code=503)
        waiting["count"] += 1
        try:
            await lock.acquire()
        finally:
            waiting["count"] -= 1
        try:
            if text in recent:  # made while this request waited for its turn
                return reply(recent[text])
            started = time.monotonic()
            try:
                audio = await run_in_threadpool(best_take, voice, text)
            except Unusable:
                event("generation_failed", reason="no usable take", chars=len(text))
                return JSONResponse({"error": "The voice couldn't read that clearly."}, status_code=502)
            except Exception as error:  # the model or device failed: logged here, never shown to staff
                event("generation_failed", reason=type(error).__name__, chars=len(text))
                return JSONResponse({"error": "The voice failed."}, status_code=500)
            mp3 = to_mp3(audio, voice.sampling_rate)
            recent[text] = mp3
            while len(recent) > RECENT:
                recent.popitem(last=False)
            event("generation_completed", chars=len(text), ms=round((time.monotonic() - started) * 1000),
                  seconds=round(audio.size / voice.sampling_rate, 2), bytes=len(mp3))
        finally:
            lock.release()
        return reply(mp3)

    return app


if os.environ.get("TTS_SHARED_SECRET"):
    app = create_app(lambda: ParlerVoice(pick_device()))
