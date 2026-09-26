"""Phase three: Arizona Grid Daily posts, the weekly river segment, the sample approval queue.

python -m unittest discover -s tests -t .   (from the xbot/ folder). No network: X calls are mocked.
Fixtures: eia930_balance_SYNTHETIC_full_day.csv and usbr_mead_SYNTHETIC.csv hold MADE-UP values in the
real layouts (see tests/fixtures/make_synthetic_grid_day.py); Powell uses the committed sample CSV.
Set XBOT_EIA930_FILE to an EIA-930 balance file to also run the real-data queue test.
"""
import contextlib
import io
import json
import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

from bot import approval, checks, config, grid_post, ledger, publish, queue, river, run_daily, sample_queue, sources

HERE = Path(__file__).resolve().parents[1]
FIX = HERE / "tests" / "fixtures"
GRID_DAY = date(2026, 6, 15)            # the synthetic fixture's day (a Monday)


def grid_text():
    return (FIX / "eia930_balance_SYNTHETIC_full_day.csv").read_text()


def per_ba(day=GRID_DAY):
    return grid_post.day_rows(grid_text(), day)


def powell():
    return sources.parse_series_csv((HERE / "sample" / "usgs_09379900_lake_elevation_ft.csv").read_text())


def mead():
    return sources.parse_usbr_csv((FIX / "usbr_mead_SYNTHETIC.csv").read_text())


def quiet(fn, *a, **kw):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a, **kw)


