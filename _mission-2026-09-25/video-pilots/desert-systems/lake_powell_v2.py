"""Pilot B v2: "Three years of Lake Powell, turned into sound" as a story (16:9) and a Short (9:16).

  python lake_powell_v2.py <csv> <fonts dir> <out dir> [--only long|short] [--final] [--encoder auto|nvenc|x264]
  python lake_powell_v2.py <csv> <fonts dir> <out dir> --layout-only      manifests only (no sound, no video): for
                                                                           review/overlap_check.py and the tests

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
Phase three (layout): every string is drawn through Ink, which records its bounding box, so the
manifest lists every text box on every frame (plus the pen, its bracket and the drawn curve), and
review/overlap_check.py fails the build on any collision or any text outside the format's safe area
(SAFE below). The chart-label placer had an interval bug (a new label could sit up to 9 px into the
one below it: "-11.3" under "below 3,525 ft" in the last frames); it is fixed and every static text
is now reserved space for the placer.
Thresholds (3,490 ft minimum power pool; 3,525 ft protection target, 2019 drought plan) are
REPORTED Reclamation figures: check them on usbr.gov before any upload.
"""
import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "review"))
sys.path.insert(0, str(HERE.parent))
from audio_check import MODELS, ebur128, master, phone_table, read_audio, speaker, stereo  # noqa: E402
import encode  # noqa: E402

SR, FPS = 48000, 30
MIN_POOL, TARGET = 3490.0, 3525.0
BG, INK, MUTED, WATER, AMBER, LINE = (11, 26, 36), (234, 242, 245), (150, 172, 184), (98, 210, 232), (242, 165, 65), (159, 179, 191)
DROP, GRID, YEARL = (244, 128, 108), (19, 48, 63), (27, 58, 76)
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

# Safe areas (x0, y0, x1, y1): no text may leave them (review/overlap_check.py keeps its own copy).
#  16:9  the 90% title-safe area (5% margins), broadcast practice (INFERENCE for YouTube: the player's
#        title bar, controls and captions sit at the edges).
#  9:16  YouTube Shorts: nothing in the top 10%, the bottom 25% or the right 10% (the Shorts UI: top
#        bar; title, channel and sound chip; the like/comment/share rail). REPORTED: Google's
#        vertical-video ad guidance as quoted in search results, 2026-09-26 (support.google.com is
#        blocked here). Plus a 5% left margin (INFERENCE).
SAFE = {(1920, 1080): (96, 54, 1824, 1026), (1080, 1920): (54, 192, 972, 1440)}

LAYOUT = {
    "long": {"size": (1920, 1080), "box": (110, 430, 1600, 950), "kicker": (110, 56), "mark": (1820, 56, "ra"),
             "head": (110, 118), "beat": (960, 108), "beat_w": 860, "hook_x": 110, "hook_w": 1700,
             "foot": [(110, 964), (110, 994)], "foot_size": 24},
    "short": {"size": (1080, 1920), "box": (70, 856, 900, 1330), "kicker": (60, 200), "mark": (960, 200, "ra"),
              "head": (60, 236), "beat": (60, 512), "beat_w": 860, "hook_x": 60, "hook_w": 900,
              "foot": [(60, 1352), (60, 1388)], "foot_size": 28},
}


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


MEASURE = ImageDraw.Draw(Image.new("RGB", (1, 1)))   # text boxes depend on font and anchor only


class Ink:
    """Draws a string (or only measures it, when there is nothing to draw on) and records its
    bounding box as [role, text, x0, y0, x1, y1]. Boxes are Pillow's ink boxes for the anchor used,
    i.e. exactly where the glyphs land."""

    def __init__(self):
        self.boxes = []

    def text(self, d, xy, s, font, fill, anchor="la", role="text"):
        if d is not None:
            d.text(xy, s, font=font, fill=fill, anchor=anchor)
        box = MEASURE.textbbox(xy, s, font=font, anchor=anchor)
        self.boxes.append([role, s, *[int(v) for v in box]])
        return box


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


