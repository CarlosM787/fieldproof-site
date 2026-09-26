"""Evidence for a render's ending: every frame of the last N seconds as JPG (decoded from the MP4, not
re-drawn), a contact sheet, and the final frame with the manifest's text boxes drawn over it, so a
reviewer can see that the boxes the overlap check used sit on the real glyphs.

  python evidence_frames.py <video.mp4> <manifest.json> <out dir> [--last 1.0] [--zoom x0,y0,x1,y1]
"""
import argparse
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROLE_COL = {"chart-label": (255, 80, 200), "threshold": (255, 200, 0), "headline": (0, 255, 120), "end": (0, 200, 255),
            "beat": (0, 200, 255), "counter": (0, 200, 255), "source": (200, 200, 200), "kicker": (200, 200, 200),
            "draft-mark": (160, 160, 160), "axis": (120, 160, 255), "year": (120, 160, 255)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("manifest")
    ap.add_argument("out")
    ap.add_argument("--last", type=float, default=1.0)
    ap.add_argument("--zoom", help="crop of the final frame to enlarge 2x, as x0,y0,x1,y1")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    man = json.load(open(a.manifest, encoding="utf-8"))
    fps, n = 30, len(man["frames"])
    first = n - int(round(a.last * fps))
    stem = Path(a.video).stem
    # frame-accurate: decode from the start and keep frames first..n-1 (select by frame number)
    subprocess.run([FF, "-v", "error", "-y", "-i", a.video, "-vf", f"select=gte(n\\,{first})", "-vsync", "0", "-q:v", "2",
                    "-start_number", str(first), str(out / f"{stem}-f%05d.jpg")], check=True)
    jpgs = sorted(out.glob(f"{stem}-f*.jpg"))
    assert len(jpgs) == n - first, (len(jpgs), n - first)
    # contact sheet (every frame of the last second, small)
    ims = [Image.open(p) for p in jpgs]
    w0, h0 = ims[0].size
    tw = 320 if w0 > h0 else 180
    th = round(h0 * tw / w0)
    cols = 6 if w0 > h0 else 10
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + 6) + 6, rows * (th + 6) + 6), (40, 40, 40))
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (6 + c * (tw + 6), 6 + r * (th + 6)))
    sheet.save(out / f"{stem}-last-second-sheet.jpg", quality=88)
    # the final frame with the recorded boxes
    last = man["frames"][-1]
    layer = "plain" if last["layer"] == "plain" else "base"
    boxes = man["layout"]["static"][layer] + last["texts"]
    im = Image.open(jpgs[-1]).convert("RGB")
    d = ImageDraw.Draw(im)
    for role, text, x0, y0, x1, y1 in boxes:
        d.rectangle([x0, y0, x1, y1], outline=ROLE_COL.get(role, (255, 255, 255)), width=1)
    for m in last.get("marks", []):
        d.rectangle(m[1:], outline=(255, 60, 60), width=1)
    sx0, sy0, sx1, sy1 = man["layout"]["safe_area"]
    d.rectangle([sx0, sy0, sx1, sy1], outline=(255, 60, 60), width=2)
    im.save(out / f"{stem}-final-frame-boxes.jpg", quality=92)
    if a.zoom:
        x0, y0, x1, y1 = (int(v) for v in a.zoom.split(","))
        crop = Image.open(jpgs[-1]).convert("RGB").crop((x0, y0, x1, y1))
        crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS).save(out / f"{stem}-final-frame-zoom.jpg", quality=92)
    print(json.dumps({"video": a.video, "frames": [first, n - 1], "jpgs": len(jpgs), "sheet": str(out / f"{stem}-last-second-sheet.jpg"),
                      "boxes_on_final_frame": len(boxes)}))


if __name__ == "__main__":
    main()
