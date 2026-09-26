"""Layout tests for Pilot B (Lake Powell): the overlap/safe-area checker and the fixed label placer.

  python -m unittest discover -s tests -t .      (from video-pilots/; no network, no video encode)
"""
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "desert-systems"))
sys.path.insert(0, str(HERE / "review"))
import lake_powell_v2 as P  # noqa: E402
import overlap_check as OC  # noqa: E402

CSV = HERE.parent / "xbot" / "sample" / "usgs_09379900_lake_elevation_ft.csv"
FONTS = HERE.parent / "xbot" / "fonts"


def data():
    days, vals = P.load(CSV)
    return days, vals, P.facts(days, vals), P.Fonts(FONTS)


def tiny_manifest(frames, static_base=(), size=(1920, 1080)):
    return {"size": list(size), "layout": {"static": {"plain": [], "base": list(static_base)}, "curve_px": [[500.0, 500.0]],
                                           "curve_width_px": 5}, "frames": frames}


class Checker(unittest.TestCase):
    def test_flags_each_kind_of_violation(self):
        frames = [
            {"f": 0, "layer": "base", "texts": [["a", "A", 200, 200, 300, 240], ["b", "B", 290, 230, 400, 270]], "marks": []},  # overlap
            {"f": 1, "layer": "base", "texts": [["a", "A", 20, 200, 100, 240]], "marks": []},                                  # off safe
            {"f": 2, "layer": "base", "texts": [["a", "A", 200, 200, 300, 240]], "marks": [["pen", 290, 230, 310, 250]]},   # mark
            {"f": 3, "layer": "base", "texts": [["a", "A", 480, 480, 520, 520]], "marks": [], "curve_upto": 0},             # curve
            {"f": 4, "layer": "base", "texts": [["a", "A", 200, 200, 300, 240], ["b", "B", 300, 200, 400, 240]], "marks": []},  # touching
        ]
        r = OC.check(tiny_manifest(frames), "title-safe-90")
        self.assertEqual((r["text_text_overlaps"], r["off_safe_area"], r["text_mark_overlaps"], r["text_curve_overlaps"]), (1, 1, 1, 1))
        self.assertEqual(r["frames_checked"], 5)
        self.assertEqual(r["min_text_gap_px"], -10)           # the overlap is 10 px deep on its shallow axis
        self.assertEqual(r["tight_pairs_under_px"]["4"], 1)   # the touching pair: allowed, but reported as tight

    def test_static_texts_join_every_frame_and_blend_uses_base(self):
        static = [["kicker", "K", 200, 100, 300, 130]]
        frames = [{"f": 0, "layer": "blend", "texts": [["x", "X", 250, 110, 280, 140]], "marks": []},
                  {"f": 1, "layer": "plain", "texts": [["x", "X", 250, 110, 280, 140]], "marks": []}]
        r = OC.check(tiny_manifest(frames, static), "title-safe-90")
        self.assertEqual(r["text_text_overlaps"], 1)          # frame 0 sees the base layer's kicker; frame 1 (plain) does not

    def test_shorts_profile_is_enforced_by_size(self):
        frames = [{"f": 0, "layer": "base", "texts": [["mark", "PRIVATE", 60, 1870, 400, 1890]], "marks": []}]
        man = tiny_manifest(frames, size=(1080, 1920))
        self.assertEqual(OC.DEFAULT[(1080, 1920)], "shorts-google")
        self.assertEqual(OC.check(man, "shorts-google")["off_safe_area"], 1)   # the v2 draft mark sat in the Shorts UI zone


class InkBoxes(unittest.TestCase):
    def test_recorded_box_contains_every_drawn_pixel(self):
        """The checker trusts Pillow's text boxes: every inked pixel must fall inside the recorded box."""
        fonts = P.Fonts(FONTS)
        for s, w, size, anchor in (("−11.3", "b", 44, "mt"), ("below 3,525 ft", "s", 30, "rt"), ("3,516.4 ft · Sep 16 · lowest", "s", 26, "rb"),
                                   ("Cada primavera sumó menos. Tres años: −55.8 pies.", "r", 38, "la"), ("2026", "m", 24, "lb")):
            im = Image.new("L", (1400, 300), 0)
            box = P.Ink().text(ImageDraw.Draw(im), (700, 150), s, fonts(w, size), 255, anchor)
            ink = im.getbbox()
            self.assertIsNotNone(ink)
            self.assertTrue(box[0] <= ink[0] and box[1] <= ink[1] and ink[2] <= box[2] + 1 and ink[3] <= box[3] + 1, (s, box, ink))


