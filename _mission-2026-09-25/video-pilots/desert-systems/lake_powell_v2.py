"""Pilot B v2: "Three years of Lake Powell, turned into sound" as a story (16:9) and a Short (9:16).

  python lake_powell_v2.py <csv> <fonts dir> <out dir> [--only long|short] [--final]

Same data as v1 (USGS 09379900 daily lake elevation, Sep 25, 2023 to Sep 24, 2026). What changed:
* A story without a voice: the three years are cut into seven data segments (the lake falls, a spring
  refills it, it falls again ...). Each segment gets an on-screen beat with a live counter, and its
  result stays on the chart, so the end frame reads as a staircase: each spring added less
  (+29.2, +4.1, +2.0 ft) while each drain took more. Every number is computed here from the CSV
  (definitions in facts()) and written to <out>.json for review/verify_powell.py.
* The drawing slows down at the short springs, the 3,525 ft crossing and the low point, so each
  beat is on screen long enough to read (the x axis stays linear in time; only the pen's speed changes).
* Sound a phone can play: v1's drone sat at 55-110 Hz (-44 dB on the phone model) and its lowest
  notes at 131-147 Hz. Now: mallets A3-G6 (one per data week, pitch = level), a drone whose partials
  reach 880 Hz (loudness = feet above 3,490), a chime on each week the lake rose, a low gong at the
  3,525 ft crossing, New Year bells. Mallets pan left to right with the calendar (mono-safe).
Thresholds (3,490 ft minimum power pool; 3,525 ft protection target, 2019 drought plan) are
REPORTED Reclamation figures: check them on usbr.gov before any upload.
"""
import argparse
import json
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "review"))
from audio_check import MODELS, ebur128, master, phone_table, read_audio, speaker, stereo  # noqa: E402

SR, FPS = 48000, 30
MIN_POOL, TARGET = 3490.0, 3525.0
BG, INK, MUTED, WATER, AMBER, LINE = (11, 26, 36), (234, 242, 245), (150, 172, 184), (98, 210, 232), (242, 165, 65), (159, 179, 191)
DROP, GRID, YEARL = (244, 128, 108), (19, 48, 63), (27, 58, 76)
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def signed(x, fmt=",.1f"):
    """+29.2 / −55.8 with a real minus sign (U+2212; both Plex fonts carry it)."""
    return ("+" if x >= 0 else "−") + format(abs(x), fmt)


def en_date(d, year=True):
    return f"{d:%b} {d.day}, {d.year}" if year else f"{d:%b} {d.day}"


def es_date(d, year=True):
    return f"{d.day} {MONTHS_ES[d.month - 1]} {d.year}" if year else f"{d.day} {MONTHS_ES[d.month - 1]}"


# ---------------------------------------------------------------- data and facts
def load(csv):
    rows = [l.split(",") for l in Path(csv).read_text().splitlines() if l and not l.startswith("#") and not l.startswith("date")]
    days = [date.fromisoformat(a) for a, _ in rows]
    vals = np.array([float(b) for _, b in rows])
    assert all((b - a).days == 1 for a, b in zip(days, days[1:])), "gaps or duplicate days in the CSV"
    return days, vals


def facts(days, vals):
    """Every number the videos show. Definitions:
    spring rise (year Y): the largest climb from the running low, days Mar 1-Jul 31 of Y; low and peak
      dates are the first days at those values.
    segments: the lake between consecutive turning points: start -> 2024 low -> 2024 peak -> 2025
      low -> 2025 peak -> 2026 low -> 2026 peak -> record low; each change is end minus start.
    crossing: first day below 3,525 ft.  record low: the minimum of the series (first day)."""
    idx = {d: i for i, d in enumerate(days)}
    springs = {}
    for Y in (2024, 2025, 2026):
        i0, i1 = idx[date(Y, 3, 1)], idx[date(Y, 7, 31)]
        best = None
        lo_i = i0
        for j in range(i0, i1 + 1):
            if vals[j] < vals[lo_i]:
                lo_i = j
            rise = vals[j] - vals[lo_i]
            if best is None or rise > best[0] + 1e-9:
                best = (rise, lo_i, j)
        rise, lo_i, pk_i = best
        springs[Y] = {"low_i": lo_i, "peak_i": pk_i, "rise": round(vals[pk_i] - vals[lo_i], 1)}
    low_i = int(np.argmin(vals))
    cross_i = next(i for i in range(len(vals)) if vals[i] < TARGET)
    turns = [0, springs[2024]["low_i"], springs[2024]["peak_i"], springs[2025]["low_i"], springs[2025]["peak_i"],
             springs[2026]["low_i"], springs[2026]["peak_i"], low_i]
    segs = [{"a": a, "b": b, "change": round(vals[b] - vals[a], 1)} for a, b in zip(turns, turns[1:])]
    return {"n": len(vals), "first": 0, "last": len(vals) - 1, "springs": springs, "segments": segs, "low_i": low_i, "cross_i": cross_i,
            "change": round(vals[-1] - vals[0], 1), "buffer_start": round(vals[0] - MIN_POOL, 1), "buffer_end": round(vals[-1] - MIN_POOL, 1),
            "buffer_low": round(vals[low_i] - MIN_POOL, 1), "rebound": round(vals[-1] - vals[low_i], 1)}