class GridPost(unittest.TestCase):
    def test_hour_labels(self):
        self.assertEqual(grid_post.hour_label(17), ("4-5 p.m.", "16-17 h"))
        self.assertEqual(grid_post.hour_label(12), ("11 a.m.-noon", "11-12 h"))
        self.assertEqual(grid_post.hour_label(13), ("noon-1 p.m.", "12-13 h"))
        self.assertEqual(grid_post.hour_label(24), ("11 p.m.-midnight", "23-24 h"))
        self.assertEqual(grid_post.hour_label(1), ("midnight-1 a.m.", "0-1 h"))
        self.assertEqual(grid_post.hour_label(7), ("6-7 a.m.", "6-7 h"))

    def test_synthetic_day_composes_and_checks_for_every_rotation(self):
        rows = per_ba()
        self.assertEqual(grid_post.completeness(rows), {"AZPS": [], "SRP": [], "TEPC": []})
        labels = set()
        for k in range(4):                                  # the rotating fact is keyed on the date
            day = GRID_DAY + timedelta(days=k)
            m = grid_post.metrics(rows, day)
            text, alt = grid_post.compose(m)
            self.assertEqual(grid_post.factcheck(text, alt, rows, day), [], text)
            self.assertLessEqual(checks.x_weighted_length(text), 280)
            self.assertLessEqual(len(alt), config.ALT_MAX_CHARS)
            self.assertIn(config.PRELIMINARY_EN, alt)
            self.assertIn(config.PRELIMINARY_ES, alt)
            labels.add(grid_post.rotating_fact(m, text))
        self.assertEqual(labels, {"peak demand", "solar peak", "net imports", "batteries"})

    def test_mix_matches_an_independent_sum(self):
        rows = per_ba()
        m = grid_post.metrics(rows, GRID_DAY)
        gen = sum(h["net_generation"] for r in rows.values() for h in r)
        gas = sum(h["gas"] or 0 for r in rows.values() for h in r)
        self.assertEqual(m["share_pct"]["gas"], round(100 * gas / gen))
        self.assertEqual(m["mix"][0][0], "gas")

    def test_tampered_or_incomplete_posts_are_blocked(self):
        rows = per_ba()
        day = next(GRID_DAY + timedelta(days=k) for k in range(4)       # the date whose rotating fact is the peak
                   if grid_post._rotating(grid_post.metrics(rows, GRID_DAY + timedelta(days=k)))[0] == "peak demand")
        m = grid_post.metrics(rows, day)
        text, alt = grid_post.compose(m)
        gas, nuc = m["share_pct"]["gas"], m["share_pct"]["nuclear"]
        bad = {
            "fuel swap": text.replace(f"gas {gas}%", f"gas {nuc}%", 1),
            "peak": text.replace(f"{m['peak_demand_mw']:,}", f"{m['peak_demand_mw'] + 100:,}", 1),
            "url": text + " https://www.eia.gov",
            "no Spanish date": text.replace(grid_post._dates(day)[1], "hoy"),
        }
        self.assertIn(f"{m['peak_demand_mw']:,}", text)
        for name, t in bad.items():
            self.assertTrue(grid_post.factcheck(t, alt, rows, day), name)
        self.assertTrue(grid_post.factcheck(text, alt.replace(config.PRELIMINARY_ES, ""), rows, day))
        self.assertTrue(grid_post.factcheck(text, alt.replace(grid_post.hour_label(m["peak_hour_ending"])[0], "1-2 a.m."), rows, day))
        short = {ba: r[:-1] for ba, r in rows.items()}
        with tempfile.TemporaryDirectory() as tmp:
            code, bundle, detail = grid_post.make_post(short, GRID_DAY, GRID_DAY + timedelta(days=2), Path(tmp))
        self.assertEqual((code, bundle), (4, None))
        self.assertTrue(any("23 of 24 hours" in i for i in detail["issues"]))

    def test_second_reading(self):
        first = per_ba()
        second = json.loads(json.dumps(first, default=str))
        for ba in second:
            for h in second[ba]:
                h["date"] = GRID_DAY
        self.assertEqual(grid_post.revision_issues(first, second), [])
        second["SRP"][16]["demand"] += 600                  # a revised evening hour
        issues = grid_post.revision_issues(first, second)
        self.assertTrue(any(i.startswith("SRP hour 17 demand") for i in issues), issues)

    def test_bundle_carries_its_approval_code_and_reading_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, b, _ = grid_post.make_post(per_ba(), GRID_DAY, GRID_DAY + timedelta(days=2), Path(tmp), stamp="SYNTHETIC TEST DATA")
            img = Path(tmp) / b["image"]
            self.assertEqual(code, 0)
            self.assertGreater(img.stat().st_size, 10_000)
            self.assertEqual(b["approval_code"], approval.approval_code(b, img.read_bytes()))
            self.assertEqual((b["kind"], b["second_reading"]["status"]), ("az-grid-daily", "not available"))
            self.assertEqual(run_daily.post_folder(b["as_of"], "grid"), "2026-06-17-grid")


class RiverWeekly(unittest.TestCase):
    def series(self, as_of=date(2026, 6, 15)):
        return {"powell": [(d, v) for d, v in powell() if d < as_of], "mead": [(d, v) for d, v in mead() if d < as_of]}

    def test_week_composes_checks_and_renders(self):
        s = self.series()
        m = river.metrics(s)
        self.assertEqual((m["start"], m["end"]), (date(2026, 6, 8), date(2026, 6, 14)))
        text, alt = river.compose(m)
        self.assertEqual(river.factcheck(text, alt, s), [])
        self.assertLessEqual(checks.x_weighted_length(text), 280)
        self.assertIn("1,049.5 ft", text)                   # Mead on Jun 14 (synthetic 1049.55 -> 1,049.5 with round-half-even)
        with tempfile.TemporaryDirectory() as tmp:
            code, b, _ = river.make_post(s, date(2026, 6, 15), Path(tmp), stamp="SYNTHETIC MEAD VALUES")
            self.assertEqual((code, b["kind"]), (0, "river-weekly"))
            self.assertGreater((Path(tmp) / b["image"]).stat().st_size, 10_000)

    def test_tampered_stale_or_short_weeks_are_refused(self):
        s = self.series()
        text, alt = river.compose(river.metrics(s))
        self.assertTrue(river.factcheck(text.replace("1,049.5", "1,059.5"), alt, s))
        self.assertTrue(river.factcheck(text, alt.replace(config.PROVISIONAL_EN, ""), s))
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(river.make_post(s, date(2026, 6, 20), Path(tmp))[0], 3)            # stale by the morning of Jun 20
            short = {**s, "mead": s["mead"][:-7] + s["mead"][-2:]}
            self.assertEqual(river.make_post(short, date(2026, 6, 15), Path(tmp))[0], 4)        # 2 of 7 days


