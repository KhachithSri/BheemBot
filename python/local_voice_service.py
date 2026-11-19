"""Local speech sidecar for the Bheem voice relay.

Install requirements from python/requirements-local-voice.txt, download Piper
voice files, then run this file. It intentionally exposes localhost only.
"""

from __future__ import annotations

import io
import json
import os
import struct
import tempfile
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from faster_whisper import WhisperModel
from piper import PiperVoice

HOST = os.getenv("LOCAL_VOICE_HOST", "127.0.0.1")
PORT = int(os.getenv("LOCAL_VOICE_PORT", "8090"))
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small.en")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
PIPER_MODEL_EN = os.getenv("PIPER_MODEL_EN", "")

whisper = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
voices: dict[str, PiperVoice] = {}


def get_voice() -> PiperVoice:
    if not PIPER_MODEL_EN:
        raise RuntimeError("PIPER_MODEL_EN is not configured")
    if "en" not in voices:
        voices["en"] = PiperVoice.load(PIPER_MODEL_EN)
    return voices["en"]


def transcribe(pcm: bytes) -> str:
    file_descriptor, file_path = tempfile.mkstemp(suffix=".wav")
    os.close(file_descriptor)
    try:
        with wave.open(file_path, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(pcm)
        segments, _ = whisper.transcribe(
            file_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters={
                "threshold": 0.6,
                "min_speech_duration_ms": 250,
                "min_silence_duration_ms": 500,
                "speech_pad_ms": 120,
            },
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4,
        )
        return " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        try:
            os.unlink(file_path)
        except FileNotFoundError:
            pass


def synthesize(text: str) -> bytes:
    source = get_voice()
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav:
        source.synthesize_wav(text, wav)
    wav_buffer.seek(0)
    with wave.open(wav_buffer, "rb") as wav:
        source_rate = wav.getframerate()
        raw = wav.readframes(wav.getnframes())

    samples = struct.unpack(f"<{len(raw) // 2}h", raw)
    if source_rate != 24000 and samples:
        output_count = round(len(samples) * 24000 / source_rate)
        resampled = []
        for index in range(output_count):
            position = index * (len(samples) - 1) / max(1, output_count - 1)
            left = int(position)
            right = min(left + 1, len(samples) - 1)
            fraction = position - left
            resampled.append(samples[left] * (1 - fraction) + samples[right] * fraction)
        samples = resampled

    return b"".join(struct.pack("<f", max(-1.0, min(1.0, sample / 32768.0))) for sample in samples)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True, "whisperModel": WHISPER_MODEL, "piperConfigured": bool(PIPER_MODEL_EN)})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        try:
            if self.path == "/transcribe":
                self.send_json(200, {"text": transcribe(body)})
                return
            if self.path == "/synthesize":
                request = json.loads(body)
                audio = synthesize(str(request["text"]))
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(audio)))
                self.end_headers()
                self.wfile.write(audio)
                return
            self.send_json(404, {"error": "not found"})
        except Exception as error:
            self.send_json(500, {"error": str(error)})


if __name__ == "__main__":
    print(f"Local voice service listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
