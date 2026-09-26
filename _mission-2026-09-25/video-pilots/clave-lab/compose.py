"""Pilot A composer: lays out the vertical 1080x1920 Short around the captured floor frames and
pipes the frames straight into ffmpeg with the synthesized audio.

  python compose.py <capture dir> <fonts dir> <out.mp4>
Reads episode.mjs and the Count Lab model through node, so the lanes, counts and captions come from
the same files as the web prototype.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

HERE = Path(__file__).resolve().parent
CAP, FONTS, OUT = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
MODEL = json.loads(subprocess.run(["node", "-e", "import('../../salsacoach-count-lab/src/model.js').then(m=>console.log(JSON.stringify({BAND:m.BAND,PATTERNS:m.PATTERNS})))"],
                                  cwd=HERE, capture_output=True, text=True, check=True).stdout)
EP = json.loads(subprocess.run(["node", "-e", "import('./episode.mjs').then(m=>console.log(JSON.stringify(m.EPISODE)))"],
                               cwd=HERE, capture_output=True, text=True, check=True).stdout)
BAND, HOLDS = MODEL["BAND"], MODEL["PATTERNS"]["on1"]["holds"]

W, H = 1080, 1920
BG, PANEL, LINE, TEXT, MUTED = (10, 15, 30), (19, 28, 51), (36, 49, 84), (234, 240, 250), (163, 176, 202)
COL = {"leader": (111, 211, 255), "bell": (255, 129, 102), "clave": (255, 203, 82), "conga": (95, 227, 181), "bass": (164, 140, 255)}
F = lambda name, size: ImageFont.truetype(str(FONTS / name), size)
DISP, DISP_M, DISP_S = F("BigShouldersDisplay-800.ttf", 124), F("BigShouldersDisplay-800.ttf", 66), F("BigShouldersDisplay-800.ttf", 70)
BIGN = F("BigShouldersDisplay-800.ttf", 210)
BODY_B, BODY, MONO, MONO_S = F("AtkinsonHyperlegible-700.ttf", 50), F("AtkinsonHyperlegible-400.ttf", 40), F("JetBrainsMono-500.ttf", 26), F("JetBrainsMono-500.ttf", 22)
LANES = ["bell", "clave", "conga", "bass"]
LANE_EN = {"bell": "Bell", "clave": "Clave", "conga": "Congas", "bass": "Bass"}


def wrap(draw, text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


def base_layer():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    for y in range(H):  # faint vertical light from the stage
        a = max(0, 1 - abs(y - 700) / 900) * 10
        d.line([(0, y), (W, y)], fill=(10 + int(a * 0.4), 15 + int(a * 0.6), 30 + int(a)))
    d.text((40, 70), "CLAVE LAB · LABORATORIO DE CLAVE", font=MONO, fill=MUTED)
    d.text((40, 118), "WHERE IS", font=DISP, fill=TEXT)
    wx = 40 + d.textlength("WHERE IS ", font=DISP)
    d.text((wx, 118), "THE 1?", font=DISP, fill=COL["leader"])
    d.text((40, 246), "¿DÓNDE ESTÁ EL 1?", font=DISP_M, fill=MUTED)
    d.text((40, 1862), "Synthesized band · no recordings · pilot, not published", font=MONO_S, fill=(110, 124, 150))
    return im


BASE = base_layer()
FLOOR_Y, FLOOR_H = 350, 608


def frame(f):
    t = f / EP["fps"]
    b = max(0.0, (t - EP["audioOffset"]) * EP["bpm"] / 60)
    m = min(int(b // 8), len(EP["measures"]) - 1)
    meas = EP["measures"][m]
    count = int(b) % 8 + 1
    slot = int(b * 2) % 16
    since = (b * 2 - int(b * 2)) * (30 / EP["bpm"])  # seconds since this slot started
    im = BASE.copy()
    d = ImageDraw.Draw(im)
    fl = Image.open(CAP / "floor" / f"f{f:05d}.jpg").convert("RGB").resize((W - 40, FLOOR_H - 20), Image.LANCZOS)
    im.paste(fl, (20, FLOOR_Y))
    d.rounded_rectangle([20, FLOOR_Y, W - 20, FLOOR_Y + FLOOR_H - 20], radius=18, outline=LINE, width=2)
    held = count in HOLDS
    d.text((44, FLOOR_Y + FLOOR_H - 250), str(count), font=BIGN, fill=COL["leader"])
    if held:
        d.text((44 + d.textlength(str(count), font=BIGN) + 10, FLOOR_Y + FLOOR_H - 110), "hold", font=MONO, fill=MUTED)

    # count row
    y0, cw, gap = 1010, (W - 80 - 7 * 10) / 8, 10
    for k in range(1, 9):
        x = 40 + (k - 1) * (cw + gap)
        now = k == count
        d.rounded_rectangle([x, y0, x + cw, y0 + 104], radius=14, fill=(31, 49, 89) if now else PANEL,
                            outline=COL["leader"] if now else LINE, width=3 if now else 1)
        c = (116, 130, 159) if k in HOLDS else TEXT
        tw = d.textlength(str(k), font=DISP_S)
        d.text((x + cw / 2 - tw / 2, y0 + 14), str(k), font=DISP_S, fill=c)

    # instrument lanes
    ly, lh, lx, cellw = 1142, 58, 190, (W - 190 - 40) / 16
    for i, lane in enumerate(LANES):
        y = ly + i * (lh + 8)
        on = bool(meas["mix"].get(lane))
        focus = meas.get("lane") == lane
        if focus:
            d.rounded_rectangle([30, y - 4, W - 30, y + lh + 4], radius=12, fill=(24, 36, 66), outline=COL[lane], width=2)
        dot = COL[lane] if on else tuple(int(v * 0.35) for v in COL[lane])
        d.ellipse([44, y + lh / 2 - 9, 62, y + lh / 2 + 9], fill=dot)
        d.text((74, y + 12), LANE_EN[lane], font=MONO, fill=TEXT if on else (95, 108, 134))
        for s in range(16):
            x = lx + s * cellw
            d.rounded_rectangle([x + 2, y + 6, x + cellw - 2, y + lh - 6], radius=6,
                                fill=(31, 42, 73) if s % 2 == 0 else (26, 37, 66))
            hit = BAND[lane].get(str(s))
            if hit:
                big = hit in ("m", "open", "x") or lane == "bass"
                r = 12 if big else 7
                cx, cy = x + cellw / 2, y + lh / 2
                if on and s == slot and since < 0.12:
                    r += 6
                    d.ellipse([cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4], outline=TEXT, width=3)
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dot)
    x = lx + slot * cellw
    d.rectangle([x + 1, ly - 6, x + cellw - 1, ly + 4 * (lh + 8) - 2], outline=(234, 240, 250), width=2)

    # captions (the end card has its own text)
    cy = 1430
    if meas.get("end"):
        cy = 99999
    for line in wrap(d, meas["en"], BODY_B, W - 80)[:2]:
        d.text((40, cy), line, font=BODY_B, fill=TEXT)
        cy += 62
    cy += 8
    for line in wrap(d, meas["es"], BODY, W - 80)[:2]:
        d.text((40, cy), line, font=BODY, fill=MUTED)
        cy += 52

    if meas.get("end"):
        k = min(1.0, (b - m * 8) / 1.0)
        ov = Image.new("RGB", (W, H), BG)
        im = Image.blend(im, ov, 0.94 * k)
        d = ImageDraw.Draw(im)
        a = tuple(int(v * k) for v in TEXT)
        d.text((60, 640), "FIND THE 1", font=F("BigShouldersDisplay-800.ttf", 170), fill=tuple(int(v * k) for v in COL["leader"]))
        d.text((60, 820), "ENCUENTRA EL UNO", font=F("BigShouldersDisplay-800.ttf", 96), fill=a)
        d.text((60, 990), "Free guides in English and Spanish", font=BODY_B, fill=a)
        d.text((60, 1052), "Guías gratis en inglés y español", font=BODY, fill=tuple(int(v * k) for v in MUTED))
        d.text((60, 1180), "mysalsacoach.com", font=F("JetBrainsMono-500.ttf", 58), fill=tuple(int(v * k) for v in COL["leader"]))
    return im


def main():
    total = int(round(EP["seconds"] * EP["fps"]))
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(EP["fps"]), "-i", "-",
           "-i", str(CAP / "audio.wav"), "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-shortest", "-movflags", "+faststart", OUT]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(total):
        p.stdin.write(frame(f).tobytes())
        if f == int(total * 0.3):
            frame(f).save(Path(OUT).with_name("still-mid.jpg"), quality=88)
    p.stdin.close()
    p.wait()
    frame(int(total * 0.62)).save(Path(OUT).with_name("still-feet.jpg"), quality=88)
    frame(total - 5).save(Path(OUT).with_name("still-end.jpg"), quality=88)
    print("wrote", OUT, total, "frames")


if __name__ == "__main__":
    main()