def boxes_clash(a, b, pad):
    """True when boxes a and b (x0, y0, x1, y1) come closer than `pad` px on both axes."""
    return a[0] < b[2] + pad and a[2] > b[0] - pad and a[1] < b[3] + pad and a[3] > b[1] - pad


class Labels:
    """Places persistent chart labels once, avoiding the whole final curve, the chart edges, every
    static text and each other; tries positions in order of preference and moves further out if
    needed. (Phase three: the vertical test used `y1 > b[1] + pad`, which let a label sit up to `pad`
    px inside the one below it; boxes_clash() applies the pad on all four sides.)"""

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
        return not any(boxes_clash(box, b, pad) for b in self.boxes)

    def place(self, text, font, x, y, prefer, dists=(0, 14, 30, 50, 80, 120, 170)):
        for dist in dists:
            for anchor, dx, dy in prefer:
                ax, ay = x + dx * (1 + dist / 20), y + dy * (1 + dist / 20)
                box = self.d.textbbox((ax, ay), text, font=font, anchor=anchor)
                if self.free(box):
                    self.boxes.append(box)
                    return ax, ay, anchor
        raise ValueError(f"no room for chart label {text!r}")

    def place_along(self, text, font, points, prefer, dists=(0, 14, 30)):
        """A label that belongs to a stretch of the curve: try each (x, y) in `points` (in order of
        preference) close in, before moving any of them further out."""
        for ring in (dists, (50, 80, 120, 170)):
            for x, y in points:
                try:
                    return self.place(text, font, x, y, prefer, ring)
                except ValueError:
                    pass
        raise ValueError(f"no room for chart label {text!r}")


