"""refresh_powell_csv.py, offline: saved USGS responses stand in for the network.

The responses are built from the committed CSV (the same values in the USGS Water Data API's GeoJSON
shape and the legacy NWIS WaterML-JSON shape), so an unchanged refresh must compare as identical.
"""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "desert-systems"))
import refresh_powell_csv as R  # noqa: E402


def committed():
    return R.sources.parse_series_csv(R.COMMITTED.read_text())


def waterdata_json(series):
    return json.dumps({"type": "FeatureCollection", "numberReturned": len(series), "features": [
        {"type": "Feature", "properties": {"time": str(d), "value": f"{v:.2f}", "statistic_id": "00003",
                                           "approval_status": "Provisional"}} for d, v in series]})


def nwis_json(series):
    return json.dumps({"value": {"timeSeries": [{"values": [{"value": [{"dateTime": f"{d}T00:00:00", "value": str(v)} for d, v in series]}]}]}})


class Refresh(unittest.TestCase):
    def run_(self, payload, *extra):
        with tempfile.TemporaryDirectory() as tmp:
            src, out = Path(tmp) / "resp.json", Path(tmp) / "out.csv"
            src.write_text(payload)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = R.main(["--out", str(out), "--source", f"file:{src}", *extra])
            written = out.read_text() if out.exists() else ""
            return code, json.loads(buf.getvalue()), written

    def test_identical_data_needs_no_rerender(self):
        for payload in (waterdata_json(committed()), nwis_json(committed())):
            code, rep, written = self.run_(payload)
            self.assertEqual((code, rep["values_changed"], rep["dates_compared"]), (0, 0, 1096))
            self.assertEqual(R.sources.parse_series_csv(written), committed())   # same days, same values, readable by the renderer
            self.assertEqual(written.splitlines()[2], "date,elevation_ft")

    def test_a_revised_value_asks_for_a_rerender(self):
        s = committed()
        s[500] = (s[500][0], s[500][1] + 0.3)
        code, rep, _ = self.run_(waterdata_json(s))
        self.assertEqual((code, rep["values_changed"]), (2, 1))
        self.assertEqual(rep["first_changes"][0][0], str(s[500][0]))

    def test_a_missing_day_or_a_jump_is_refused(self):
        s = committed()
        code, rep, written = self.run_(waterdata_json(s[:300] + s[301:]))
        self.assertEqual((code, written), (1, ""))
        self.assertIn("1095 of 1096 days", rep["problems"][0])
        s[700] = (s[700][0], s[700][1] + 5)
        code, rep, _ = self.run_(waterdata_json(s))
        self.assertEqual(code, 1)
        self.assertTrue(any("jump" in p for p in rep["problems"]))

    def test_urls_ask_for_exactly_the_video_window(self):
        u = R.urls(R.date(2023, 9, 25), R.date(2026, 9, 24))
        self.assertIn("monitoring_location_id=USGS-09379900", u["waterdata"])
        self.assertIn("parameter_code=62614", u["waterdata"])
        self.assertIn("time=2023-09-25T00:00:00Z/2026-09-24T23:59:59Z", u["waterdata"])
        self.assertIn("startDT=2023-09-25&endDT=2026-09-24", u["nwis"])


if __name__ == "__main__":
    unittest.main()
