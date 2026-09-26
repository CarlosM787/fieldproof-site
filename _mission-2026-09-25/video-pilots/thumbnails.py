"""1280x720 thumbnails for both pilots, drawn from the same frames and data as the videos.

  python thumbnails.py <clave-lab capture dir> <clave fonts dir> <powell csv> <plex fonts dir> <out dir>
Pilot A uses a real floor frame from the capture (count 1 of the "Now the feet" measure).
Pilot B draws the three-year USGS series; the headline number is computed from the CSV.
"""
import sys
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CAP, CFONTS, CSV, PFONTS, OUT = (Path(a) for a in sys.argv[1:6])
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1280, 720


def thumb_clave():
    BG, TEXT, MUTED, BLUE = (10, 15, 30), (234, 240, 250), (163, 176, 202), (111, 211, 255)
    F = lambda n, s: ImageFont.truetype(str(CFONTS / n), s)
    im = Image.new("RGB", (W, H), BG)
    # floor frame: measure 8, count 1 -> t = 0.1 + 64 * 0.4 = 25.7 s -> frame 771 at 30 fps
    fl = Image.open(CAP / "floor" / "f00771.jpg").convert("RGB")
    fw = 760
    fl = fl.resize((fw, int(fl.height * fw / fl.width)), Image.LANCZOS)
    top = (H - fl.height) // 2
    mask = Image.new("L", fl.size, 0)  # feather every edge into the background
    ImageDraw.Draw(mask).rectangle([150, 70, fl.width - 1, fl.height - 71], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(48))
    im.paste(fl, (W - fw, top), mask)
    d = ImageDraw.Draw(im)
    d.text((56, 64), "CLAVE LAB", font=F("JetBrainsMono-500.ttf", 30), fill=MUTED)
    d.text((52, 110), "WHERE IS", font=F("BigShouldersDisplay-800.ttf", 150), fill=TEXT)
    d.text((52, 262), "THE 1?", font=F("BigShouldersDisplay-800.ttf", 210), fill=BLUE)
    d.text((56, 500), "¿DÓNDE ESTÁ EL 1?", font=F("BigShouldersDisplay-800.ttf", 76), fill=MUTED)
    # the answer, as a count row: 1 lit, holds dim
    x0, y0, cw = 56, 612, 58
    for k in range(1, 9):
        x = x0 + (k - 1) * (cw + 8)
        lit = k == 1
        d.rounded_rectangle([x, y0, x + cw, y0 + 64], radius=10, fill=(31, 49, 89) if lit else (19, 28, 51),
                            outline=BLUE if lit else (36, 49, 84), width=3 if lit else 1)
        f = F("BigShouldersDisplay-800.ttf", 46)
        tw = d.textlength(str(k), font=f)
        d.text((x + cw / 2 - tw / 2, y0 + 6), str(k), font=f, fill=TEXT if k not in (4, 8) else (116, 130, 159))
    im.save(OUT / "clave-lab-thumbnail.png", optimize=True)


def thumb_powell():
    BG, INK, MUTED, WATER, AMBER = (11, 26, 36), (234, 242, 245), (143, 166, 178), (98, 210, 232), (242, 165, 65)
    F = lambda n, s: ImageFont.truetype(str(PFONTS / n), s)
    rows = [l.split(",") for l in CSV.read_text().splitlines() if l and not l.startswith(("#", "date"))]
    days = [date.fromisoformat(a) for a, _ in rows]
    vals = [float(b) for _, b in rows]
    drop = vals[-1] - vals[0]
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # chart on the lower 60%: 3,490 ft floor to 3,600 ft
    cx0, cx1, cy0, cy1 = 40, W - 40, 300, H - 70
    lo, hi = 3480.0, 3600.0
    X = lambda i: cx0 + (cx1 - cx0) * i / (len(vals) - 1)
    Y = lambda v: cy1 - (cy1 - cy0) * (v - lo) / (hi - lo)
    pts = [(X(i), Y(v)) for i, v in enumerate(vals)]
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(band).polygon(pts + [(X(len(vals) - 1), Y(3490)), (X(0), Y(3490))], fill=WATER + (46,))
    im.paste(band, (0, 0), band)
    d = ImageDraw.Draw(im)
    d.line([(cx0, Y(3490)), (cx1, Y(3490))], fill=AMBER, width=4)
    d.text((cx0 + 6, Y(3490) + 8), "3,490 ft minimum power pool", font=F("IBMPlexSansCondensed-600.ttf", 26), fill=AMBER)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).line(pts, fill=WATER + (150,), width=14, joint="curve")
    im.paste(glow.filter(ImageFilter.GaussianBlur(8)), (0, 0), glow.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(im)
    d.line(pts, fill=WATER, width=6, joint="curve")
    ex, ey = pts[-1]
    d.ellipse([ex - 11, ey - 11, ex + 11, ey + 11], fill=WATER)
    sign = "+" if drop >= 0 else "−"
    d.text((44, 30), "LAKE POWELL", font=F("IBMPlexSansCondensed-700.ttf", 64), fill=MUTED)
    d.text((40, 92), f"{sign}{abs(drop):,.1f} ft", font=F("IBMPlexSansCondensed-700.ttf", 150), fill=INK)
    d.text((W - 44, 52), "3 years", font=F("IBMPlexSansCondensed-700.ttf", 64), fill=INK, anchor="ra")
    d.text((W - 44, 128), "turned into", font=F("IBMPlexSansCondensed-600.ttf", 44), fill=MUTED, anchor="ra")
    d.text((W - 44, 180), "sound", font=F("IBMPlexSansCondensed-600.ttf", 44), fill=MUTED, anchor="ra")
    # a small waveform mark next to "sound"
    wx = W - 44 - d.textlength("sound", font=F("IBMPlexSansCondensed-600.ttf", 44)) - 24
    for j, hgt in enumerate([10, 22, 34, 18, 28, 12]):
        x = wx - j * 10
        d.line([(x, 206 - hgt / 2), (x, 206 + hgt / 2)], fill=WATER, width=5)
    d.text((44, H - 40), f"USGS 09379900 · {days[0]:%b %-d, %Y} → {days[-1]:%b %-d, %Y}", font=F("IBMPlexMono-500.ttf", 20), fill=MUTED)
    im.save(OUT / "desert-systems-thumbnail.png", optimize=True)


thumb_clave()
thumb_powell()
print("wrote", sorted(p.name for p in OUT.glob("*-thumbnail.png")))
