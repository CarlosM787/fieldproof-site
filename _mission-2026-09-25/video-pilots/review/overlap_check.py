"""Layout check for every frame of a render: no text box may touch another, touch the moving marks
(the pen, its bracket, the crossing ring) or the drawn curve, or leave the format's safe area.

  python overlap_check.py <manifest.json>... [--profile NAME] [--also NAME ...] [--json out.json]

Input: the manifest desert-systems/lake_powell_v2.py writes next to each MP4 (or with --layout-only):
  layout.static.{plain,base}  text boxes drawn once on the static layers  [role, text, x0, y0, x1, y1]
  frames[f].layer             "plain" (intro), "blend" (intro -> chart crossfade) or "base"
  frames[f].texts             every string drawn on that frame, with its box
  frames[f].marks             the moving marks' boxes; frames[f].curve_upto: the last day drawn
  layout.curve_px             the curve's points (px); layout.curve_width_px its stroke
Boxes are Pillow's ink boxes for the anchor used (where the glyphs land). Two boxes collide when
they share any area (touching edges do not). The safe areas are defined HERE, independently of the
renderer (which keeps its own copy):
  16:9  title-safe 90%: x 96-1824, y 54-1026 (broadcast practice; INFERENCE for YouTube's player)
  9:16  shorts-google: x 54-972, y 192-1440 = nothing in the top 10%, bottom 25%, right 10% (REPORTED:
        Google's vertical-ad guidance as quoted in search results 2026-09-26) plus a 5% left margin
Other Shorts profiles can be reported with --also (never enforced): shorts-typical (top 120 px,
bottom 300, right 96; REPORTED third-party guides) and shorts-strict (top 380, bottom 380, left 60,
right 120; REPORTED, the most conservative guide found).
Exit code 1 on any violation of the enforced profile.
"""
import argparse
import json
import sys

import numpy as np

PROFILES = {
    "title-safe-90": {"size": (1920, 1080), "box": (96, 54, 1824, 1026)},
    "shorts-google": {"size": (1080, 1920), "box": (54, 192, 972, 1440)},
    "shorts-typical": {"size": (1080, 1920), "box": (0, 120, 984, 1620)},
    "shorts-strict": {"size": (1080, 1920), "box": (60, 380, 960, 1540)},
}
DEFAULT = {(1920, 1080): "title-safe-90", (1080, 1920): "shorts-google"}


def collide(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def gap(a, b):
    """Clearance between two boxes: the largest separation along x or y (negative = overlap depth)."""
    return max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3])


def visible(man, fr):
    st = man["layout"]["static"]
    layer = "plain" if fr["layer"] == "plain" else "base"      # blend frames show base, a superset of plain
    return [tuple(b) for b in st[layer]] + [tuple(b) for b in fr["texts"]]


def check(man, profile, tight_px=4, limit=25):
    sx0, sy0, sx1, sy1 = PROFILES[profile]["box"]
    curve = np.array(man["layout"]["curve_px"])
    hw = man["layout"]["curve_width_px"] / 2 + 1.0              # stroke half-width plus antialiasing
    res = {"profile": profile, "safe_area": [sx0, sy0, sx1, sy1], "frames_checked": 0, "text_boxes_checked": 0,
           "text_pairs_checked": 0, "text_text_overlaps": 0, "off_safe_area": 0, "text_mark_overlaps": 0,
           "text_curve_overlaps": 0, "tight_pairs_under_px": {str(tight_px): 0}, "min_text_gap_px": None, "min_gap_pair": None,
           "distinct_texts": 0, "violations": []}
    seen_texts = set()
    viol = res["violations"]

    def bad(kind, f, *what):
        res[kind] += 1
        if len(viol) < limit:
            viol.append({"frame": f, "type": kind, "what": what})

    for fr in man["frames"]:
        f = fr["f"]
        boxes = visible(man, fr)
        res["frames_checked"] += 1
        res["text_boxes_checked"] += len(boxes)
        for b in boxes:
            seen_texts.add((b[0], b[1]))
            x0, y0, x1, y1 = b[2:]
            if x0 < sx0 or y0 < sy0 or x1 > sx1 or y1 > sy1:
                bad("off_safe_area", f, b[0], b[1], [x0, y0, x1, y1])
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i][2:], boxes[j][2:]
                res["text_pairs_checked"] += 1
                g = gap(a, b)
                if res["min_text_gap_px"] is None or g < res["min_text_gap_px"]:
                    res["min_text_gap_px"] = g
                    res["min_gap_pair"] = {"frame": f, "a": boxes[i][:2], "b": boxes[j][:2]}
                if collide(a, b):
                    bad("text_text_overlaps", f, boxes[i][:2], boxes[j][:2], a, b)
                elif g < tight_px:
                    res["tight_pairs_under_px"][str(tight_px)] += 1
        for m in fr.get("marks", []):
            for b in boxes:
                if collide(m[1:], b[2:]):
                    bad("text_mark_overlaps", f, m[0], b[:2])
        if "curve_upto" in fr:
            pts = curve[: fr["curve_upto"] + 1]
            for b in boxes:
                x0, y0, x1, y1 = b[2:]
                hit = (pts[:, 0] > x0 - hw) & (pts[:, 0] < x1 + hw) & (pts[:, 1] > y0 - hw) & (pts[:, 1] < y1 + hw)
                if hit.any():
                    bad("text_curve_overlaps", f, b[:2], [x0, y0, x1, y1])
    res["distinct_texts"] = len(seen_texts)
    res["violation_count"] = res["text_text_overlaps"] + res["off_safe_area"] + res["text_mark_overlaps"] + res["text_curve_overlaps"]
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("manifests", nargs="+")
    ap.add_argument("--profile", help="enforced profile (default: by frame size)")
    ap.add_argument("--also", nargs="*", default=[], help="extra profiles to report (not enforced)")
    ap.add_argument("--json", help="write the full report here")
    a = ap.parse_args(argv)
    report, failed = [], False
    for path in a.manifests:
        man = json.load(open(path, encoding="utf-8"))
        size = tuple(man["size"])
        prof = a.profile or DEFAULT[size]
        r = {"manifest": path, "size": list(size), "final": man.get("final"), **check(man, prof)}
        r["also"] = {p: {k: v for k, v in check(man, p, limit=5).items() if k in ("off_safe_area", "violations")}
                     for p in a.also if PROFILES[p]["size"] == size}
        failed |= r["violation_count"] > 0
        report.append(r)
        short = {k: r[k] for k in ("manifest", "profile", "frames_checked", "text_boxes_checked", "text_pairs_checked", "distinct_texts",
                                   "text_text_overlaps", "off_safe_area", "text_mark_overlaps", "text_curve_overlaps",
                                   "min_text_gap_px", "min_gap_pair", "tight_pairs_under_px")}
        print(json.dumps(short, ensure_ascii=False))
        for v in r["violations"][:8]:
            print("  VIOLATION", json.dumps(v, ensure_ascii=False))
        for p, rr in r["also"].items():
            print(f"  (also, not enforced) {p}: off-safe-area boxes {rr['off_safe_area']}",
                  json.dumps(rr["violations"][:2], ensure_ascii=False))
    total = {"frames_checked": sum(r["frames_checked"] for r in report), "text_boxes_checked": sum(r["text_boxes_checked"] for r in report),
             "text_pairs_checked": sum(r["text_pairs_checked"] for r in report), "violations": sum(r["violation_count"] for r in report)}
    print(json.dumps({"total": total, "result": "FAIL" if failed else "PASS"}))
    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump({"total": total, "reports": report}, fh, ensure_ascii=False, indent=1)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
