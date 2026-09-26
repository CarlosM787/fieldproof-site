"""Frame extraction and phone-scale contact sheets for reviewing a render.

  python frames.py <video.mp4> <out dir> [--fps 1] [--at 0.1,3.3,...] [--sheet-width 300] [--cols 4]

Writes every requested frame as PNG (full size) plus contact sheets where each frame is scaled to
roughly the size a phone shows it: a 1080-px-wide vertical frame on a ~390 CSS-px-wide screen is
about 0.36x, so --sheet-width 390 is "phone size" for Shorts, and a 16:9 frame watched in portrait
is also about 390 CSS px wide. Each tile is labelled with its timestamp.
"""
import argparse
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

FF = imageio_ffmpeg.get_ffmpeg_exe()


def grab(video, t, out_png):
    """Exact frame at time t (decode from the start of the GOP; -ss after -i is frame accurate)."""
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{max(0, t - 2):.3f}", "-i", str(video), "-ss", f"{min(t, 2):.3f}",
                    "-frames:v", "1", str(out_png)], check=True)


def grab_fps(video, fps, out_dir):
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", str(video), "-vf", f"fps={fps}:round=down", str(out_dir / "s%04d.png")], check=True)
    # s0001 is t=0, s0002 is t=1/fps, ...
    return sorted(out_dir.glob("s*.png"))


def sheet(pngs, labels, out, tile_w=300, cols=4):
    ims = [Image.open(p).convert("RGB") for p in pngs]
    w0, h0 = ims[0].size
    tile_h = round(h0 * tile_w / w0)
    rows = (len(ims) + cols - 1) // cols
    pad, lab = 8, 22
    S = Image.new("RGB", (cols * (tile_w + pad) + pad, rows * (tile_h + lab + pad) + pad), (40, 40, 40))
    d = ImageDraw.Draw(S)
    try:
        f = ImageFont.truetype("DejaVuSans.ttf", 15)
    except OSError:
        f = ImageFont.load_default()
    for i, (im, l) in enumerate(zip(ims, labels)):
        r, c = divmod(i, cols)
        x, y = pad + c * (tile_w + pad), pad + r * (tile_h + lab + pad)
        S.paste(im.resize((tile_w, tile_h), Image.LANCZOS), (x, y + lab))
        d.text((x + 2, y + 2), l, fill=(255, 255, 0), font=f)
    S.save(out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("--fps", type=float, default=0)
    ap.add_argument("--at", default="")
    ap.add_argument("--sheet-width", type=int, default=300)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--per-sheet", type=int, default=8)
    ap.add_argument("--prefix", default="sheet")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    items = []
    if a.fps:
        d = out / "fps"
        d.mkdir(exist_ok=True)
        for i, p in enumerate(grab_fps(a.video, a.fps, d)):
            items.append((p, f"{i / a.fps:5.1f}s"))
    if a.at:
        d = out / "at"
        d.mkdir(exist_ok=True)
        for t in [float(x) for x in a.at.split(",") if x]:
            p = d / f"t{t:07.3f}.png"
            grab(a.video, t, p)
            items.append((p, f"{t:6.2f}s"))
    for k in range(0, len(items), a.per_sheet):
        chunk = items[k:k + a.per_sheet]
        s = sheet([p for p, _ in chunk], [l for _, l in chunk], out / f"{a.prefix}-{k // a.per_sheet:02d}.png", a.sheet_width, a.cols)
        print(s)


if __name__ == "__main__":
    main()