SEG_TEXT = [  # en, es (one per segment, in order)
    ("Fall and winter: the lake falls", "Otoño e invierno: el lago baja"),
    ("Spring 2024: runoff refills it", "Primavera 2024: el deshielo lo sube"),
    ("Then it falls again", "Luego vuelve a bajar"),
    ("Spring 2025: a small refill", "Primavera 2025: sube un poco"),
    ("Down again, until May 2026", "Baja otra vez, hasta mayo de 2026"),
    ("Spring 2026: barely a bump", "Primavera 2026: casi nada"),
    ("Summer 2026: the lowest in this record", "Verano 2026: lo más bajo del registro"),
]


# ---------------------------------------------------------------- timeline (pen speed)
def timeline(days, F, draw_s):
    """Seconds spent drawing each day: uniform, plus slow-downs where the story needs reading time."""
    n = len(days)
    w = np.ones(n)
    sp = F["springs"]
    boosts = [(sp[2024]["low_i"], sp[2024]["peak_i"], 1.9), (sp[2025]["low_i"], sp[2025]["peak_i"], 3.2),
              (sp[2026]["low_i"], sp[2026]["peak_i"], 5.5), (F["cross_i"] - 6, F["cross_i"] + 6, 5.0), (F["low_i"] - 8, n - 1, 4.0)]
    for a, b, k in boosts:
        w[max(0, a):min(n, b + 1)] *= k
    dt = w / w.sum() * draw_s
    t_end = np.cumsum(dt)                # the pen reaches day i at t_end[i] (relative to drawing start)
    return t_end - dt[0], dt


# ---------------------------------------------------------------- sound
def mallet(f0, L, sr=SR):
    t = np.arange(L) / sr
    return (np.sin(2 * np.pi * f0 * t) + 0.22 * np.sin(2 * np.pi * 2 * f0 * t) * np.exp(-t * 9)
            + 0.28 * np.sin(2 * np.pi * 3 * f0 * t) * np.exp(-t * 16)) * np.exp(-t * 4.0) * (1 - np.exp(-t * 900))


def bell(freqs, amps, decay, L, sr=SR):
    t = np.arange(L) / sr
    return sum(a * np.sin(2 * np.pi * f * t) for f, a in zip(freqs, amps)) * np.exp(-t * decay) * (1 - np.exp(-t * 600))