class PlacerFix(unittest.TestCase):
    def legacy_final_label_boxes(self):
        """The phase-two placer, verbatim in its logic: segment labels first, then the crossing and the
        low label, with the vertical test `y1 > b[1] + pad` and only the target label reserved."""
        days, vals, F, fonts = data()
        ch = P.Chart((110, 430, 1600, 950), days, vals)
        d = ImageDraw.Draw(Image.new("RGB", (1920, 1080)))
        tl, lf, sf = fonts("s", 30), fonts("b", 44), fonts("s", 30)
        reserved = [d.textbbox((ch.x0 + 8, ch.Y(P.TARGET) - 8), "3,525 ft · protection target", font=tl, anchor="lb")]
        xs = np.array([ch.X(i) for i in range(ch.n)])
        ys = np.array([ch.Y(v) for v in ch.vals])
        boxes = list(reserved)

        def free(box, pad=9):
            x0, y0, x1, y1 = box
            if x0 < ch.x0 + 2 or x1 > ch.x1 - 2 or y0 < ch.y0 + 2 or y1 > ch.Y(P.MIN_POOL) - 4:
                return False
            m = (xs >= x0 - pad) & (xs <= x1 + pad)
            if np.any((ys[m] >= y0 - pad - 4) & (ys[m] <= y1 + pad + 4)):
                return False
            return not any(x0 < b[2] + pad and x1 > b[0] - pad and y0 < b[3] + pad and y1 > b[1] + pad for b in boxes)

        def place(text, font, x, y, prefer):
            for dist in (0, 14, 30, 50, 80, 120, 170):
                for anchor, dx, dy in prefer:
                    box = d.textbbox((x + dx * (1 + dist / 20), y + dy * (1 + dist / 20)), text, font=font, anchor=anchor)
                    if free(box):
                        boxes.append(box)
                        return text, box
            raise ValueError(text)

        up = [("mb", 0, -16), ("lb", 10, -16), ("rb", -10, -16), ("mt", 0, 22)]
        down = [("mt", 0, 30), ("lt", 10, 30), ("rt", -10, 30), ("mb", 0, -22)]
        out = []
        for sg in F["segments"]:
            if sg["change"] >= 0:
                out.append(place(P.signed(sg["change"]), lf, ch.X(sg["b"]), ch.Y(vals[sg["b"]]), up))
            else:
                mid = (sg["a"] + sg["b"]) // 2
                out.append(place(P.signed(sg["change"]), lf, ch.X(mid), ch.Y(vals[mid]), down))
        ci, li = F["cross_i"], F["low_i"]
        out.append(place("below 3,525 ft", sf, ch.X(ci), ch.Y(P.TARGET), [("rb", -12, -12), ("lb", 12, -12), ("rt", -12, 12)]))
        out.append(place(f"{vals[li]:,.1f} ft · {P.en_date(days[li], year=False)} · lowest", sf, ch.X(li), ch.Y(vals[li]),
                         [("rt", -14, 18), ("rb", -14, -18), ("mt", 0, 24)]))
        return dict(out)

    def test_the_phase_two_collision_is_reproduced_and_caught(self):
        b = self.legacy_final_label_boxes()
        self.assertTrue(OC.collide(b["−11.3"], b["below 3,525 ft"]), (b["−11.3"], b["below 3,525 ft"]))

    def test_fixed_placer_keeps_a_gap_between_all_chart_labels(self):
        days, vals, F, fonts = data()
        for kind in ("long", "short"):
            plan = P.Plan(kind, days, vals, F, fonts, final=False)
            boxes = list(plan.label_boxes.items())
            for i in range(len(boxes)):
                for j in range(i + 1, len(boxes)):
                    self.assertGreaterEqual(OC.gap(boxes[i][1], boxes[j][1]), 9, (kind, boxes[i][0], boxes[j][0]))


class WholeVideos(unittest.TestCase):
    """Every frame of both formats (layout only, no encode): what run.py's B3 step runs on real renders."""

    def test_every_frame_is_clean_in_both_formats_draft_and_final(self):
        days, vals, F, fonts = data()
        for final in (False, True):
            for kind, frames in (("long", 2124), ("short", 1296)):
                man = P.layout_only(kind, days, vals, F, fonts, final)
                r = OC.check(man, OC.DEFAULT[tuple(man["size"])])
                self.assertEqual(r["frames_checked"], frames)
                self.assertEqual(r["violation_count"], 0, (kind, final, r["violations"][:3]))


if __name__ == "__main__":
    unittest.main()