# ---------------------------------------------------------------- one video: plan, frames, render
class Plan:
    """Everything that is fixed for one video: timeline, static layers (with their text boxes), the
    chart, the placed labels and the wrapped strings. Frames are drawn from it (frame())."""

    def __init__(self, kind, days, vals, F, fonts, final):
        self.kind, self.days, self.vals, self.F, self.fs, self.final = kind, days, vals, F, fonts, final
        self.long = long = kind == "long"
        lay = self.lay = LAYOUT[kind]
        self.W, self.H = lay["size"]
        if long:
            self.hook_s, self.legend_s, self.draw_s, self.end_s = 3.4, 3.4, 56.0, 8.0
        else:
            self.hook_s, self.legend_s, self.draw_s, self.end_s = 2.6, 2.6, 32.0, 6.0
        self.draw0 = self.hook_s + self.legend_s
        self.total = self.draw0 + self.draw_s + self.end_s
        rel, _ = timeline(days, F, self.draw_s)
        self.pen_t = self.draw0 + rel
        self.T = {"total": self.total, "draw0": self.draw0, "hook_end": self.hook_s, "pen_t": self.pen_t, "draw_end": self.draw0 + self.draw_s}
        self.n = F["n"]
        self.said = []
        self.wraps = {}
        self._static()
        self._beats_and_labels()
        self.ci, self.li = F["cross_i"], F["low_i"]

    # ---- static layers: `plain` (intro: background, kicker, source line) and `base` (plain + the chart)
    def _static(self):
        long, fs, lay, W, H = self.long, self.fs, self.lay, self.W, self.H
        self.plain = Image.new("RGB", (W, H), BG)
        self.base = Image.new("RGB", (W, H), BG)
        d = self.d = ImageDraw.Draw(self.base)
        ch = self.ch = Chart(lay["box"], self.days, self.vals)
        self.ink_base, self.ink_plain = Ink(), Ink()
        lab = fs("m", 26 if long else 24)
        for v in range(3480, 3601, 20):
            yv = ch.Y(v)
            d.line([(ch.x0, yv), (ch.x1, yv)], fill=GRID, width=1)
            if long:
                self.ink_base.text(d, (ch.x1 + 18, yv), f"{v:,}", lab, MUTED, "lm", role="axis")
        # (the Short has no y-axis labels: the headline carries the level, and the chart stays uncluttered)
        for i, dd in enumerate(self.days):
            if dd.month == 1 and dd.day == 1:
                d.line([(ch.X(i), ch.y0 - 6), (ch.X(i), ch.y1)], fill=YEARL, width=2)
                self.ink_base.text(d, (ch.X(i) + 8, ch.y0 - 8), str(dd.year), lab, MUTED, "lb", role="year")
        d.line([(ch.x0, ch.Y(MIN_POOL)), (ch.x1, ch.Y(MIN_POOL))], fill=AMBER, width=3)
        tl = fs("s", 30 if long else 26)
        t_pool = "3,490 ft · minimum power pool" if long else "3,490 ft · min. power pool"
        self.ink_base.text(d, (ch.x0 + 8, ch.Y(MIN_POOL) + 8), t_pool, tl, AMBER, "la", role="threshold")
        for xx in range(int(ch.x0), int(ch.x1), 14):
            d.line([(xx, ch.Y(TARGET)), (xx + 6, ch.Y(TARGET))], fill=LINE, width=2)
        t_target = "3,525 ft · protection target"
        self.ink_base.text(d, (ch.x0 + 8, ch.Y(TARGET) - 8), t_target, tl, LINE, "lb", role="threshold")
        self.said += [t_pool, t_target]
        fsz = lay["foot_size"]
        if long:
            foot = [f"Data: USGS 09379900, Lake Powell at Glen Canyon Dam, daily elevation (provisional), {en_date(self.days[0])} to {en_date(self.days[-1])}.",
                    "Thresholds: U.S. Bureau of Reclamation. Chart and sound made in code, no recordings."]
        else:
            foot = ["Data: USGS 09379900 (provisional),", f"{en_date(self.days[0])} to {en_date(self.days[-1])}. Sound made in code."]
        for layer, ink in ((self.base, self.ink_base), (self.plain, self.ink_plain)):
            dl = ImageDraw.Draw(layer)
            ink.text(dl, lay["kicker"], "DESERT SYSTEMS, SONIFIED", fs("s", 30 if long else 26), MUTED, role="kicker")
            for xy, t_ in zip(lay["foot"], foot):
                ink.text(dl, xy, t_, fs("r", fsz), MUTED, role="source")
            if not self.final:
                mx, my, manc = lay["mark"]
                ink.text(dl, (mx, my), "PRIVATE PILOT v2 · NOT PUBLISHED", fs("m", 20), (70, 92, 104), manc, role="draft-mark")
        sx0, _, sx1, _ = SAFE[(W, H)]
        for t_ in foot:
            if d.textlength(t_, font=fs("r", fsz)) > sx1 - sx0:
                raise ValueError(f"source line too long: {t_!r}")
        self.said += foot

    # ---- story beats and the labels they leave on the chart (placed once, avoiding curve, static text and each other)
    def _beats_and_labels(self):
        long, fs, ch, vals, days, F = self.long, self.fs, self.ch, self.vals, self.days, self.F
        self.beats = []
        for k, (sg, (en, es)) in enumerate(zip(F["segments"], SEG_TEXT)):
            self.beats.append({"k": k, "a": sg["a"], "b": sg["b"], "change": sg["change"], "en": en, "es": es,
                               "t0": self.pen_t[sg["a"]], "t1": self.pen_t[sg["b"]]})
        L = Labels(ch, self.d, reserved=[b[2:] for b in self.ink_base.boxes])
        lf = fs("b", 44 if long else 38)
        sf = fs("s", 30 if long else 26)
        up = [("mb", 0, -16), ("lb", 10, -16), ("rb", -10, -16), ("mt", 0, 22)]
        down = [("mt", 0, 30), ("lt", 10, 30), ("rt", -10, 30), ("mb", 0, -22)]
        # Point labels first: each belongs to one spot (the ring on the 3,525 ft line, the record low),
        # so it may only move a little. Segment labels then search along their own stretch of curve.
        ci, li = F["cross_i"], F["low_i"]
        cross_label = "below 3,525 ft"
        low_label = f"{vals[li]:,.1f} ft · {en_date(days[li], year=False)} · lowest"
        cross_at = L.place(cross_label, sf, ch.X(ci), ch.Y(TARGET), [("rt", -12, 12), ("lt", 12, 12), ("lb", 12, -12), ("rb", -12, -12)],
                           dists=(0, 14, 30))
        low_at = L.place(low_label, sf, ch.X(li), ch.Y(vals[li]), [("rt", -14, 18), ("rb", -14, -18), ("mt", 0, 24)], dists=(0, 14, 30))
        placed = []
        for b in self.beats:
            if b["change"] >= 0:                         # a rise: over its peak
                pts, pref = [(ch.X(b["b"]), ch.Y(vals[b["b"]]))], up
            else:                                        # a drop: under its middle, else elsewhere along it
                span = b["b"] - b["a"]
                idx = [b["a"] + int(round(span * q)) for q in (0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8)]
                pts, pref = [(ch.X(i), ch.Y(vals[i])) for i in idx], down
            placed.append((b["b"], signed(b["change"]), lf, WATER if b["change"] >= 0 else DROP,
                           L.place_along(signed(b["change"]), lf, pts, pref), "chart-label"))
        placed.append((ci, cross_label, sf, LINE, cross_at, "chart-label"))
        placed.append((li, low_label, sf, INK, low_at, "chart-label"))
        self.placed = placed
        # the pen's bracket breaks around every text it could cross
        self.bracket_avoid = [b[2:] for b in self.ink_base.boxes if b[0] == "threshold"]
        self.label_boxes = {p[1]: self.d.textbbox((p[4][0], p[4][1]), p[1], font=p[2], anchor=p[4][2]) for p in placed}

    def lines(self, text, font, width):
        key = (text, font.size, width)
        if key not in self.wraps:
            self.wraps[key] = wrap2(self.d, text, font, width)
        return self.wraps[key]

    def once(self, *texts):
        for t_ in texts:
            if t_ not in self.said:
                self.said.append(t_)

    def frame(self, f, draw=True):
        """Frame f. Returns (image or None, record). The record holds the numbers verify_powell.py
        checks and, for overlap_check.py, the layer, every dynamic text box and the moving marks."""
        long, fs, lay, W, H, ch, vals, days, F = self.long, self.fs, self.lay, self.W, self.H, self.ch, self.vals, self.days, self.F
        t = (f + 0.5) / FPS
        draw0, hook_s = self.draw0, self.hook_s
        ink = Ink()
        rec = {"f": f}
        if t < draw0:
            layer = "plain"
            im = self.plain.copy() if draw else None
        elif t < draw0 + 0.5:
            layer = "blend"                                   # plain -> base: base's texts are a superset
            im = Image.blend(self.plain, self.base, (t - draw0) / 0.5) if draw else None
        else:
            layer = "base"
            im = self.base.copy() if draw else None
        dr = ImageDraw.Draw(im) if draw else None
        marks = []
        if t < draw0:
            cx = lay["hook_x"]
            if t < hook_s:                                   # cold open: where the lake is today
                col = lambda c: mixc(BG, c, min(1.0, t / 0.35))
                y0 = 250 if long else 360
                s1 = f"{F['buffer_end']:,.1f} ft"
                date_line = f"Lake Powell · {en_date(days[-1])}"
                ink.text(dr, (cx, y0 - (72 if long else 66)), date_line, fs("s", 44 if long else 40), col(MUTED), role="hook")
                ink.text(dr, (cx, y0), s1, fs("b", 250 if long else 210), col(AMBER), role="hook")
                yy = y0 + (290 if long else 250)
                en_l = self.lines("of water left above the level Glen Canyon Dam needs to make power", fs("s", 56 if long else 50), lay["hook_w"])
                for ln in en_l:
                    ink.text(dr, (cx, yy), ln, fs("s", 56 if long else 50), col(INK), role="hook")
                    yy += 68 if long else 62
                es_l = self.lines("de agua sobre el nivel que la presa Glen Canyon necesita para generar energía", fs("r", 38 if long else 36), lay["hook_w"])
                for ln in es_l:
                    ink.text(dr, (cx, yy + 10), ln, fs("r", 38 if long else 36), col(MUTED), role="hook")
                    yy += 48 if long else 46
                rec["hook"] = s1
                self.once(date_line, s1, *en_l, *es_l)
            else:                                            # the rules of the sound
                col = lambda c: mixc(BG, c, min(1.0, (t - hook_s) / 0.35))
                yy = 250 if long else 400
                h1 = "How did it get here?"
                ink.text(dr, (cx, yy), h1, fs("b", 96 if long else 84), col(INK), role="rules")
                yy += 136 if long else 124
                rules = [("One note per week of data.", "Una nota por cada semana de datos."), ("Higher note = higher lake.", "Nota más alta = lago más alto."),
                         ("Chime = a week the lake rose.", "Campanita = una semana en que subió."),
                         ("Hum = water above the 3,490 ft line.", "Zumbido = agua sobre la línea de 3,490 pies.")]
                for en, es in rules:
                    ink.text(dr, (cx, yy), en, fs("s", 50 if long else 46), col(INK), role="rules")
                    if long:
                        ink.text(dr, (cx + 900, yy + 10), es, fs("r", 36), col(MUTED), role="rules")
                        yy += 76
                    else:
                        ink.text(dr, (cx, yy + 58), es, fs("r", 34), col(MUTED), role="rules")
                        yy += 122
                self.once(h1, *[x for r in rules for x in r])
        else:
            i = int(np.clip(np.searchsorted(self.pen_t, t, side="right") - 1, 0, self.n - 1))
            if draw:
                ch.advance(i, 5)
                fl, ln = ch.layers(min(1.0, (t - draw0) / 0.4))
                im.paste(fl, (ch.x0, ch.y0), fl)
                im.paste(ln, (ch.x0, ch.y0), ln)
                dr = ImageDraw.Draw(im)
            rec["curve_upto"] = i
            visible_labels = []
            for day_i, text, font, colr, (lx, ly, anc), role in self.placed:
                if i >= day_i:
                    visible_labels.append(ink.text(dr, (lx, ly), text, font, colr, anc, role=role))
            if i >= self.ci:
                xc, yc = ch.X(self.ci), ch.Y(TARGET)
                if draw:
                    dr.ellipse([xc - 7, yc - 7, xc + 7, yc + 7], outline=LINE, width=3)
                marks.append(["cross-ring", xc - 8.5, yc - 8.5, xc + 8.5, yc + 8.5])
            xp, yp = ch.X(i), ch.Y(vals[i])
            # the water left above 3,490 (a vertical bracket), broken where it would cross any text
            y_a, y_b = yp + 14, ch.Y(MIN_POOL) - 2
            gaps = sorted((bb[1] - 4, bb[3] + 4) for bb in self.bracket_avoid + visible_labels if bb[0] - 4 <= xp <= bb[2] + 4)
            for g0, g1 in gaps + [(y_b, y_b)]:
                if g0 > y_a:
                    seg_end = min(g0, y_b)
                    if draw:
                        dr.line([(xp, y_a), (xp, seg_end)], fill=AMBER, width=3)
                    marks.append(["bracket", xp - 1.5, y_a, xp + 1.5, seg_end])
                y_a = max(y_a, g1)
            if draw:
                dr.ellipse([xp - 11, yp - 11, xp + 11, yp + 11], fill=WATER, outline=BG, width=3)
            marks.append(["pen", xp - 11, yp - 11, xp + 11, yp + 11])
            hx, hy = lay["head"]
            s_big, s_date = f"{vals[i]:,.1f} ft", f"Lake Powell · {en_date(days[i])}"
            s_buf = f"{vals[i] - MIN_POOL:,.1f} ft above the minimum power pool"
            big, sub = fs("b", 136 if long else 120), fs("r", 38 if long else 36)
            ink.text(dr, (hx, hy), s_big, big, INK, role="headline")
            ink.text(dr, (hx, hy + (156 if long else 140)), s_date, sub, MUTED, role="headline")
            ink.text(dr, (hx, hy + (204 if long else 186)), s_buf, sub, AMBER, role="headline")
            rec.update({"day": i, "date": str(days[i]), "big": s_big, "date_text": s_date, "buffer_text": s_buf})
            bx, by = lay["beat"]
            bt_en, bt_es, bt_num = fs("b", 54 if long else 50), fs("r", 38 if long else 36), fs("b", 92 if long else 84)
            if t < draw0 + self.draw_s + 0.2:                # the running segment, with a live counter
                cur = next((b for b in self.beats if b["a"] <= i < b["b"]), self.beats[-1])
                run = vals[min(i, cur["b"])] - vals[cur["a"]]
                a3 = min(1.0, (t - cur["t0"]) / 0.3) if cur["k"] else 1.0
                colr = WATER if cur["change"] >= 0 else DROP
                yy = by
                for ln_ in self.lines(cur["en"], bt_en, lay["beat_w"]):
                    ink.text(dr, (bx, yy), ln_, bt_en, mixc(BG, INK, a3), role="beat")
                    yy += 62 if long else 58
                ctr = signed(run) + " ft"
                ink.text(dr, (bx, yy + 4), ctr, bt_num, mixc(BG, colr, a3), role="counter")
                yy += 110 if long else 100
                for ln_ in self.lines(cur["es"], bt_es, lay["beat_w"]):
                    ink.text(dr, (bx, yy), ln_, bt_es, mixc(BG, MUTED, a3), role="beat")
                    yy += 46
                rec.update({"beat": cur["k"], "counter": ctr, "counter_from_day": cur["a"], "counter_to_day": min(i, cur["b"])})
                self.once(cur["en"], cur["es"])
            else:                                            # end card, in the same block (the chart stays visible)
                a4 = min(1.0, (t - draw0 - self.draw_s - 0.2) / 0.5)
                sp = F["springs"]
                e1 = "Each spring added less:"
                e2 = f"{signed(sp[2024]['rise'])} → {signed(sp[2025]['rise'])} → {signed(sp[2026]['rise'])} ft"
                e3 = f"Three years: {signed(F['change'])} ft"
                e4 = f"Cada primavera sumó menos. Tres años: {signed(F['change'])} pies."
                yy = by
                ink.text(dr, (bx, yy), e1, bt_en, mixc(BG, INK, a4), role="end")
                ink.text(dr, (bx, yy + (64 if long else 60)), e2, fs("b", 72 if long else 64), mixc(BG, WATER, a4), role="end")
                ink.text(dr, (bx, yy + (152 if long else 142)), e3, fs("b", 54 if long else 50), mixc(BG, DROP, a4), role="end")
                yy += 222 if long else 208
                for ln_ in self.lines(e4, bt_es, lay["beat_w"]):
                    ink.text(dr, (bx, yy), ln_, bt_es, mixc(BG, MUTED, a4), role="end")
                    yy += 46
                rec["end"] = [e1, e2, e3, e4]
                self.once(e1, e2, e3, e4)
        rec["layer"] = layer
        rec["texts"] = ink.boxes
        rec["marks"] = [[m[0]] + [round(v, 1) for v in m[1:]] for m in marks]
        return im, rec

    def plate(self):
        """The finished chart with no text at all (grid, thresholds, water, curve, pen): the thumbnail
        template's background, so a thumbnail never shows half-cropped labels."""
        ch = Chart(self.lay["box"], self.days, self.vals)
        ch.advance(self.n - 1, 5)
        im = Image.new("RGB", (self.W, self.H), BG)
        d = ImageDraw.Draw(im)
        for v in range(3480, 3601, 20):
            d.line([(ch.x0, ch.Y(v)), (ch.x1, ch.Y(v))], fill=GRID, width=1)
        for i, dd in enumerate(self.days):
            if dd.month == 1 and dd.day == 1:
                d.line([(ch.X(i), ch.y0 - 6), (ch.X(i), ch.y1)], fill=YEARL, width=2)
        d.line([(ch.x0, ch.Y(MIN_POOL)), (ch.x1, ch.Y(MIN_POOL))], fill=AMBER, width=3)
        for xx in range(int(ch.x0), int(ch.x1), 14):
            d.line([(xx, ch.Y(TARGET)), (xx + 6, ch.Y(TARGET))], fill=LINE, width=2)
        fl, ln = ch.layers(1.0)
        im.paste(fl, (ch.x0, ch.y0), fl)
        im.paste(ln, (ch.x0, ch.y0), ln)
        d = ImageDraw.Draw(im)
        xp, yp = ch.X(self.n - 1), ch.Y(self.vals[-1])
        d.line([(xp, yp + 14), (xp, ch.Y(MIN_POOL) - 2)], fill=AMBER, width=3)
        d.ellipse([xp - 11, yp - 11, xp + 11, yp + 11], fill=WATER, outline=BG, width=3)
        return im

    def layout_manifest(self):
        ch = self.ch
        return {"safe_area": list(SAFE[(self.W, self.H)]),
                "static": {"plain": self.ink_plain.boxes, "base": self.ink_base.boxes},
                "chart_box": [ch.x0, ch.y0, ch.x1, ch.y1], "curve_width_px": 5,
                "curve_px": [[round(ch.X(i), 1), round(ch.Y(v), 1)] for i, v in enumerate(self.vals)]}

    def manifest_head(self):
        return {"kind": self.kind, "size": [self.W, self.H], "seconds": self.total, "final": self.final,
                "timeline": {"hook_s": self.hook_s, "legend_s": self.legend_s, "draw_s": self.draw_s, "end_s": self.end_s},
                "text": self.said, "beats": [{"en": b["en"], "es": b["es"], "from": str(self.days[b["a"]]), "to": str(self.days[b["b"]]),
                                              "change": b["change"], "final_counter": f"{signed(b['change'])} ft",
                                              "on_screen_s": [round(b["t0"], 2), round(b["t1"], 2)]} for b in self.beats],
                "chart_labels": [p[1] for p in self.placed], "layout": self.layout_manifest()}