def sound(days, vals, F, T):
    """Stems (mono or stereo) for one timeline T = {'total', 'draw0', 'pen_t' (abs s per day), 'hook_end'}."""
    n_s = int(T["total"] * SR)
    t_all = np.arange(n_s) / SR
    pen = T["pen_t"]
    stems = {k: np.zeros((n_s, 2)) for k in ("mallets", "chimes", "drone", "bells", "gong")}
    # drone: loudness follows the feet above 3,490 at the pen (cold open: today's level, then rewinds)
    buf = vals - MIN_POOL
    level = np.interp(t_all, pen, buf, left=buf[0], right=buf[-1])
    hook = t_all < T["draw0"]
    level[hook] = np.interp(t_all[hook], [0, T["hook_end"], T["draw0"]], [buf[-1], buf[-1], buf[0]])
    amp = 0.015 + 0.2 * np.clip(level / 90, 0, 1)
    fade = np.clip(t_all / 1.2, 0, 1) * np.clip((T["total"] - t_all) / 2.5, 0, 1)
    parts = [(55.0, 1.0), (110.0, 0.7), (165.0, 0.45), (220.0, 0.5), (330.0, 0.33), (440.0, 0.3), (660.0, 0.16), (880.0, 0.1)]
    lfo = 1 + 0.08 * np.sin(2 * np.pi * 0.11 * t_all)
    dr = sum(a * np.sin(2 * np.pi * f * t_all + 0.7 * k) for k, (f, a) in enumerate(parts)) / 2.2 * amp * fade * lfo
    stems["drone"][:] = dr[:, None]
    # mallets: one per data week, pitch = level on A minor pentatonic A3..G6, panned with the calendar
    scale = [220 * 2 ** (s / 12) for o in range(3) for s in (0 + 12 * o, 3 + 12 * o, 5 + 12 * o, 7 + 12 * o, 10 + 12 * o)]
    lo, hi = 3505.0, 3590.0
    L = int(0.9 * SR)
    weeks = list(range(0, len(vals), 7))
    for j, i in enumerate(weeks):
        k = int(np.clip((vals[i] - lo) / (hi - lo), 0, 0.999) * len(scale))
        s0 = int(pen[i] * SR)
        e = min(n_s, s0 + L)
        pan = -0.6 + 1.2 * i / (len(vals) - 1)
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        tone = mallet(scale[k], L) * 0.2
        stems["mallets"][s0:e, 0] += tone[: e - s0] * gl
        stems["mallets"][s0:e, 1] += tone[: e - s0] * gr
        if j and vals[i] - vals[weeks[j - 1]] > 0.05:      # the lake rose this week
            ch = bell([scale[k] * 4, scale[k] * 6.01], [1.0, 0.35], 5.5, L) * 0.18
            stems["chimes"][s0:e, 0] += ch[: e - s0] * gl
            stems["chimes"][s0:e, 1] += ch[: e - s0] * gr
    for i, d in enumerate(days):                             # New Year bells
        if d.month == 1 and d.day == 1:
            s0, Lb = int(pen[i] * SR), int(1.6 * SR)
            e = min(n_s, s0 + Lb)
            stems["bells"][s0:e] += bell([880, 1318.5], [1, 0.5], 2.6, Lb)[: e - s0, None] * 0.12
    s0, Lg = int(pen[F["cross_i"]] * SR), int(3.5 * SR)       # the 3,525 ft crossing: a low gong
    e = min(n_s, s0 + Lg)
    stems["gong"][s0:e] += bell([196.0, 523.3, 880.0, 1174.7], [1, 0.45, 0.25, 0.12], 1.3, Lg)[: e - s0, None] * 0.16
    # last word: the final level, once more, after the pen stops
    k = int(np.clip((vals[-1] - lo) / (hi - lo), 0, 0.999) * len(scale))
    s0 = int((T["draw_end"] + 0.6) * SR)
    e = min(n_s, s0 + L)
    stems["mallets"][s0:e] += mallet(scale[k], L)[: e - s0, None] * 0.2
    return stems


def write_wav(path, x):
    import wave
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1 - 1 / 32768) * 32767).round().astype("<i2").tobytes())


# ---------------------------------------------------------------- drawing helpers
class Fonts:
    def __init__(self, d):
        self.d = Path(d)
        self.cache = {}

    def __call__(self, weight, size):
        key = (weight, size)
        if key not in self.cache:
            name = {"r": "IBMPlexSansCondensed-400.ttf", "s": "IBMPlexSansCondensed-600.ttf", "b": "IBMPlexSansCondensed-700.ttf",
                    "m": "IBMPlexMono-500.ttf"}[weight]
            self.cache[key] = ImageFont.truetype(str(self.d / name), size)
        return self.cache[key]


def mixc(a, b, k):
    return tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3))


class Chart:
    """Chart geometry plus persistent 2x-supersampled masks for the fill and the curve; the masks are
    opaque (no alpha build-up where slices meet) and are downscaled each frame for antialiasing."""

    def __init__(self, box, days, vals, ylo=3480.0, yhi=3600.0, ss=2):
        self.x0, self.y0, self.x1, self.y1 = box
        self.days, self.vals, self.ylo, self.yhi, self.ss = days, vals, ylo, yhi, ss
        self.n = len(vals)
        self.w, self.h = self.x1 - self.x0, self.y1 - self.y0
        self.fill = Image.new("L", (self.w * ss, self.h * ss), 0)
        self.line = Image.new("L", (self.w * ss, self.h * ss), 0)
        self.drawn = 0

    def X(self, i):
        return self.x0 + self.w * i / (self.n - 1)

    def Y(self, v):
        return self.y1 - self.h * (v - self.ylo) / (self.yhi - self.ylo)

    def advance(self, upto, width_px):
        if upto <= self.drawn and self.drawn:
            return
        s = self.ss
        pts = [((self.X(i) - self.x0) * s, (self.Y(self.vals[i]) - self.y0) * s) for i in range(max(0, self.drawn - 1), upto + 1)]
        base = (self.Y(MIN_POOL) - self.y0) * s
        df, dl = ImageDraw.Draw(self.fill), ImageDraw.Draw(self.line)
        df.polygon(pts + [(pts[-1][0], base), (pts[0][0], base)], fill=255)
        if len(pts) > 1:
            dl.line(pts, fill=255, width=width_px * s, joint="curve")
        self.drawn = upto

    def layers(self, alpha=1.0):
        size = (self.w, self.h)
        fm = self.fill.resize(size, Image.LANCZOS).point(lambda v: int(v * 0.16 * alpha))
        lm = self.line.resize(size, Image.LANCZOS).point(lambda v: int(v * alpha))
        fl = Image.new("RGBA", size, WATER + (0,))
        fl.putalpha(fm)
        ln = Image.new("RGBA", size, WATER + (0,))
        ln.putalpha(lm)
        return fl, ln


