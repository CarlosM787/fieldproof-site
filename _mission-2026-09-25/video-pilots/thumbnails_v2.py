"""1280x720 thumbnails for the v2 pilots, drawn from the same frames and data as the videos.

  python thumbnails_v2.py <clave capture dir> <clave fonts dir> <powell csv> <plex fonts dir> <out dir>

* clave-lab-v2-thumbnail.png   the hook ("Half this band never plays it") over a real floor frame
* lake-powell-v2-thumbnail.png "27.5 ft left": the water above the minimum power pool, on the chart
* lake-powell-short-v2-thumbnail.png  "Each spring added less": the three spring rises
Every number is computed from the CSV (same definitions as desert-systems/lake_powell_v2.py).
Shorts mostly show a frame picked in the app, not this image: use the hook frame (the video's
still-hook.jpg / *-still-hook.jpg) as the Short's cover.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "desert-systems"))
import lake_powell_v2 as P  # noqa: E402

CAP, CFONTS, CSV, PFONTS, OUT = (Path(a) for a in sys.argv[1:6])
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1280, 720


def clave():
    BG, TEXT, MUTED, BLUE, GOLD = (10, 15, 30), (236, 241, 250), (196, 207, 228), (111, 211, 255), (255, 203, 82)
    F = lambda n, s: ImageFont.truetype(str(CFONTS / n), s)
    im = Image.new("RGB", (W, H), BG)
    # a feet-section frame (t = 21.6 s -> f = 648 at 30 fps): both dancers large, side view
    fl = Image.open(CAP / "floor" / "f00648.jpg").convert("RGB")
    fh = 760
    fl = fl.resize((int(fl.width * fh / fl.height), fh), Image.LANCZOS)
    mask = Image.new("L", fl.size, 0)
    ImageDraw.Draw(mask).rectangle([150, 40, fl.width - 1, fl.height - 41], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(50))
    im.paste(fl, (W - fl.width + 60, (H - fh) // 2), mask)
    d = ImageDraw.Draw(im)
    d.text((56, 52), "CLAVE LAB · SALSA TIMING", font=F("JetBrainsMono-500.ttf", 28), fill=MUTED)
    d.text((50, 92), "WHERE IS", font=F("BigShouldersDisplay-800.ttf", 168), fill=TEXT)
    d.text((50, 262), "THE 1?", font=F("BigShouldersDisplay-800.ttf", 196), fill=BLUE)
    d.text((56, 480), "Half this band", font=F("AtkinsonHyperlegible-700.ttf", 54), fill=TEXT)
    d.text((56, 540), "never plays it.", font=F("AtkinsonHyperlegible-700.ttf", 54), fill=GOLD)
    x0, y0, cw = 56, 626, 56
    for k in range(1, 9):
        x = x0 + (k - 1) * (cw + 8)
        d.rounded_rectangle([x, y0, x + cw, y0 + 60], radius=10, fill=(19, 28, 51), outline=(36, 49, 84), width=1)
        f = F("BigShouldersDisplay-800.ttf", 44)
        d.text((x + cw / 2 - d.textlength("?", font=f) / 2, y0 + 6), "?", font=f, fill=(150, 165, 195))
    im.save(OUT / "clave-lab-v2-thumbnail.png", optimize=True)


def powell(kind):
    BG, INK, MUTED, WATER, AMBER, DROP = P.BG, P.INK, P.MUTED, P.WATER, P.AMBER, P.DROP
    F = lambda w, s: ImageFont.truetype(str(PFONTS / {"r": "IBMPlexSansCondensed-400.ttf", "s": "IBMPlexSansCondensed-600.ttf",
                                                      "b": "IBMPlexSansCondensed-700.ttf", "m": "IBMPlexMono-500.ttf"}[w]), s)
    days, vals = P.load(CSV)
    Fx = P.facts(days, vals)
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    cx0, cx1, cy0, cy1 = 40, W - 40, 330, H - 60
    lo, hi = 3480.0, 3600.0
    X = lambda i: cx0 + (cx1 - cx0) * i / (len(vals) - 1)
    Y = lambda v: cy1 - (cy1 - cy0) * (v - lo) / (hi - lo)
    ss = 2
    layer = Image.new("RGBA", (W * ss, H * ss), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    pts = [(X(i) * ss, Y(v) * ss) for i, v in enumerate(vals)]
    ld.polygon(pts + [(pts[-1][0], Y(P.MIN_POOL) * ss), (pts[0][0], Y(P.MIN_POOL) * ss)], fill=WATER + (40,))
    ld.line(pts, fill=WATER + (255,), width=7 * ss, joint="curve")
    layer = layer.resize((W, H), Image.LANCZOS)
    d.line([(cx0, Y(P.MIN_POOL)), (cx1, Y(P.MIN_POOL))], fill=AMBER, width=4)
    im.paste(layer, (0, 0), layer)
    d = ImageDraw.Draw(im)
    ex, ey = X(len(vals) - 1), Y(vals[-1])
    d.ellipse([ex - 12, ey - 12, ex + 12, ey + 12], fill=WATER, outline=BG, width=3)
    d.text((cx0 + 6, Y(P.MIN_POOL) + 8), "3,490 ft minimum power pool", font=F("s", 26), fill=AMBER)
    d.text((44, 28), "LAKE POWELL · 3 YEARS IN SOUND", font=F("s", 34), fill=MUTED)
    if kind == "long":
        d.line([(ex, ey + 16), (ex, Y(P.MIN_POOL) - 3)], fill=AMBER, width=4)
        d.text((40, 70), f"{Fx['buffer_end']:,.1f} ft left", font=F("b", 170), fill=AMBER)
        d.text((46, 262), "above the level the dam needs to make power", font=F("s", 40), fill=INK)
        name = "lake-powell-v2-thumbnail.png"
    else:
        sp = Fx["springs"]
        d.text((40, 76), "Each spring added less", font=F("b", 96), fill=INK)
        d.text((44, 190), f"{P.signed(sp[2024]['rise'])} → {P.signed(sp[2025]['rise'])} → {P.signed(sp[2026]['rise'])} ft",
               font=F("b", 92), fill=WATER)
        for Y_ in (2024, 2025, 2026):
            j = sp[Y_]["peak_i"]
            d.ellipse([X(j) - 9, Y(vals[j]) - 9, X(j) + 9, Y(vals[j]) + 9], fill=INK)
        name = "lake-powell-short-v2-thumbnail.png"
    d.text((W - 44, H - 22), f"USGS 09379900 · {P.en_date(days[0])} to {P.en_date(days[-1])}", font=F("m", 20), fill=MUTED, anchor="rb")
    im.save(OUT / name, optimize=True)


clave()
powell("long")
powell("short")
print("wrote", sorted(p.name for p in OUT.glob("*-v2-thumbnail.png")))