def layout_only(kind, days, vals, F, fonts, final=False):
    """The manifest a render would write, without sound or video (fast: text boxes are measured, not drawn)."""
    plan = Plan(kind, days, vals, F, fonts, final)
    frames = [plan.frame(f, draw=False)[1] for f in range(int(round(plan.total * FPS)))]
    return {**plan.manifest_head(), "frames": frames}


def render(kind, days, vals, F, fonts, out, final, encoder="auto"):
    plan = Plan(kind, days, vals, F, fonts, final)
    W, H, total = plan.W, plan.H, plan.total
    manifest = plan.manifest_head()
    manifest["frames"] = []

    # ---- sound
    stems = sound(days, vals, F, plan.T)
    mix = sum(stems.values())
    target = -14.5 if plan.long else -14.0
    y, gain_db, lim = master(mix, target, -1.6)
    wav = out.with_suffix(".wav")
    write_wav(wav, y)
    g = 10 ** (gain_db / 20)
    manifest["audio"] = {"target_LUFS": target, "wav": ebur128(wav), "normalize_dB": round(gain_db, 2),
                         "limiter_max_reduction_dB": round(float(20 * np.log10(lim.min())), 2), "stereo": stereo(read_audio(wav)),
                         "phone": {m: ebur128(speaker(read_audio(wav), m)) for m in MODELS},
                         "stems": phone_table(read_audio(wav), {k: v * g for k, v in stems.items() if np.abs(v).max() > 0})}

    # ---- frames
    enc = encode.choose(encoder)
    cmd = encode.pipe_cmd(enc, W, H, FPS, wav, total, out, crf=16)
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frames = int(round(total * FPS))
    beats = plan.beats
    still_at = {int(x * FPS): name for name, x in (("hook", 1.6), ("legend", plan.hook_s + 2.0), ("spring24", plan.pen_t[beats[1]["b"]] + 0.4),
                                                    ("drain25", plan.pen_t[beats[4]["a"]] + 4.0), ("cross", plan.pen_t[plan.ci] + 1.0), ("end", total - 1.0))}
    import time
    t_draw = t_pipe = 0.0
    for f in range(frames):
        t0 = time.perf_counter()
        im, rec = plan.frame(f)
        t1 = time.perf_counter()
        manifest["frames"].append(rec)
        p.stdin.write(im.tobytes())
        t_pipe += time.perf_counter() - t1
        t_draw += t1 - t0
        if f in still_at:
            im.save(out.with_name(f"{out.stem}-still-{still_at[f]}.jpg"), quality=90)
    p.stdin.close()
    t0 = time.perf_counter()
    if p.wait():
        raise SystemExit("ffmpeg failed")
    t_tail = time.perf_counter() - t0
    manifest["text"] = plan.said
    plan.plate().save(out.with_name(f"{out.stem}-plate.png"))
    manifest["mp4"] = ebur128(out)
    manifest["encode"] = {**enc.describe(), "draw_s": round(t_draw, 1), "pipe_wait_s": round(t_pipe, 1), "encoder_tail_s": round(t_tail, 1)}
    out.with_suffix(".json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"out": str(out), "seconds": total, "mp4": manifest["mp4"], "wav": manifest["audio"]["wav"],
                      "encode": manifest["encode"], "beats_on_screen_s": [round(b["t1"] - b["t0"], 1) for b in beats]}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("fonts")
    ap.add_argument("outdir")
    ap.add_argument("--only", choices=["long", "short"])
    ap.add_argument("--final", action="store_true", help="drop the private-pilot mark (only after Carlos approves an upload)")
    ap.add_argument("--encoder", choices=["auto", "nvenc", "x264"], default="auto",
                    help="auto: NVIDIA NVENC when this FFmpeg has it and a test encode works, else libx264")
    ap.add_argument("--layout-only", action="store_true", help="write the layout manifests only (no sound, no video)")
    ap.add_argument("--plate-only", action="store_true", help="write only <name>-plate.png (the text-free chart, for thumbnails)")
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
        name = "lake-powell-v2" if kind == "long" else "lake-powell-short-v2"
        if a.plate_only:
            Plan(kind, days, vals, F, fonts, a.final).plate().save(out / f"{name}-plate.png")
            print("wrote", out / f"{name}-plate.png")
        elif a.layout_only:
            m = layout_only(kind, days, vals, F, fonts, a.final)
            (out / f"{name}.layout.json").write_text(json.dumps(m, ensure_ascii=False, separators=(",", ":")) + "\n")
            print("wrote", out / f"{name}.layout.json", len(m["frames"]), "frames")
        else:
            render(kind, days, vals, F, fonts, out / f"{name}.mp4", a.final, a.encoder)


if __name__ == "__main__":
    main()