def wrap2(d, text, font, maxw):
    """One line if it fits, else the most even two-line split (never a lone last word)."""
    if d.textlength(text, font=font) <= maxw:
        return [text]
    words, best = text.split(" "), None
    for k in range(1, len(words)):
        a, b = " ".join(words[:k]), " ".join(words[k:])
        wa, wb = d.textlength(a, font=font), d.textlength(b, font=font)
        if max(wa, wb) <= maxw:
            sc = abs(wa - wb) + (500 if k == len(words) - 1 else 0) - (200 if a[-1] in ":.," else 0)
            if best is None or sc < best[0]:
                best = (sc, [a, b])
    if best is None:
        raise ValueError(f"does not fit in two lines of {maxw}px: {text!r}")
    return best[1]


class Labels:
    """Places persistent chart labels once, avoiding the whole final curve, the chart edges and each
    other; tries positions in order of preference and moves further out if needed."""

    def __init__(self, ch, d, reserved=()):
        self.ch, self.d, self.boxes = ch, d, [tuple(b) for b in reserved]
        xs = np.array([ch.X(i) for i in range(ch.n)])
        ys = np.array([ch.Y(v) for v in ch.vals])
        self.curve = (xs, ys)

    def free(self, box, pad=9):
        x0, y0, x1, y1 = box
        ch = self.ch
        if x0 < ch.x0 + 2 or x1 > ch.x1 - 2 or y0 < ch.y0 + 2 or y1 > ch.Y(MIN_POOL) - 4:
            return False
        xs, ys = self.curve
        m = (xs >= x0 - pad) & (xs <= x1 + pad)
        if np.any((ys[m] >= y0 - pad - 4) & (ys[m] <= y1 + pad + 4)):
            return False
        return not any(x0 < b[2] + pad and x1 > b[0] - pad and y0 < b[3] + pad and y1 > b[1] + pad for b in self.boxes)

    def place(self, text, font, x, y, prefer):
        for dist in (0, 14, 30, 50, 80, 120, 170):
            for anchor, dx, dy in prefer:
                ax, ay = x + dx * (1 + dist / 20), y + dy * (1 + dist / 20)
                box = self.d.textbbox((ax, ay), text, font=font, anchor=anchor)
                if self.free(box):
                    self.boxes.append(box)
                    return ax, ay, anchor
        raise ValueError(f"no room for chart label {text!r}")


