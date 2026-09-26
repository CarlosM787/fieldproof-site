"""Carlos's voice-over, in two commands. His own recorded voice only: no text-to-speech, no cloning.

  python voice.py prep take1.wav voice.wav                  clean and level a recording
  python voice.py mix OUT/desert-systems/lake-powell-short-v2.mp4 voice.wav OUT/lake-powell-short-v2-vo.mp4 --at 0.4

prep: any file FFmpeg reads (WAV from Audacity or Windows Sound Recorder, M4A from a phone) ->
  48 kHz stereo; a 80 Hz high-pass (rumble, desk bumps); leading/trailing silence trimmed to 0.15 s;
  levelled to -16 LUFS (spoken word) with a true-peak ceiling of -2 dBTP. Writes voice.wav and voice.json.
mix: the video's own soundtrack is the bed. Where the voice speaks (its 30 ms level above -45 dBFS,
  60 ms attack, 300 ms release) the bed is lowered by --duck dB (default 8); voice + ducked bed are
  mastered to --target LUFS (default -14, true peak <= -1.5 dBTP) and muxed with the ORIGINAL video
  stream copied bit for bit (no re-encode). The voice must end before the video does.
Writes <out>.json: loudness, true peak, clipped samples, ducking depth, and whether the video stream
is identical (MD5 of the stream packets, before and after).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "review"))
from audio_check import FF, SR, clip_counts, ebur128, master, read_audio, write_wav  # noqa: E402


def highpass(x: np.ndarray, hz: float = 80.0, order: int = 4) -> np.ndarray:
    """Zero-phase Butterworth-magnitude high-pass in the FFT domain (same approach as audio_check)."""
    n = 1 << int(np.ceil(np.log2(len(x) + 1)))
    f = np.fft.rfftfreq(n, 1 / SR)
    resp = 1 / np.sqrt(1 + (hz / np.maximum(f, 1e-3)) ** (2 * order))
    out = np.empty_like(x)
    for c in range(x.shape[1]):
        out[:, c] = np.fft.irfft(np.fft.rfft(x[:, c], n) * resp, n)[: len(x)]
    return out


def level_db(x: np.ndarray, win: int) -> np.ndarray:
    m = x.mean(axis=1)
    k = len(m) // win
    rms = np.sqrt((m[: k * win].reshape(k, win) ** 2).mean(axis=1) + 1e-20)
    return 20 * np.log10(rms)


def prep(src, dst, target=-16.0, ceiling=-2.0, gate_db=-50.0) -> dict:
    x = highpass(read_audio(src))
    win = int(0.03 * SR)
    lv = level_db(x, win)
    on = np.flatnonzero(lv > gate_db)
    if not len(on):
        raise SystemExit("no speech found above the gate: check the recording level")
    pad = int(0.15 * SR)
    a, b = max(0, on[0] * win - pad), min(len(x), (on[-1] + 1) * win + pad)
    y, gain_db, _ = master(x[a:b], target, ceiling)
    write_wav(dst, y)
    rep = {"source": str(src), "trimmed_s": [round(a / SR, 3), round((len(x) - b) / SR, 3)], "seconds": round((b - a) / SR, 3),
           "gain_dB": round(gain_db, 2), "loudness": ebur128(dst), "clip": clip_counts(dst)}
    Path(dst).with_suffix(".json").write_text(json.dumps(rep, indent=1) + "\n")
    return rep


def duck_curve(voice: np.ndarray, n: int, duck_db: float, attack=0.06, release=0.30, thresh_db=-45.0) -> np.ndarray:
    """Per-sample bed gain: 1 where the voice is silent, 10^(-duck/20) while it speaks, with smooth edges
    (a one-pole follower at a 1 kHz control rate, faster up than down, then interpolated per sample)."""
    win, ctl = int(0.03 * SR), SR // 1000
    active = np.repeat(level_db(voice, win) > thresh_db, win // ctl).astype(float)
    m = -(-n // ctl)
    active = np.pad(active, (0, max(0, m - len(active))))[:m]
    a_c, r_c = np.exp(-1 / (attack * 1000)), np.exp(-1 / (release * 1000))
    env, e = np.empty(m), 0.0
    for i, v in enumerate(active):
        c = a_c if v > e else r_c
        e = c * e + (1 - c) * v
        env[i] = e
    env = np.interp(np.arange(n) / ctl, np.arange(m), env)
    return 10 ** (-duck_db * env / 20)


def stream_md5(path) -> str:
    out = subprocess.run([FF, "-v", "error", "-i", str(path), "-map", "0:v:0", "-c", "copy", "-f", "md5", "-"],
                         capture_output=True, text=True, check=True).stdout
    return out.strip().split("=")[-1]


def mix(video, voice_wav, out, at=0.0, duck_db=8.0, target=-14.0, ceiling=-1.5) -> dict:
    bed = read_audio(video)
    v = read_audio(voice_wav)
    n = len(bed)
    s0 = int(round(at * SR))
    if s0 + len(v) > n:
        raise SystemExit(f"the voice ends at {(s0 + len(v)) / SR:.2f} s, after the video ({n / SR:.2f} s): trim it or start earlier")
    vt = np.zeros_like(bed)
    vt[s0:s0 + len(v)] = v
    g = duck_curve(vt, n, duck_db)
    y, gain_db, lim = master(bed * g[:, None] + vt, target, ceiling)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "mix.wav"
        write_wav(wav, y)
        subprocess.run([FF, "-y", "-v", "error", "-i", str(video), "-i", str(wav), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(out)], check=True)
    speaking = g < 10 ** (-(duck_db - 0.5) / 20)
    rep = {"video": str(video), "voice": str(voice_wav), "at_s": at, "duck_dB": duck_db,
           "speaking_s": round(float(speaking.sum()) / SR, 2), "bed_gain_min_dB": round(float(20 * np.log10(g.min())), 2),
           "master_gain_dB": round(gain_db, 2), "limiter_max_reduction_dB": round(float(20 * np.log10(lim.min())), 2),
           "loudness": ebur128(out), "clip": clip_counts(out),
           "duration_s": {"in": round(n / SR, 3), "out": round(len(read_audio(out)) / SR, 3)},
           "video_stream_identical": stream_md5(video) == stream_md5(out)}
    Path(out).with_suffix(".json").write_text(json.dumps(rep, indent=1) + "\n")
    return rep


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prep")
    p.add_argument("src")
    p.add_argument("dst")
    p.add_argument("--target", type=float, default=-16.0)
    m = sub.add_parser("mix")
    m.add_argument("video")
    m.add_argument("voice")
    m.add_argument("out")
    m.add_argument("--at", type=float, default=0.0, help="seconds into the video where the voice starts")
    m.add_argument("--duck", type=float, default=8.0)
    m.add_argument("--target", type=float, default=-14.0)
    a = ap.parse_args(argv)
    rep = prep(a.src, a.dst, a.target) if a.cmd == "prep" else mix(a.video, a.voice, a.out, a.at, a.duck, a.target)
    print(json.dumps(rep, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