class SampleQueue(unittest.TestCase):
    def build(self, out):
        return quiet(sample_queue.build, out, eia_text=grid_text(), eia_sha="0" * 64, eia_note="SYNTHETIC test file.",
                     grid_days=[GRID_DAY], powell=powell(), mead=mead(), river_as_of=date(2026, 6, 15),
                     stamp_grid="SYNTHETIC TEST DATA", stamp_river="SYNTHETIC MEAD VALUES", river_source_line="test",
                     river_credits=("test", "prueba"), title="test queue", note="SYNTHETIC")

    def test_page_lists_every_post_with_its_approval_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            m = self.build(Path(tmp))
            self.assertEqual((m["summary"]["posts"], m["summary"]["ready"]), (2, 2))
            page = (Path(tmp) / "index.html").read_text()
            md = (Path(tmp) / "APPROVAL_QUEUE.md").read_text()
            for it in m["items"]:
                self.assertIn(it["approval_line"], page)
                self.assertIn(it["approval_line"], md)
                self.assertTrue((Path(tmp) / it["image"]).exists())
            self.assertIn(config.GRID_SOURCE_URL, page)

    def test_grid_post_publishes_once_and_only_with_its_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            q = Path(tmp)
            item = self.build(q)["items"][0]
            morning = date.fromisoformat(item["as_of"])
            run = lambda **kw: quiet(queue.publish_queued, q, morning, cadence="grid", today=morning, **kw)
            self.assertEqual(run(live=False)[1]["status"], "dry-run")
            self.assertEqual(run(live=True, token_provider=lambda: "t")[1]["status"], "blocked")      # no approval line yet
            (q / "APPROVED_TO_POST").write_text(item["approval_line"] + "\n")
            calls = []

            def fake_post(url, token, data=None, body=None, ctype="application/json"):
                calls.append(url)
                return {"data": {"id": "99"}} if url.endswith(("/media/upload", "/tweets")) else {}

            with mock.patch.object(publish, "_post", side_effect=fake_post):
                code, res = run(live=True, token_provider=lambda: "t")
                self.assertEqual((code, res["status"]), (0, "posted"))
                self.assertEqual(run(live=True, token_provider=lambda: "t")[0], 7)                # the posted log refuses a repeat
            self.assertEqual([u.rsplit("/2/", 1)[1] for u in calls], ["media/upload", "media/metadata", "tweets"])
            self.assertEqual([e["status"] for e in ledger.PostedLog(q / "posted_log.jsonl").entries()], ["attempt", "posted"])


@unittest.skipUnless(os.environ.get("XBOT_EIA930_FILE"), "set XBOT_EIA930_FILE to an EIA-930 balance file to run")
class RealEia930File(unittest.TestCase):
    def test_last_seven_complete_days_all_pass(self):
        text = Path(os.environ["XBOT_EIA930_FILE"]).read_text(encoding="utf-8")
        parsed = {ba: sources.parse_eia930_balance(text, ba) for ba in config.GRID_BAS}
        days = sorted({h["date"] for h in parsed["AZPS"]})
        complete = [d for d in days if not any(grid_post.completeness({ba: [h for h in r if h["date"] == d] for ba, r in parsed.items()}).values())]
        for d in complete[-7:]:
            rows = {ba: [h for h in r if h["date"] == d] for ba, r in parsed.items()}
            text_, alt = grid_post.compose(grid_post.metrics(rows, d))
            self.assertEqual(grid_post.factcheck(text_, alt, rows, d), [], (d, text_))


if __name__ == "__main__":
    unittest.main()