# ---------------------------------------------------------------- one video
def render(kind, days, vals, F, fonts, out, final):
    long = kind == "long"
    W, H = (1920, 1080) if long else (1080, 1920)
    if long:
        hook_s, legend_s, draw_s, end_s = 3.4, 3.4, 56.0, 8.0
        box = (110, 430, 1600, 950)
        head_xy, beat_xy, beat_w = (110, 118), (960, 108), 900
    else:
        hook_s, legend_s, draw_s, end_s = 2.6, 2.6, 32.0, 6.0
        box = (70, 800, 900, 1330)
        head_xy, beat_xy, beat_w = (60, 196), (60, 470), 860
    draw0 = hook_s + legend_s
    total = draw0 + draw_s + end_s
    rel, _ = timeline(days, F, draw_s)
    pen_t = draw0 + rel
    T = {"total": total, "draw0": draw0, "hook_end": hook_s, "pen_t": pen_t, "draw_end": draw0 + draw_s}
    n = F["n"]
    fs = fonts
    manifest = {"kind": kind, "size": [W, H], "seconds": total, "timeline": {"hook_s": hook_s, "legend_s": legend_s, "draw_s": draw_s, "end_s": end_s},
                "text": [], "beats": [], "chart_labels": [], "frames": []}
    said = manifest["text"]

    # ---- sound
    stems = sound(days, vals, F, T)
    mix = sum(stems.values())
    target = -14.5 if long else -14.0
    y, gain_db, lim = master(mix, target, -1.6)
    wav = out.with_suffix(".wav")
    write_wav(wav, y)
    g = 10 ** (gain_db / 20)
    manifest["audio"] = {"target_LUFS": target, "wav": ebur128(wav), "normalize_dB": round(gain_db, 2),
                         "limiter_max_reduction_dB": round(float(20 * np.log10(lim.min())), 2), "stereo": stereo(read_audio(wav)),
                         "phone": {m: ebur128(speaker(read_audio(wav), m)) for m in MODELS},
                         "stems": phone_table(read_audio(wav), {k: v * g for k, v in stems.items() if np.abs(v).max() > 0})}

    # ---- static layers: `plain` (intro: background, kicker, source line) and `base` (plain + the chart)
    plain = Image.new("RGB", (W, H), BG)
    base = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(base)
    ch = Chart(box, days, vals)
    reserved = []
    lab = fs("m", 26 if long else 24)
    for v in range(3480, 3601, 20):
        yv = ch.Y(v)
        d.line([(ch.x0, yv), (ch.x1, yv)], fill=GRID, width=1)
        if long:
            d.text((ch.x1 + 18, yv), f"{v:,}", font=lab, fill=MUTED, anchor="lm")
    # (the Short has no y-axis labels: the headline carries the level, and the chart stays uncluttered)
    for i, dd in enumerate(days):
        if dd.month == 1 and dd.day == 1:
            d.line([(ch.X(i), ch.y0 - 6), (ch.X(i), ch.y1)], fill=YEARL, width=2)
            d.text((ch.X(i) + 8, ch.y0 - 8), str(dd.year), font=lab, fill=MUTED, anchor="lb")
    d.line([(ch.x0, ch.Y(MIN_POOL)), (ch.x1, ch.Y(MIN_POOL))], fill=AMBER, width=3)
    tl = fs("s", 30 if long else 26)
    t_pool = "3,490 ft · minimum power pool" if long else "3,490 ft · min. power pool"
    d.text((ch.x0 + 8, ch.Y(MIN_POOL) + 8), t_pool, font=tl, fill=AMBER, anchor="la")
    for xx in range(int(ch.x0), int(ch.x1), 14):
        d.line([(xx, ch.Y(TARGET)), (xx + 6, ch.Y(TARGET))], fill=LINE, width=2)
    t_target = "3,525 ft · protection target"
    d.text((ch.x0 + 8, ch.Y(TARGET) - 8), t_target, font=tl, fill=LINE, anchor="lb")
    reserved.append(d.textbbox((ch.x0 + 8, ch.Y(TARGET) - 8), t_target, font=tl, anchor="lb"))
    label_boxes = [d.textbbox((ch.x0 + 8, ch.Y(TARGET) - 8), t_target, font=tl, anchor="lb")]
    said += [t_pool, t_target]
    for layer in (base, plain):
        dl = ImageDraw.Draw(layer)
        dl.text((110 if long else 60, 56 if long else 150), "DESERT SYSTEMS, SONIFIED", font=fs("s", 30 if long else 26), fill=MUTED)
        if long:
            foot = [f"Data: USGS 09379900, Lake Powell at Glen Canyon Dam, daily elevation (provisional), {en_date(days[0])} to {en_date(days[-1])}.",
                    "Thresholds: U.S. Bureau of Reclamation. Chart and sound made in code, no recordings."]
            dl.text((110, 1000), foot[0], font=fs("r", 24), fill=MUTED)
            dl.text((110, 1032), foot[1], font=fs("r", 24), fill=MUTED)
        else:
            foot = ["Data: USGS 09379900 (provisional),", f"{en_date(days[0])} to {en_date(days[-1])}. Sound made in code."]
            dl.text((60, 1392), foot[0], font=fs("r", 28), fill=MUTED)
            dl.text((60, 1428), foot[1], font=fs("r", 28), fill=MUTED)
        if not final:
            dl.text((W - 40, 56) if long else (60, 1880), "PRIVATE PILOT v2 · NOT PUBLISHED", font=fs("m", 20), fill=(70, 92, 104),
                    anchor="ra" if long else "la")
    for t_ in foot:
        if d.textlength(t_, font=fs("r", 24 if long else 28)) > W - 2 * (110 if long else 60):
            raise ValueError(f"source line too long: {t_!r}")
    said += foot

    # ---- story beats and the labels they leave on the chart (placed once, avoiding curve and each other)
    beats = []
    for k, (sg, (en, es)) in enumerate(zip(F["segments"], SEG_TEXT)):
        beats.append({"k": k, "a": sg["a"], "b": sg["b"], "change": sg["change"], "en": en, "es": es, "t0": pen_t[sg["a"]], "t1": pen_t[sg["b"]]})
        manifest["beats"].append({"en": en, "es": es, "from": str(days[sg["a"]]), "to": str(days[sg["b"]]), "change": sg["change"],
                                  "final_counter": f"{signed(sg['change'])} ft", "on_screen_s": [round(pen_t[sg["a"]], 2), round(pen_t[sg["b"]], 2)]})
    L = Labels(ch, d, reserved)
    lf = fs("b", 44 if long else 38)
    sf = fs("s", 30 if long else 26)
    up = [("mb", 0, -16), ("lb", 10, -16), ("rb", -10, -16), ("mt", 0, 22)]
    down = [("mt", 0, 30), ("lt", 10, 30), ("rt", -10, 30), ("mb", 0, -22)]
    placed = []
    for b in beats:
        if b["change"] >= 0:
            x, yv, pref = ch.X(b["b"]), ch.Y(vals[b["b"]]), up
        else:
            mid = (b["a"] + b["b"]) // 2
            x, yv, pref = ch.X(mid), ch.Y(vals[mid]), down
        placed.append((b["b"], signed(b["change"]), lf, WATER if b["change"] >= 0 else DROP, L.place(signed(b["change"]), lf, x, yv, pref)))
    ci, li = F["cross_i"], F["low_i"]
    cross_label = "below 3,525 ft"
    low_label = f"{vals[li]:,.1f} ft · {en_date(days[li], year=False)} · lowest"
    placed.append((ci, cross_label, sf, LINE, L.place(cross_label, sf, ch.X(ci), ch.Y(TARGET), [("rb", -12, -12), ("lb", 12, -12), ("rt", -12, 12)])))
    placed.append((li, low_label, sf, INK, L.place(low_label, sf, ch.X(li), ch.Y(vals[li]), [("rt", -14, 18), ("rb", -14, -18), ("mt", 0, 24)])))
    manifest["chart_labels"] = [t for _, t, _, _, _ in placed]

    # ---- frames
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", str(wav), "-map", "0:v", "-map", "1:a", "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-tune", "animation",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{total:.3f}", "-movflags", "+faststart", str(out)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frames = int(round(total * FPS))
    still_at = {int(x * FPS): name for name, x in (("hook", 1.6), ("legend", hook_s + 2.0), ("spring24", pen_t[beats[1]["b"]] + 0.4),
                                                    ("drain25", pen_t[beats[4]["a"]] + 4.0), ("cross", pen_t[ci] + 1.0), ("end", total - 1.0))}
    big, sub = fs("b", 136 if long else 120), fs("r", 38 if long else 36)
    bt_en, bt_es, bt_num = fs("b", 54 if long else 50), fs("r", 38 if long else 36), fs("b", 92 if long else 84)
    wraps = {}

    def lines(text, font, width):
        key = (text, font.size)
        if key not in wraps:
            wraps[key] = wrap2(d, text, font, width)
        return wraps[key]

    def once(*texts):
        for t_ in texts:
            if t_ not in said:
                said.append(t_)

    for f in range(frames):
        t = (f + 0.5) / FPS
        if t < draw0:
            im = plain.copy()
        elif t < draw0 + 0.5:
            im = Image.blend(plain, base, (t - draw0) / 0.5)
        else:
            im = base.copy()
        dr = ImageDraw.Draw(im)
        rec = {"f": f}
        if t < draw0:
            cx = 110 if long else 60
            if t < hook_s:                                   # cold open: where the lake is today
                col = lambda c: mixc(BG, c, min(1.0, t / 0.35))
                y0 = 250 if long else 360
                s1 = f"{F['buffer_end']:,.1f} ft"
                date_line = f"Lake Powell · {en_date(days[-1])}"
                dr.text((cx, y0 - (72 if long else 66)), date_line, font=fs("s", 44 if long else 40), fill=col(MUTED))
                dr.text((cx, y0), s1, font=fs("b", 250 if long else 210), fill=col(AMBER))
                yy = y0 + (290 if long else 250)
                en_l = lines("of water left above the level Glen Canyon Dam needs to make power", fs("s", 56 if long else 50), W - 2 * cx)
                for ln in en_l:
                    dr.text((cx, yy), ln, font=fs("s", 56 if long else 50), fill=col(INK))
                    yy += 68 if long else 62
                es_l = lines("de agua sobre el nivel que la presa Glen Canyon necesita para generar energía", fs("r", 38 if long else 36), W - 2 * cx)
                for ln in es_l:
                    dr.text((cx, yy + 10), ln, font=fs("r", 38 if long else 36), fill=col(MUTED))
                    yy += 48 if long else 46
                rec["hook"] = s1
                once(date_line, s1, *en_l, *es_l)
            else:                                            # the rules of the sound
                col = lambda c: mixc(BG, c, min(1.0, (t - hook_s) / 0.35))
                yy = 250 if long else 400
                h1 = "How did it get here?"
                dr.text((cx, yy), h1, font=fs("b", 96 if long else 84), fill=col(INK))
                yy += 136 if long else 124
                rules = [("One note per week of data.", "Una nota por cada semana de datos."), ("Higher note = higher lake.", "Nota más alta = lago más alto."),
                         ("Chime = a week the lake rose.", "Campanita = una semana en que subió."),
                         ("Hum = water above the 3,490 ft line.", "Zumbido = agua sobre la línea de 3,490 pies.")]
                for en, es in rules:
                    dr.text((cx, yy), en, font=fs("s", 50 if long else 46), fill=col(INK))
                    if long:
                        dr.text((cx + 900, yy + 10), es, font=fs("r", 36), fill=col(MUTED))
                        yy += 76
                    else:
                        dr.text((cx, yy + 58), es, font=fs("r", 34), fill=col(MUTED))
                        yy += 122
                once(h1, *[x for r in rules for x in r])
        else:
            i = int(np.clip(np.searchsorted(pen_t, t, side="right") - 1, 0, n - 1))
            ch.advance(i, 5)
            fl, ln = ch.layers(min(1.0, (t - draw0) / 0.4))
            im.paste(fl, (ch.x0, ch.y0), fl)
            im.paste(ln, (ch.x0, ch.y0), ln)
            dr = ImageDraw.Draw(im)
            for day_i, text, font, colr, (lx, ly, anc) in placed:
                if i >= day_i:
                    dr.text((lx, ly), text, font=font, fill=colr, anchor=anc)
            if i >= ci:
                xc, yc = ch.X(ci), ch.Y(TARGET)
                dr.ellipse([xc - 7, yc - 7, xc + 7, yc + 7], outline=LINE, width=3)
            xp, yp = ch.X(i), ch.Y(vals[i])
            # the water left above 3,490 (a vertical bracket), broken where it would cross a threshold label
            y_a, y_b = yp + 14, ch.Y(MIN_POOL) - 2
            gaps = sorted((bb[1] - 4, bb[3] + 4) for bb in label_boxes if bb[0] - 4 <= xp <= bb[2] + 4)
            for g0, g1 in gaps + [(y_b, y_b)]:
                if g0 > y_a:
                    dr.line([(xp, y_a), (xp, min(g0, y_b))], fill=AMBER, width=3)
                y_a = max(y_a, g1)
            dr.ellipse([xp - 11, yp - 11, xp + 11, yp + 11], fill=WATER, outline=BG, width=3)
            hx, hy = head_xy
            s_big, s_date = f"{vals[i]:,.1f} ft", f"Lake Powell · {en_date(days[i])}"
            s_buf = f"{vals[i] - MIN_POOL:,.1f} ft above the minimum power pool"
            dr.text((hx, hy), s_big, font=big, fill=INK)
            dr.text((hx, hy + (156 if long else 140)), s_date, font=sub, fill=MUTED)
            dr.text((hx, hy + (204 if long else 186)), s_buf, font=sub, fill=AMBER)
            rec.update({"day": i, "date": str(days[i]), "big": s_big, "date_text": s_date, "buffer_text": s_buf})
            bx, by = beat_xy
            if t < draw0 + draw_s + 0.2:                     # the running segment, with a live counter
                cur = next((b for b in beats if b["a"] <= i < b["b"]), beats[-1])
                run = vals[min(i, cur["b"])] - vals[cur["a"]]
                a3 = min(1.0, (t - cur["t0"]) / 0.3) if cur["k"] else 1.0
                colr = WATER if cur["change"] >= 0 else DROP
                yy = by
                for ln_ in lines(cur["en"], bt_en, beat_w):
                    dr.text((bx, yy), ln_, font=bt_en, fill=mixc(BG, INK, a3))
                    yy += 62 if long else 58
                ctr = signed(run) + " ft"
                dr.text((bx, yy + 4), ctr, font=bt_num, fill=mixc(BG, colr, a3))
                yy += 110 if long else 100
                for ln_ in lines(cur["es"], bt_es, beat_w):
                    dr.text((bx, yy), ln_, font=bt_es, fill=mixc(BG, MUTED, a3))
                    yy += 46
                rec.update({"beat": cur["k"], "counter": ctr, "counter_from_day": cur["a"], "counter_to_day": min(i, cur["b"])})
                once(cur["en"], cur["es"])
            else:                                            # end card, in the same block (the chart stays visible)
                a4 = min(1.0, (t - draw0 - draw_s - 0.2) / 0.5)
                sp = F["springs"]
                e1 = "Each spring added less:"
                e2 = f"{signed(sp[2024]['rise'])} → {signed(sp[2025]['rise'])} → {signed(sp[2026]['rise'])} ft"
                e3 = f"Three years: {signed(F['change'])} ft"
                e4 = f"Cada primavera sumó menos. Tres años: {signed(F['change'])} pies."
                yy = by
                dr.text((bx, yy), e1, font=bt_en, fill=mixc(BG, INK, a4))
                dr.text((bx, yy + (64 if long else 60)), e2, font=fs("b", 72 if long else 64), fill=mixc(BG, WATER, a4))
                dr.text((bx, yy + (152 if long else 142)), e3, font=fs("b", 54 if long else 50), fill=mixc(BG, DROP, a4))
                yy += 222 if long else 208
                for ln_ in lines(e4, bt_es, beat_w):
                    dr.text((bx, yy), ln_, font=bt_es, fill=mixc(BG, MUTED, a4))
                    yy += 46
                rec["end"] = [e1, e2, e3, e4]
                once(e1, e2, e3, e4)
        manifest["frames"].append(rec)
        p.stdin.write(im.tobytes())
        if f in still_at:
            im.save(out.with_name(f"{out.stem}-still-{still_at[f]}.jpg"), quality=90)
    p.stdin.close()
    if p.wait():
        raise SystemExit("ffmpeg failed")
    manifest["mp4"] = ebur128(out)
    out.with_suffix(".json").write_text(json.dumps(manifest, indent=0, ensure_ascii=False) + "\n")
    print(json.dumps({"out": str(out), "seconds": total, "mp4": manifest["mp4"], "wav": manifest["audio"]["wav"],
                      "beats_on_screen_s": [round(b["t1"] - b["t0"], 1) for b in beats]}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("fonts")
    ap.add_argument("outdir")
    ap.add_argument("--only", choices=["long", "short"])
    ap.add_argument("--final", action="store_true", help="drop the private-pilot mark (only after Carlos approves an upload)")
    a = ap.parse_args()
    days, vals = load(a.csv)
    F = facts(days, vals)
    out = Path(a.outdir)
    out.mkdir(parents=True, exist_ok=True)
    fonts = Fonts(a.fonts)
    facts_out = {"source": "USGS 09379900 daily lake elevation (provisional), as cached in the X bot fixture", "rows": F["n"],
                 "first": [str(days[0]), vals[0]], "last": [str(days[-1]), vals[-1]], "definitions": facts.__doc__,
                 "springs": {Y: {"low": [str(days[s["low_i"]]), vals[s["low_i"]]], "peak": [str(days[s["peak_i"]]), vals[s["peak_i"]]], "rise": s["rise"]}
                             for Y, s in F["springs"].items()},
                 "segments": [{"from": [str(days[s["a"]]), vals[s["a"]]], "to": [str(days[s["b"]]), vals[s["b"]]], "change": s["change"]} for s in F["segments"]],
                 "first_below_3525": [str(days[F["cross_i"]]), vals[F["cross_i"]]], "record_low": [str(days[F["low_i"]]), vals[F["low_i"]]],
                 "three_year_change": F["change"], "buffer_start": F["buffer_start"], "buffer_end": F["buffer_end"], "buffer_low": F["buffer_low"],
                 "rebound_after_low": F["rebound"]}
    (out / "lake-powell-v2-facts.json").write_text(json.dumps(facts_out, indent=1, default=float) + "\n")
    for kind in (["long", "short"] if not a.only else [a.only]):
        name = "lake-powell-v2.mp4" if kind == "long" else "lake-powell-short-v2.mp4"
        render(kind, days, vals, F, fonts, out / name, a.final)


if __name__ == "__main__":
    main()
