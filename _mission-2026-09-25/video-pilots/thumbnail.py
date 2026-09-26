"""Thumbnails from a JSON template: 1280x720 (or --scale 3 for 3840x2160), JPG under 2 MB.

  python thumbnail.py --spec templates/thumbnails/lake-powell.json --var still=OUT/desert-systems/lake-powell-v2-still-end.jpg \\
                      --facts OUT/desert-systems/lake-powell-v2-facts.json --out OUT/thumbnails/lake-powell-v2.jpg
  python thumbnail.py --spec templates/thumbnails/clave-lab.json --episode clave-lab/episode_v2.mjs \\
                      --var still=OUT/clave-lab/still-feet.jpg --out OUT/thumbnails/where-is-the-1-v2.jpg

A template is: "background" (an image, e.g. a still the render saved, cropped to fill and darkened,
or a flat colour), and "blocks" of text, each with a font, size, colour, position and maximum width.
Text may use {placeholders}: values from --facts (a render's facts JSON, so numbers match the video),
from --episode (hook_en, hook_es, line1_en, line1_es ...) and from --var key=value. A block that is
too wide wraps to at most its max_lines, then shrinks in 4 px steps down to min_size.
Checks (the render fails on any): every text box inside a 4% margin; nothing in the bottom-right
corner where YouTube draws the duration (the "avoid" boxes, INFERENCE); no two text boxes touching;
text/background contrast >= 3:1 (WCAG AA for large text) measured on the pixels behind each box; JPG
under 2 MB (the mobile-app upload limit, REPORTED; desktop allows 50 MB).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat

HERE = Path(__file__).resolve().parent
W0, H0 = 1280, 720
MAX_BYTES = 2_000_000


def hex_rgb(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def luminance(rgb) -> float:
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def fill_vars(s: str, v: dict) -> str:
    try:
        return s.format(**v)
    except KeyError as e:
        raise SystemExit(f"template needs a value for {e}: pass --var, --facts or --episode")


def load_vars(a) -> dict:
    v = {}
    if a.facts:
        f = json.loads(Path(a.facts).read_text())
        for k, x in f.items():
            if isinstance(x, (int, float)):
                v[k] = f"{x:,.1f}" if isinstance(x, float) else f"{x:,}"
        for Y, s in (f.get("springs") or {}).items():
            v[f"rise_{Y}"] = ("+" if s["rise"] >= 0 else "−") + f"{abs(s['rise']):.1f}"
        if "three_year_change" in f:
            x = f["three_year_change"]
            v["three_year_change_signed"] = ("+" if x >= 0 else "−") + f"{abs(x):.1f}"
    if a.episode:
        ep_path = HERE / a.episode
        ep = json.loads(subprocess.run(["node", "-e", f"import('./{ep_path.name}').then(m=>console.log(JSON.stringify(m.EPISODE)))"],
                                       cwd=ep_path.parent, capture_output=True, text=True, check=True).stdout)
        v.update({"hook_en": ep["hook"]["en"], "hook_es": ep["hook"]["es"], "cta": ep.get("cta", ""),
                  "line1_en": ep["measures"][0]["en"].replace("*", ""), "line1_es": ep["measures"][0]["es"].replace("*", ""),
                  "episode_id": ep["id"]})
    for kv in a.var or []:
        k, _, x = kv.partition("=")
        v[k] = x
    return v


def _split(d, text, f, max_w, n):
    """`text` in n lines no wider than max_w: the most even split, never a lone last word; None if impossible."""
    words = text.split(" ")
    if n == 1:
        return [text] if d.textlength(text, font=f) <= max_w else None
    best = None
    for k in range(1, len(words)):
        rest = _split(d, " ".join(words[k:]), f, max_w, n - 1)
        a = " ".join(words[:k])
        if rest is None or d.textlength(a, font=f) > max_w or len(words) - k < n - 1:
            continue
        lines = [a] + rest
        widths = [d.textlength(l, font=f) for l in lines]
        score = max(widths) - min(widths) + (10_000 if len(lines[-1].split(" ")) == 1 else 0)
        if best is None or score < best[0]:
            best = (score, lines)
    return best[1] if best else None


def wrap_fit(d, text, font_path, size, min_size, max_w, max_lines):
    """Fewest lines first: the largest size (size down to min_size, 4 px steps) at which the text fits in
    1 line, else in 2 ... up to max_lines, split evenly."""
    for n in range(1, max_lines + 1):
        s = size
        while s >= min_size:
            f = ImageFont.truetype(font_path, s)
            lines = _split(d, text, f, max_w, n)
            if lines:
                return f, lines
            s -= 4
    raise SystemExit(f"text does not fit: {text!r}")


def render(spec: dict, v: dict, out: Path, scale: int = 1, base: Path = HERE) -> dict:
    W, H = W0 * scale, H0 * scale
    bg = spec["background"]
    if bg.get("image"):
        im = Image.open(fill_vars(bg["image"], v)).convert("RGB")
        if bg.get("crop"):                                   # a region of the source frame, in its own pixels
            im = im.crop(tuple(bg["crop"]))
        k = max(W / im.width, H / im.height)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        fx, fy = bg.get("focus", [0.5, 0.5])
        x0 = int((im.width - W) * fx)
        y0 = int((im.height - H) * fy)
        im = im.crop((x0, y0, x0 + W, y0 + H))
        if bg.get("blur"):
            im = im.filter(ImageFilter.GaussianBlur(bg["blur"] * scale))
        if bg.get("darken"):
            im = Image.blend(im, Image.new("RGB", (W, H), hex_rgb(bg.get("color", "#000000"))), bg["darken"])
    else:
        im = Image.new("RGB", (W, H), hex_rgb(bg["color"]))
    for g in spec.get("gradients", []):                       # left-to-right shade behind the text column
        x0, x1, a0, a1 = g["x0"] * scale, g["x1"] * scale, g["from"], g["to"]
        sh = Image.new("RGB", (W, H), hex_rgb(g["color"]))
        mask = Image.new("L", (W, H), 0)
        md = ImageDraw.Draw(mask)
        for x in range(int(x0), int(x1)):
            md.line([(x, 0), (x, H)], fill=int(255 * (a0 + (a1 - a0) * (x - x0) / max(1, x1 - x0))))
        md.rectangle([0, 0, int(x0), H], fill=int(255 * a0))
        im = Image.composite(sh, im, mask)
    clean_bg = im.copy()
    d = ImageDraw.Draw(im)
    fonts = {k: str((base / p).resolve()) for k, p in spec["fonts"].items()}
    boxes = []
    for b in spec["blocks"]:
        text = fill_vars(b["text"], v)
        f, lines = wrap_fit(d, text, fonts[b["font"]], b["size"] * scale, b.get("min_size", b["size"]) * scale,
                            b["max_w"] * scale, b.get("max_lines", 1))
        x, y = b["xy"][0] * scale, b["xy"][1] * scale
        step = b.get("line_height", 1.08) * f.size
        for ln in lines:
            d.text((x, y), ln, font=f, fill=hex_rgb(b["color"]))
            box = d.textbbox((x, y), ln, font=f)
            behind = ImageStat.Stat(clean_bg.crop(box)).mean
            boxes.append({"text": ln, "box": [int(c) for c in box], "contrast": round(contrast(hex_rgb(b["color"]), behind), 2)})
            y += step
    if spec.get("badge"):                                    # a small label, e.g. SHORT or EN/ES
        bd = spec["badge"]
        f = ImageFont.truetype(fonts[bd["font"]], bd["size"] * scale)
        x, y = bd["xy"][0] * scale, bd["xy"][1] * scale
        tb = d.textbbox((x, y), bd["text"], font=f)
        pad = 10 * scale
        d.rounded_rectangle([tb[0] - pad, tb[1] - pad, tb[2] + pad, tb[3] + pad], radius=8 * scale, fill=hex_rgb(bd["fill"]))
        d.text((x, y), bd["text"], font=f, fill=hex_rgb(bd["color"]))
        boxes.append({"text": bd["text"], "box": [tb[0] - pad, tb[1] - pad, tb[2] + pad, tb[3] + pad],
                      "contrast": round(contrast(hex_rgb(bd["color"]), hex_rgb(bd["fill"])), 2)})
    # checks
    problems = []
    m = spec.get("margin_pct", 4) / 100
    safe = (W * m, H * m, W * (1 - m), H * (1 - m))
    avoid = [[c * scale for c in r] for r in spec.get("avoid", [[1100, 650, 1280, 720]])]
    for bx in boxes:
        x0, y0, x1, y1 = bx["box"]
        if x0 < safe[0] or y0 < safe[1] or x1 > safe[2] or y1 > safe[3]:
            problems.append(f"outside the {spec.get('margin_pct', 4)}% margin: {bx['text']!r}")
        for r in avoid:
            if x0 < r[2] and r[0] < x1 and y0 < r[3] and r[1] < y1:
                problems.append(f"under the duration badge: {bx['text']!r}")
        if bx["contrast"] < spec.get("min_contrast", 3.0):
            problems.append(f"contrast {bx['contrast']}:1 for {bx['text']!r}")
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i]["box"], boxes[j]["box"]
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                problems.append(f"text boxes touch: {boxes[i]['text']!r} / {boxes[j]['text']!r}")
    out.parent.mkdir(parents=True, exist_ok=True)
    q = 92
    while True:
        im.save(out, quality=q, optimize=True, progressive=True)
        if out.stat().st_size <= MAX_BYTES or q <= 60:
            break
        q -= 6
    if out.stat().st_size > MAX_BYTES:
        problems.append(f"{out.stat().st_size} bytes (limit {MAX_BYTES})")
    report = {"out": str(out), "size": [W, H], "bytes": out.stat().st_size, "jpeg_quality": q, "texts": boxes,
              "min_contrast": min((b["contrast"] for b in boxes), default=None), "problems": problems}
    out.with_suffix(".json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--facts")
    ap.add_argument("--episode")
    ap.add_argument("--var", action="append", help="key=value for {key} in the template")
    ap.add_argument("--scale", type=int, default=1, help="3 renders 3840x2160 (YouTube's 4K recommendation)")
    a = ap.parse_args(argv)
    spec_path = Path(a.spec)
    spec = json.loads(spec_path.read_text())
    r = render(spec, load_vars(a), Path(a.out), a.scale, base=spec_path.parent)
    print(json.dumps({k: r[k] for k in ("out", "size", "bytes", "min_contrast", "problems")}, ensure_ascii=False))
    return 1 if r["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
