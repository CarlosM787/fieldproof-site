"""Sync check for Pilot A: do the drum hits in audio.wav land where the video draws them?

The video places count b at t = audioOffset + b * 60 / bpm. For every slot where an instrument in that
measure's mix has a hit, this finds the attack in the audio (the sharpest energy rise within
-20..+30 ms of the expected time) and reports the error.
  python sync_check.py <capture dir>
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CAP = Path(sys.argv[1])
MODEL = json.loads(subprocess.run(["node", "-e", "import('../../salsacoach-count-lab/src/model.js').then(m=>console.log(JSON.stringify(m.BAND)))"],
                                  cwd=HERE, capture_output=True, text=True, check=True).stdout)
EP = json.loads(subprocess.run(["node", "-e", "import('./episode.mjs').then(m=>console.log(JSON.stringify(m.EPISODE)))"],
                               cwd=HERE, capture_output=True, text=True, check=True).stdout)

with wave.open(str(CAP / "audio.wav")) as w:
    sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
    x = np.frombuffer(w.readframes(n), dtype=np.int16 if w.getsampwidth() == 2 else np.int32).astype(np.float64)
x = x.reshape(-1, ch).mean(axis=1)
hop = int(sr * 0.0005)                      # 0.5 ms hops
win = int(sr * 0.002)                       # 2 ms energy window
e = np.convolve(x ** 2, np.ones(win) / win, mode="same")[::hop]
le = np.log10(e + 1e-9)
rise = np.diff(le, prepend=le[0])

slot_s = 30 / EP["bpm"]                     # an eighth note
errs = []
for m, meas in enumerate(EP["measures"]):
    lanes = [k for k, on in meas["mix"].items() if on]
    for s in range(16):
        if not any(str(s) in MODEL[k] for k in lanes):
            continue
        t = EP["audioOffset"] + (m * 16 + s) * slot_s
        a, b = int((t - 0.020) / 0.0005), int((t + 0.030) / 0.0005)
        if b >= len(rise):
            continue
        k = a + int(np.argmax(rise[a:b]))
        errs.append((k * 0.0005 - t) * 1000)
errs = np.array(errs)
print(json.dumps({"hits_checked": int(errs.size), "median_ms": round(float(np.median(errs)), 2),
                  "p95_abs_ms": round(float(np.percentile(np.abs(errs), 95)), 2), "max_abs_ms": round(float(np.max(np.abs(errs))), 2),
                  "within_10ms": int((np.abs(errs) <= 10).sum())}))
