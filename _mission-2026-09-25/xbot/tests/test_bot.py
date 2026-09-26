"""python -m unittest discover -s tests -t .   (from the xbot/ folder)"""
import json
import unittest
from datetime import date, timedelta
from pathlib import Path

from bot import checks, compose, publish, sources

HERE = Path(__file__).resolve().parents[1]
FIXTURE = HERE / "sample" / "usgs_09379900_lake_elevation_ft.csv"


def real_series():
    return sources.parse_series_csv(FIXTURE.read_text())


class Validate(unittest.TestCase):
    def test_real_data_passes(self):
        s = real_series()
        self.assertEqual(checks.validate(s, date(2026, 9, 25)), [])

    def test_stale_is_skipped(self):
        s = real_series()
        issues = checks.validate(s, date(2026, 9, 30))
        self.assertTrue(any(i.startswith("stale") for i in issues))

    def test_jump_is_flagged(self):
        s = real_series()
        s[-1] = (s[-1][0], s[-1][1] + 5)
        self.assertTrue(any("jump" in i for i in checks.validate(s, date(2026, 9, 25))))

    def test_unit_error_is_flagged(self):
        s = real_series()
        s[-1] = (s[-1][0], 1072.1)  # metres, or another reservoir
        self.assertTrue(any("out of range" in i for i in checks.validate(s, date(2026, 9, 25))))


class FactCheck(unittest.TestCase):
    def test_every_day_of_the_last_year_composes_and_checks(self):
        full = real_series()
        failures = []
        for cut in range(len(full) - 365, len(full) + 1):
            s = full[:cut]
            text, alt = compose.compose(checks.metrics(s))
            p = checks.factcheck(text, alt, s)
            if p:
                failures.append((s[-1][0], p))
        self.assertEqual(failures, [])

    def test_tampered_number_is_blocked(self):
        s = real_series()
        text, alt = compose.compose(checks.metrics(s))
        bad = text.replace("27.5", "37.5")
        self.assertTrue(checks.factcheck(bad, alt, s))

    def test_url_is_blocked(self):
        s = real_series()
        text, alt = compose.compose(checks.metrics(s))
        self.assertTrue(any("URL" in p for p in checks.factcheck(text + " https://x.co", alt, s)))

    def test_x_weighted_length(self):
        self.assertEqual(checks.x_weighted_length("-1.0"), 4)
        self.assertEqual(checks.x_weighted_length("−1.0"), 5)  # U+2212 counts twice
        self.assertEqual(checks.x_weighted_length("día"), 3)


class Publish(unittest.TestCase):
    def test_default_is_dry_run(self):
        r = publish.publish({"text": "t", "image": "i.png", "alt": "a"}, HERE, live=False)
        self.assertEqual(r["status"], "dry-run")

    def test_live_needs_token_and_approval(self):
        import os
        os.environ.pop("X_USER_TOKEN", None)
        r = publish.publish({"text": "t", "image": "i.png", "alt": "a"}, HERE, live=True)
        self.assertEqual(r["status"], "blocked")


if __name__ == "__main__":
    unittest.main()
