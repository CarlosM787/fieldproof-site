"""Pilot A v2 composer: the vertical Short around a swappable "floor" layer.

  python compose_v2.py --capture DIR --audio audio_v2.wav --fonts DIR --out OUT.mp4
                       [--episode episode_v2.mjs] [--floor-dir DIR] [--floor-fit cover|contain]
                       [--final] [--seconds N] [--stills]
  python compose_v2.py --write-clock clock.json [--episode episode_v2.mjs]

THE FLOOR CONTRACT (how to swap in another dancer renderer, e.g. realistic 3D dancers)
  --floor-dir DIR holds one image per video frame: f00000.png (or .jpg) ... f{N-1}, N = seconds * fps
  (960 for this episode). Frame f must show the dancers at time t = (f + 0.5) / fps on the final
  audio clock, i.e. at beat b = (t - audioOffset) * bpm / 60, count = floor(b) % 8 + 1, and the
  pose the Count Lab model gives for position b % 8 (On1; weight lands on the count, the foot lifts
  in the last 40% of the beat). `--write-clock clock.json` exports exactly these numbers for every
  frame (plus the episode's camera path), so a renderer never recomputes the clock itself.
  * Any resolution. The frame is fitted to the 1040 x 700 floor box: cover (fill, centre crop; the
    default) or contain (letterbox on the video background). RGBA PNGs are composited over the
    background, so a transparent 3D render drops straight in.
  * Optional DIR/floor.json: {"fps", "frames", "frameTime", "bpm", "audioOffset"}. If present, every
    field is checked against the episode and a mismatch stops the render (no silent drift).
  * Missing frames stop the render; nothing is interpolated.
Everything else (captions, count row, band lanes, audio) comes from the episode spec and the model,
so a new floor never changes the lesson or its timing.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
W, H = 1080, 1920
BG, PANEL, LINE, TEXT, MUTED, DIM = (10, 15, 30), (19, 28, 51), (36, 49, 84), (236, 241, 250), (196, 207, 228), (104, 118, 146)
COL = {"leader": (111, 211, 255), "bell": (255, 129, 102), "clave": (255, 203, 82), "conga": (95, 227, 181), "bass": (164, 140, 255)}
LANE_ORDER = ["bell", "conga", "bass", "clave"]           # order of entry in the lesson
LANE_NAME = {"bell": "Bell", "clave": "Clave", "conga": "Conga", "bass": "Bass"}

# Layout (px). Shorts overlays its own UI on the video (INFERENCE from the app's layout, not a
# published spec): a top bar (y < ~150), an action rail on the right (x > ~936 for y ~ 940-1700)
# and the title/channel block at the bottom (y > ~1500). Everything the lesson needs stays out of
# those zones; the floor background may run under them.
SAFE_X0, SAFE_X1, RAIL_Y0, SAFE_Y1 = 60, 920, 940, 1480
CAP_Y0, CAP_Y1 = 192, 450
FLOOR = (20, 458, 1060, 1158)
COUNT_Y, COUNT_H = 1172, 84
LANE_Y, LANE_H, LANE_GAP = 1270, 46, 8
SLOT_X0, SLOT_X1 = 196, SAFE_X1
CELL = (SLOT_X1 - SLOT_X0) / 16


def node_json(expr):
    return json.loads(subprocess.run(["node", "-e", expr], cwd=HERE, capture_output=True, text=True, check=True).stdout)


def fonts(d):
    d = Path(d)
    F = lambda n, s: ImageFont.truetype(str(d / n), s)
    return {
        "hook": F("BigShouldersDisplay-800.ttf", 150), "hook_es": F("BigShouldersDisplay-800.ttf", 74),
        "count": F("BigShouldersDisplay-800.ttf", 62), "big": F("BigShouldersDisplay-800.ttf", 210),
        "giant": F("BigShouldersDisplay-800.ttf", 330),
        "en": F("AtkinsonHyperlegible-700.ttf", 58), "es": F("AtkinsonHyperlegible-400.ttf", 44),
        "hook_en": F("AtkinsonHyperlegible-700.ttf", 56), "hook_es2": F("AtkinsonHyperlegible-400.ttf", 44),
        "mono": F("JetBrainsMono-500.ttf", 28), "mono_s": F("JetBrainsMono-500.ttf", 22), "cta": F("JetBrainsMono-500.ttf", 52),
    }


# ---------- text: *accent* markup, balanced wrapping ----------
def runs(text):
    """'Start with the *bell*: ...' -> [(str, accent?)]"""
    out = []
    for i, part in enumerate(text.split("*")):
        if part:
            out.append((part, i % 2 == 1))
    return out


def width(d, text, font):
    return d.textlength(text.replace("*", ""), font=font)


def wrap_balanced(d, text, font, maxw):
    """Fewest lines that fit; among 2-line splits, the most even one, preferring a break after
    punctuation and never leaving one word alone on the last line."""
    words = text.split(" ")                                # U+00A0 in the spec = do not break here
    if width(d, text, font) <= maxw:
        return [text]
    best = None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        wa, wb = width(d, a, font), width(d, b, font)
        if wa <= maxw and wb <= maxw:
            score = abs(wa - wb) + (400 if len(words[i:]) == 1 else 0) - (260 if a[-1] in ":.?," else 0)
            if best is None or score < best[0]:
                best = (score, [a, b])
    if best is None:
        raise ValueError(f"caption does not fit in two lines of {maxw}px: {text!r}")
    return best[1]


def draw_rich(d, xy, text, font, color, accent, alpha=1.0, bg=BG):
    x, y = xy
    mix = lambda c: tuple(int(bg[i] + (c[i] - bg[i]) * alpha) for i in range(3))
    for part, acc in runs(text):
        d.text((x, y), part, font=font, fill=mix(accent if acc else color))
        x += d.textlength(part, font=font)
    return x


# ---------- background ----------
def base_layer(F, draft):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    for y in range(H):  # faint light from the stage
        a = max(0, 1 - abs(y - 800) / 900) * 12
        d.line([(0, y), (W, y)], fill=(10 + int(a * 0.4), 15 + int(a * 0.6), 30 + int(a)))
    d.text((SAFE_X0, 150), "CLAVE LAB · LABORATORIO DE CLAVE", font=F["mono_s"], fill=DIM)
    if draft:
        d.text((SAFE_X0, 1872), "PRIVATE PILOT v2 · NOT PUBLISHED · synthesized band, no recordings", font=F["mono_s"], fill=(84, 96, 122))
    return im


def fit_floor(img, mode):
    x0, y0, x1, y1 = FLOOR
    bw, bh = x1 - x0, y1 - y0
    iw, ih = img.size
    if mode == "cover":
        s = max(bw / iw, bh / ih)
        img = img.resize((max(bw, round(iw * s)), max(bh, round(ih * s))), Image.LANCZOS)
        cx, cy = (img.width - bw) // 2, (img.height - bh) // 2
        return img.crop((cx, cy, cx + bw, cy + bh))
    s = min(bw / iw, bh / ih)
    img = img.resize((round(iw * s), round(ih * s)), Image.LANCZOS)
    canvas = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    canvas.paste(img, ((bw - img.width) // 2, (bh - img.height) // 2))
    return canvas


class Floor:
    def __init__(self, d, ep, n_frames, mode):
        self.d, self.mode = Path(d), mode
        man = self.d / "floor.json"
        if man.exists():
            m = json.loads(man.read_text())
            want = {"fps": ep["fps"], "frameTime": ep.get("frameTime", "start"), "bpm": ep["bpm"], "audioOffset": ep["audioOffset"]}
            bad = {k: (m.get(k), v) for k, v in want.items() if k in m and m[k] != v}
            if "frames" in m and m["frames"] < n_frames:
                bad["frames"] = (m["frames"], n_frames)
            if bad:
                raise SystemExit(f"floor.json does not match the episode (floor, episode): {bad}")
        self.ext = next((e for e in (".png", ".jpg", ".jpeg") if (self.d / f"f00000{e}").exists()), None)
        if not self.ext:
            raise SystemExit(f"no f00000.png/.jpg in {self.d}")
        missing = [f for f in range(n_frames) if not (self.d / f"f{f:05d}{self.ext}").exists()]
        if missing:
            raise SystemExit(f"{len(missing)} floor frames missing, first f{missing[0]:05d}{self.ext}")

    def get(self, f):
        img = Image.open(self.d / f"f{f:05d}{self.ext}")
        return fit_floor(img.convert("RGBA"), self.mode)


# ---------- the clock ----------
class Clock:
    def __init__(self, ep, band):
        self.ep, self.band = ep, band
        self.slot_s = 30 / ep["bpm"]
        self.lead = 0.5 / ep["fps"] if ep.get("frameTime") == "center" else 0.0

    def at(self, f):
        ep = self.ep
        t = f / ep["fps"] + self.lead
        b = max(0.0, (t - ep["audioOffset"]) * ep["bpm"] / 60)
        m = min(int(b // 8), len(ep["measures"]) - 1)
        slot_abs = int(b * 2 + 1e-9)
        return {"f": f, "t": t, "beat": b, "measure": m, "count": int(b) % 8 + 1, "pos": b % 8,
                "slot": slot_abs % 16, "slot_abs": slot_abs, "since_slot": (b * 2 - slot_abs) * self.slot_s,
                "in_measure": b - m * 8}


def lanes_visible(ep, m):
    """Lanes appear when their instrument first enters (after the hook) and stay."""
    kind = ep["measures"][m]["kind"]
    if kind in ("hook", "turn"):
        return []
    seen = []
    for i in range(1, m + 1):
        for k in LANE_ORDER:
            if ep["measures"][i]["mix"].get(k) and k not in seen:
                seen.append(k)
    return [k for k in LANE_ORDER if k in seen]


def entered_at(ep, lane):
    for i in range(1, len(ep["measures"])):
        if ep["measures"][i]["mix"].get(lane):
            return i
    return 0


def render_frame(F, base, floor, clock, band, holds, ep, f, cache):
    c = clock.at(f)
    m, meas = c["measure"], ep["measures"][c["measure"]]
    kind = meas["kind"]
    accent = COL[meas["lane"]] if meas.get("lane") else COL["leader"]
    im = base.copy()
    fl = floor.get(f)
    im.paste(fl, (FLOOR[0], FLOOR[1]), fl)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(FLOOR, radius=18, outline=LINE, width=2)
    hidden = kind in ("hook", "turn")                    # the counts are the question
    count = c["count"]
    beat_frac = c["beat"] - int(c["beat"])
    pop = max(0.0, 1 - beat_frac / 0.25)                   # 1 on the beat, 0 a quarter-beat later

    # big count numeral in the floor (or a pulsing "?")
    if kind != "count":
        txt = "?" if hidden else str(count)
        col = COL["leader"] if not hidden and count not in holds else (DIM if not hidden else COL["leader"])
        d.text((44, FLOOR[3] - 262), txt, font=F["big"], fill=col)
        if not hidden and count in holds:
            d.text((48, FLOOR[3] - 296), "hold · pausa", font=F["mono"], fill=MUTED)   # above the numeral, clear of the feet
    else:  # count-along: a giant numeral over the floor, popping on each beat, dancers still visible
        txt = str(count)
        size = 330 + int(40 * pop)
        fnt = F["giant"] if size == 330 else ImageFont.truetype(F["giant"].path, size)
        tw = d.textlength(txt, font=fnt)
        colr = DIM if count in holds else COL["leader"]
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(ov).text(((FLOOR[0] + FLOOR[2]) / 2 - tw / 2, (FLOOR[1] + FLOOR[3]) / 2 - size * 0.62), txt, font=fnt,
                                fill=colr + (215,), stroke_width=6, stroke_fill=BG + (215,))
        im.paste(ov, (0, 0), ov)
        d = ImageDraw.Draw(im)

    # count row. While the count is the question (hook, turn) every cell pulses on the beat, so the
    # row shows the pulse without giving away which cell is the 1.
    gap = 10
    cw = (SAFE_X1 - SAFE_X0 - 7 * gap) / 8
    for k in range(1, 9):
        x = SAFE_X0 + (k - 1) * (cw + gap)
        if hidden:
            fill = tuple(int(PANEL[i] + ((31, 49, 89)[i] - PANEL[i]) * pop) for i in range(3))
            outline, wd, label = LINE, 1, "?"
            colr = tuple(int(MUTED[i] + (COL["leader"][i] - MUTED[i]) * pop) for i in range(3))
        else:
            now = k == count
            fill = (31, 49, 89) if now else PANEL
            outline, wd = (COL["leader"], 3) if now else (LINE, 1)
            if kind == "aha" and k in (1, 5):
                outline, wd = (COL["clave"] if k == 5 else COL["leader"], 3)
                if k == 5 and c["slot"] in (8, 9):
                    fill = (74, 62, 30)                     # the clave stroke on 5
            label = str(k)
            colr = (116, 130, 159) if k in holds else TEXT
        d.rounded_rectangle([x, COUNT_Y, x + cw, COUNT_Y + COUNT_H], radius=14, fill=fill, outline=outline, width=wd)
        tw = d.textlength(label, font=F["count"])
        d.text((x + cw / 2 - tw / 2, COUNT_Y + 8), label, font=F["count"], fill=colr)

    # band lanes (appear as instruments enter) or the hook/turn text in their place
    vis = lanes_visible(ep, m)
    if vis:
        for i, lane in enumerate(vis):
            y = LANE_Y + i * (LANE_H + LANE_GAP)
            on = bool(meas["mix"].get(lane))
            fade = min(1.0, c["in_measure"] / 0.6) if entered_at(ep, lane) == m else 1.0
            focus = meas.get("lane") == lane
            blend = lambda col, a=fade: tuple(int(BG[j] + (col[j] - BG[j]) * a) for j in range(3))
            if focus:
                d.rounded_rectangle([SAFE_X0 - 14, y - 4, SAFE_X1 + 8, y + LANE_H + 4], radius=12, fill=blend((24, 36, 66)), outline=blend(COL[lane]), width=2)
            dot = COL[lane] if on else tuple(int(v * 0.35) for v in COL[lane])
            d.ellipse([SAFE_X0, y + LANE_H / 2 - 9, SAFE_X0 + 18, y + LANE_H / 2 + 9], fill=blend(dot))
            d.text((SAFE_X0 + 28, y + 8), LANE_NAME[lane], font=F["mono"], fill=blend(TEXT if on else DIM))
            for s in range(16):
                x = SLOT_X0 + s * CELL
                d.rounded_rectangle([x + 2, y + 5, x + CELL - 2, y + LANE_H - 5], radius=6, fill=blend((31, 42, 73) if s % 2 == 0 else (26, 37, 66)))
                hit = band[lane].get(str(s))
                if hit:
                    big = hit in ("m", "open", "x") or lane == "bass"
                    r = 11 if big else 6
                    cx, cy = x + CELL / 2, y + LANE_H / 2
                    if on and s == c["slot"] and c["since_slot"] < 0.12:
                        r += 6
                        d.ellipse([cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4], outline=TEXT, width=3)
                    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=blend(dot))
        x = SLOT_X0 + c["slot"] * CELL
        d.rectangle([x + 1, LANE_Y - 6, x + CELL - 1, LANE_Y + len(vis) * (LANE_H + LANE_GAP) - LANE_GAP + 4], outline=TEXT, width=2)
    elif kind == "hook":
        lines = wrap_balanced(d, meas["en"], F["hook_en"], SAFE_X1 - SAFE_X0)
        y = LANE_Y + 6
        for ln in lines:
            draw_rich(d, (SAFE_X0, y), ln, F["hook_en"], TEXT, COL["leader"])
            y += 66
        for ln in wrap_balanced(d, meas["es"], F["hook_es2"], SAFE_X1 - SAFE_X0):
            draw_rich(d, (SAFE_X0, y + 6), ln, F["hook_es2"], MUTED, COL["leader"])
            y += 54
    elif kind == "turn":
        d.text((SAFE_X0, LANE_Y + 20), ep["cta"], font=F["cta"], fill=COL["leader"])
        d.text((SAFE_X0, LANE_Y + 100), "Clave Lab · Laboratorio de Clave", font=F["mono"], fill=MUTED)

    # captions (top block); the hook shows the title instead
    if kind == "hook":
        d.text((SAFE_X0 - 4, CAP_Y0 - 12), ep["hook"]["en"].replace("1?", ""), font=F["hook"], fill=TEXT)
        x1 = SAFE_X0 - 4 + d.textlength(ep["hook"]["en"].replace("1?", ""), font=F["hook"])
        d.text((x1, CAP_Y0 - 12), "1?", font=F["hook"], fill=tuple(int(TEXT[i] + (COL["leader"][i] - TEXT[i]) * (0.4 + 0.6 * pop)) for i in range(3)))
        d.text((SAFE_X0, CAP_Y0 + 160), ep["hook"]["es"], font=F["hook_es"], fill=MUTED)
    else:
        key = (m, meas["en"])
        if key not in cache:
            en = wrap_balanced(d, meas["en"], F["en"], SAFE_X1 - SAFE_X0)
            es = wrap_balanced(d, meas["es"], F["es"], SAFE_X1 - SAFE_X0)
            cache[key] = (en, es)
        en, es = cache[key]
        prev = ep["measures"][m - 1]["en"] if m else None
        a = 1.0 if prev == meas["en"] else min(1.0, c["in_measure"] / 0.6)   # 0.24 s fade-in on change
        rise = int((1 - a) * 18)
        if CAP_Y0 + 66 * len(en) + 8 + 52 * len(es) > CAP_Y1:
            raise ValueError(f"caption block overflows {CAP_Y1}px: {meas['en']!r}")
        y = CAP_Y0 + rise
        for ln in en:
            draw_rich(d, (SAFE_X0, y), ln, F["en"], TEXT, accent, a)
            y += 66
        y += 8
        for ln in es:
            draw_rich(d, (SAFE_X0, y), ln, F["es"], MUTED, accent, a)
            y += 52
    return im


def write_clock(ep, band, path):
    clock = Clock(ep, band)
    n = int(round(ep["seconds"] * ep["fps"]))
    cam = node_json(f"import('./{ARGS.episode}').then(m=>{{const e=m.EPISODE;const n={n};const o=[];for(let f=0;f<n;f++){{const t=f/e.fps+{clock.lead};o.push(e.capture&&e.capture.cam?e.capture.cam(t,e):null)}}console.log(JSON.stringify(o))}})")
    frames = []
    for f in range(n):
        c = clock.at(f)
        frames.append({"f": f, "t": round(c["t"], 6), "beat": round(c["beat"], 6), "count": c["count"], "pos": round(c["pos"], 6),
                       "measure": c["measure"], "kind": ep["measures"][c["measure"]]["kind"], "camera": cam[f]})
    Path(path).write_text(json.dumps({
        "episode": ep["id"], "fps": ep["fps"], "frames": n, "bpm": ep["bpm"], "audioOffset": ep["audioOffset"],
        "frameTime": ep.get("frameTime", "start"), "pattern": "on1", "floor_box_px": [FLOOR[2] - FLOOR[0], FLOOR[3] - FLOOR[1]],
        "rule": "frame f shows the pose at beat = (t - audioOffset) * bpm / 60 with t = (f + 0.5) / fps; count = floor(beat) % 8 + 1",
        "camera_note": "yaw/pitch/dist are the Count Lab camera (radians, metres); a 3D renderer may use its own camera",
        "frames_list": frames}, indent=0) + "\n")
    print("wrote", path, n, "frames")


def main():
    global ARGS
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", default="episode_v2.mjs")
    ap.add_argument("--capture")
    ap.add_argument("--audio")
    ap.add_argument("--fonts")
    ap.add_argument("--out")
    ap.add_argument("--floor-dir", help="swap the floor layer (default: <capture>/floor)")
    ap.add_argument("--floor-fit", choices=["cover", "contain"], default="cover")
    ap.add_argument("--final", action="store_true", help="drop the private-pilot mark (only after Carlos approves an upload)")
    ap.add_argument("--seconds", type=float, help="render only the first N seconds (tests)")
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--write-clock", help="write the per-frame clock JSON for external floor renderers and exit")
    ARGS = a = ap.parse_args()

    ep = node_json(f"import('./{a.episode}').then(m=>console.log(JSON.stringify(m.EPISODE)))")
    model = node_json("import('../../salsacoach-count-lab/src/model.js').then(m=>console.log(JSON.stringify({BAND:m.BAND,holds:m.PATTERNS.on1.holds})))")
    band, holds = model["BAND"], model["holds"]
    if a.write_clock:
        write_clock(ep, band, a.write_clock)
        return
    F = fonts(a.fonts)
    total = int(round(ep["seconds"] * ep["fps"]))
    n = total if not a.seconds else min(total, int(round(a.seconds * ep["fps"])))
    floor = Floor(a.floor_dir or Path(a.capture) / "floor", ep, n, a.floor_fit)
    clock = Clock(ep, band)
    base = base_layer(F, not a.final)
    out = Path(a.out)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(ep["fps"]), "-i", "-",
           "-i", str(a.audio), "-map", "0:v", "-map", "1:a",
           "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-tune", "animation",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{n / ep['fps']:.3f}", "-movflags", "+faststart", str(out)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    cache = {}
    stills = {}
    if a.stills:
        for name, t in (("hook", 0.4), ("bell", 5.0), ("conga", 8.2), ("aha", 17.65), ("feet", 21.6), ("count", 26.2), ("turn", 30.4)):
            stills[int(t * ep["fps"])] = name
    for f in range(n):
        im = render_frame(F, base, floor, clock, band, holds, ep, f, cache)
        p.stdin.write(im.tobytes())
        if f in stills:
            im.save(out.with_name(f"still-{stills[f]}.jpg"), quality=90)
    p.stdin.close()
    if p.wait():
        raise SystemExit("ffmpeg failed")
    # layout for review/av_sync.py (the slot cursor's top edge)
    out.with_name(out.stem + "-layout.json").write_text(json.dumps(
        {"row": LANE_Y - 6, "x0": SLOT_X0, "cell": CELL, "width": W, "height": H, "offset": ep["audioOffset"], "trim": 0}) + "\n")
    print("wrote", out, n, "frames")


if __name__ == "__main__":
    main()
