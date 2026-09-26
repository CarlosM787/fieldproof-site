"""End-to-end A/V sync of a finished Clave Lab MP4: when does the picture show a slot, and when is
that slot heard in the file's own audio track?

  python av_sync.py <video.mp4> <source audio.wav> <layout.json> <episode.mjs>

1. Container offset: cross-correlates the MP4's decoded audio (ffmpeg honours the edit list, as
   players do) with the source WAV, so AAC priming or a missing edit list would show up here.
2. Picture: reads the slot cursor (a light outline over the lane grid) in every decoded frame at the
   row and columns given in layout.json, and records the frame where each slot first appears.
3. Sound: finds each slot's attack in the MP4's audio (sharpest energy rise near the model time).
Reports picture-minus-sound for every slot change: positive = picture late.
layout.json: {"row": y, "x0": left edge of slot 0, "cell": slot width, "height": frame height,
"width": frame width, "offset": audio offset of slot 0 in the final file (s), "trim": seconds cut
from the source WAV's start}.
"""
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audio_check import read_audio  # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()
VIDEO, SRC, LAYOUT, EPFILE = sys.argv[1:5]
L = json.loads(Path(LAYOUT).read_text())
EP = json.loads(subprocess.run(["node", "-e", f"import('{Path(EPFILE).resolve().as_uri()}').then(m=>console.log(JSON.stringify(m.EPISODE)))"],
                               capture_output=True, text=True, check=True).stdout)
BAND = json.loads(subprocess.run(["node", "-e", "import('" + (Path(__file__).resolve().parents[2] / "salsacoach-count-lab/src/model.js").as_uri() + "').then(m=>console.log(JSON.stringify(m.BAND)))"],
                                 capture_output=True, text=True, check=True).stdout)
SR = 48000
slot_s = 30 / EP["bpm"]


def has_hit(abs_slot):
    m = min(abs_slot // 16, len(EP["measures"]) - 1)
    return any(str(abs_slot % 16) in BAND[k] for k, on in EP["measures"][m]["mix"].items() if on)

# 1. container offset
a = read_audio(VIDEO).mean(axis=1)
s = read_audio(SRC).mean(axis=1)[int(L.get("trim", 0) * SR):]
n = min(len(a), len(s), 12 * SR)
A, S = np.fft.rfft(a[:n], 2 * n), np.fft.rfft(s[:n], 2 * n)
xc = np.fft.irfft(A * np.conj(S))
lag = int(np.argmax(np.concatenate([xc[-2000:], xc[:2000]]))) - 2000
container_ms = lag / SR * 1000

# 3. audio attacks in the MP4 (same detector as sync_check.py)
hop, win = int(SR * 0.0005), int(SR * 0.002)
e = np.convolve(a ** 2, np.ones(win) / win, mode="same")[::hop]
le = np.log10(e + 1e-9)
rise = np.diff(le, prepend=le[0])

# 2. picture: read the cursor row from every frame
W, H = L["width"], L["height"]
y0 = L["row"] // 2 * 2  # yuv420p crops need even sizes
raw = subprocess.run([FF, "-v", "error", "-i", VIDEO, "-vf", f"crop={W}:2:0:{y0}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                     capture_output=True, check=True).stdout
rows = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 2, W)[:, L["row"] - y0].astype(float)
fps = EP["fps"]
shown = []
for r in rows:
    cells = [r[int(L["x0"] + k * L["cell"]) + 3: int(L["x0"] + (k + 1) * L["cell"]) - 3].mean() for k in range(16)]
    k = int(np.argmax(cells))
    shown.append(k if cells[k] > np.median(cells) + 40 else -1)

errs = []
for f in range(1, len(shown)):
    if shown[f] < 0 or shown[f] == shown[f - 1]:
        continue
    t_pic = f / fps                                     # the frame is on screen from f/fps
    j = round((t_pic - L["offset"]) / slot_s)            # nearest slot on the model clock
    tm = L["offset"] + j * slot_s
    if j < 0 or not has_hit(j):
        continue
    i0, i1 = int((tm - 0.02) / 0.0005), int((tm + 0.03) / 0.0005)
    if i0 < 0 or i1 >= len(rise):
        continue
    t_snd = (i0 + int(np.argmax(rise[i0:i1]))) * 0.0005
    errs.append((t_pic - t_snd) * 1000)
errs = np.array(errs)
if "--hist" in sys.argv:
    print(np.histogram(errs, bins=[-40, -20, -10, 0, 10, 20, 30, 40, 60])[0].tolist())
late = int((errs > 20).sum())
print(json.dumps({"container_offset_ms": round(container_ms, 2), "slot_changes_with_a_hit": int(errs.size), "picture_more_than_20ms_late": late,
                  "picture_minus_sound_ms": {"median": round(float(np.median(errs)), 1), "min": round(float(errs.min()), 1),
                                             "max": round(float(errs.max()), 1), "p95_abs": round(float(np.percentile(np.abs(errs), 95)), 1)}}))
