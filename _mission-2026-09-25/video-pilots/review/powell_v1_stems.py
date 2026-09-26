"""Split Pilot B v1's sound into its three parts (drone, weekly mallets, New Year bells) for review.

  python powell_v1_stems.py <csv> <v1 wav> <out dir>
The synthesis below is lake_powell.py v1's audio() verbatim, with a switch per part. The script
checks that the three parts, summed and normalized exactly like v1, reproduce the v1 WAV (it
prints the largest difference in 16-bit steps), then writes each part at the v1 mix level.
"""
import sys
import wave
from datetime import date
from pathlib import Path

import numpy as np

CSV, V1, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
rows = [l.split(",") for l in CSV.read_text().splitlines() if l and not l.startswith("#") and not l.startswith("date")]
days = [date.fromisoformat(d) for d, _ in rows]
vals = np.array([float(v) for _, v in rows])
N = len(days)
T_TITLE, T_DRAW, T_END = 4.5, 54.0, 7.0
TOTAL = T_TITLE + T_DRAW + T_END
SR, MIN_POOL = 48000, 3490.0


def part(which):
    n = int(TOTAL * SR)
    out = np.zeros((n, 2))
    t_all = np.arange(n) / SR
    if which == "drone":
        buf = np.interp(t_all, [T_TITLE + T_DRAW * i / (N - 1) for i in range(N)], vals - MIN_POOL, left=vals[0] - MIN_POOL, right=vals[-1] - MIN_POOL)
        amp = 0.05 + 0.13 * np.clip(buf / 90, 0, 1)
        fade = np.clip(t_all / 2.0, 0, 1) * np.clip((TOTAL - t_all) / 2.5, 0, 1)
        drone = (np.sin(2 * np.pi * 55 * t_all) + 0.6 * np.sin(2 * np.pi * 82.41 * t_all + 0.3) + 0.25 * np.sin(2 * np.pi * 110.3 * t_all)) * amp * fade
        out[:, 0] += drone
        out[:, 1] += drone * 0.96
    if which == "mallets":
        scale = [110 * 2 ** (s / 12) for o in range(3) for s in (0 + 12 * o, 3 + 12 * o, 5 + 12 * o, 7 + 12 * o, 10 + 12 * o)]
        lo, hi = 3505.0, 3580.0
        for i in range(0, N, 7):
            k = int(np.clip((vals[i] - lo) / (hi - lo), 0, 0.999) * len(scale))
            f0 = scale[k]
            t0 = T_TITLE + T_DRAW * i / (N - 1)
            s0, L = int(t0 * SR), int(0.9 * SR)
            tt = np.arange(L) / SR
            tone = (np.sin(2 * np.pi * f0 * tt) + 0.3 * np.sin(2 * np.pi * 3 * f0 * tt) * np.exp(-tt * 18)) * np.exp(-tt * 4.2) * 0.22
            pan = 0.5 + 0.35 * np.sin(i / 60)
            e = min(n, s0 + L)
            out[s0:e, 0] += tone[: e - s0] * (1 - pan)
            out[s0:e, 1] += tone[: e - s0] * pan
    if which == "bells":
        for i, d in enumerate(days):
            if d.month == 1 and d.day == 1:
                t0 = T_TITLE + T_DRAW * i / (N - 1)
                s0, L = int(t0 * SR), int(1.6 * SR)
                tt = np.arange(L) / SR
                bell = (np.sin(2 * np.pi * 880 * tt) + 0.5 * np.sin(2 * np.pi * 1318.5 * tt)) * np.exp(-tt * 2.6) * 0.16
                e = min(n, s0 + L)
                out[s0:e] += bell[: e - s0, None]
    return out


def write(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


parts = {k: part(k) for k in ("drone", "mallets", "bells")}
total = sum(parts.values())
g = 0.9 / max(1e-9, np.abs(total).max())  # v1: out /= max|out| / 0.9
with wave.open(str(V1)) as w:
    v1 = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, 2).astype(np.int32)
mine = (total * g * 32767).astype("<i2").astype(np.int32)
print("v1 reproduction: max difference", int(np.abs(mine - v1).max()), "LSB over", len(v1), "frames")
for k, x in parts.items():
    write(OUT / f"{k}.wav", x * g)
write(OUT / "mix.wav", total * g)
print("wrote", sorted(p.name for p in OUT.glob("*.wav")))
