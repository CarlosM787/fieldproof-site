"""Phase-two hardening: posted log, provisional note, weekly cadence, approval queue, sources.

python -m unittest discover -s tests -t .   (from the xbot/ folder). No network: X calls are mocked.
"""
import argparse
import contextlib
import io
import json
import os
import tempfile
import unittest
import urllib.error
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from bot import approval, checks, compose, config, ledger, publish, queue, render, run_daily, sources, xauth

HERE = Path(__file__).resolve().parents[1]
FIXTURE = HERE / "sample" / "usgs_09379900_lake_elevation_ft.csv"
FIXTURES = HERE / "tests" / "fixtures"


def real_series():
    return sources.parse_series_csv(FIXTURE.read_text())


def quiet(fn, *a, **kw):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a, **kw)


def bundle(text="Lake Powell, Sep 24: 3,517.5 ft", data_date="2026-09-24", kind="powell-daily", as_of="2026-09-25"):
    return {"kind": kind, "data_date": data_date, "as_of": as_of, "text": text}


def at(day: str) -> datetime:
    return datetime.fromisoformat(day + "T15:17:00").replace(tzinfo=timezone.utc)


class PostedLog(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.log = ledger.PostedLog(Path(self.dir.name) / "posted_log.jsonl")

    def tearDown(self):
        self.dir.cleanup()

    def codes(self, **kw):
        args = {"kind": "powell-daily", "data_date": date(2026, 9, 25), "text": "something new", "today": date(2026, 9, 26)}
        args.update(kw)
        return {c for c, _ in self.log.check(**args)}

    def test_second_post_for_same_data_date_is_refused(self):
        self.log.record("posted", bundle(), now=at("2026-09-25"), post_id="1")
        self.assertIn("same-data-date", self.codes(data_date=date(2026, 9, 24), text="different words"))

    def test_identical_text_refused_for_30_days_then_allowed(self):
        self.log.record("posted", bundle(text="Same   words"), now=at("2026-09-01"), post_id="1")
        self.assertIn("identical-text", self.codes(text="same words", today=date(2026, 9, 30)))  # case and spacing ignored
        self.assertNotIn("identical-text", self.codes(text="same words", today=date(2026, 10, 2)))

    def test_older_data_than_the_last_post_is_refused(self):
        self.log.record("posted", bundle(), now=at("2026-09-25"), post_id="1")
        self.assertIn("older-data-date", self.codes(data_date=date(2026, 9, 23)))

    def test_other_series_may_share_a_data_date(self):
        self.log.record("posted", bundle(), now=at("2026-09-25"), post_id="1")
        self.assertEqual(self.codes(kind="powell-weekly", data_date=date(2026, 9, 24)), set())

    def test_unconfirmed_attempt_blocks_until_a_human_resolves_it(self):
        self.log.record("attempt", bundle(), now=at("2026-09-25"))
        self.assertIn("unconfirmed", self.codes(data_date=date(2026, 9, 24)))
        quiet(ledger.main, ["resolve", "--log", str(self.log.path), "--kind", "powell-daily", "--date", "2026-09-24", "--not-posted"])
        self.assertEqual(self.codes(data_date=date(2026, 9, 24)), set())


class DailyRunAndPostedLog(unittest.TestCase):
    """run_daily with the posted log: a second run the same morning is a no-op, a source that has
    not moved on is a skip."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.out = Path(self.dir.name)
        self.cache = self.out / "cache.json"
        s = real_series()
        self.cache.write_text(json.dumps({"elevationFull": [{"date": d.isoformat(), "value": v} for d, v in s]}))

    def tearDown(self):
        self.dir.cleanup()

    def run_(self, as_of, **kw):
        a = dict(as_of=as_of, out=str(self.out), cadence="daily", weekday="fri", posted_log=None,
                 mirror_file=str(self.cache), sample=True, live=False)
        a.update(kw)
        return quiet(run_daily.run, argparse.Namespace(**a))

    def mark_posted(self, as_of):
        b = json.loads((self.out / as_of / "post.json").read_text())
        ledger.PostedLog(self.out / "posted_log.jsonl").record("posted", b, now=at(as_of), post_id="1")

    def test_dry_run_queues_and_second_run_same_morning_is_a_no_op(self):
        self.assertEqual(self.run_("2026-09-25"), 0)
        self.mark_posted("2026-09-25")
        self.assertEqual(self.run_("2026-09-25"), 0)
        self.assertIn('"refused"', (self.out / "2026-09-25" / "log.jsonl").read_text())

    def test_source_that_has_not_moved_on_is_a_skip(self):
        self.run_("2026-09-25")
        self.mark_posted("2026-09-25")
        self.assertEqual(self.run_("2026-09-26"), 3)  # newest value still Sep 24: same data date, identical text

    def test_live_without_approval_is_blocked(self):
        with mock.patch.dict(os.environ, {"X_USER_TOKEN": "not-a-real-token"}):
            self.assertEqual(self.run_("2026-09-25", live=True), 6)
        self.assertIn("no human approval", (self.out / "2026-09-25" / "log.jsonl").read_text())


class ProvisionalNote(unittest.TestCase):
    def test_alt_text_says_provisional_in_both_languages(self):
        s = real_series()
        for text, alt in (compose.compose(checks.metrics(s)), compose.compose_weekly(checks.weekly_metrics(s))):
            self.assertIn(config.PROVISIONAL_EN, alt)
            self.assertIn(config.PROVISIONAL_ES, alt)
            self.assertLessEqual(len(alt), config.ALT_MAX_CHARS)
        self.assertIn("provisional", render.USGS_SOURCE_LINE)

    def test_factcheck_blocks_alt_text_without_the_note(self):
        s = real_series()
        text, alt = compose.compose(checks.metrics(s))
        bare = alt.replace(config.PROVISIONAL_EN, "").replace(config.PROVISIONAL_ES, "")
        self.assertTrue(any("provisional" in p for p in checks.factcheck(text, bare, s)))

    def test_factcheck_blocks_overlong_alt_text(self):
        s = real_series()
        text, alt = compose.compose(checks.metrics(s))
        self.assertTrue(any("alt text is" in p for p in checks.factcheck(text, alt + " x" * 300, s)))

    def test_mirror_replay_says_so_in_the_alt_text(self):
        s = real_series()
        _, alt = compose.compose(checks.metrics(s), credit=run_daily.MIRROR["credit"])
        self.assertIn("third-party mirror", alt)


class Weekly(unittest.TestCase):
    def test_metrics_cover_the_seven_days_ending_on_the_newest_value(self):
        s = real_series()
        m = checks.weekly_metrics(s)
        by = dict(s)
        self.assertEqual(m["week_start"], date(2026, 9, 18))
        self.assertEqual(m["change_7d"], round(by[date(2026, 9, 24)] - by[date(2026, 9, 17)], 1))
        self.assertEqual((m["week_low"], m["week_high"]), (3516.6, 3517.5))

    def test_every_week_of_the_last_year_composes_and_checks(self):
        full = real_series()
        failures = []
        for cut in range(len(full) - 365, len(full) + 1, 7):
            s = full[:cut]
            text, alt = compose.compose_weekly(checks.weekly_metrics(s))
            p = checks.factcheck_weekly(text, alt, s)
            if p:
                failures.append((s[-1][0], p))
        self.assertEqual(failures, [])

    def test_tampered_weekly_number_is_blocked(self):
        s = real_series()
        text, alt = compose.compose_weekly(checks.weekly_metrics(s))
        self.assertTrue(checks.factcheck_weekly(text.replace("+0.9", "+1.9"), alt, s))

    def test_posts_only_on_the_chosen_weekday(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "cache.json"
            cache.write_text(json.dumps({"elevationFull": [{"date": d.isoformat(), "value": v} for d, v in real_series()]}))
            args = dict(out=tmp, cadence="weekly", weekday="fri", posted_log=None, mirror_file=str(cache), sample=True, live=False)
            self.assertEqual(quiet(run_daily.run, argparse.Namespace(as_of="2026-09-24", **args)), 0)  # a Thursday
            self.assertFalse((Path(tmp) / "2026-09-24-weekly").exists())
            self.assertEqual(quiet(run_daily.run, argparse.Namespace(as_of="2026-09-25", **args)), 0)  # a Friday
            b = json.loads((Path(tmp) / "2026-09-25-weekly" / "post.json").read_text())
            self.assertEqual((b["kind"], b["data_date"]), ("powell-weekly", "2026-09-24"))


class Queue(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.q = Path(self.dir.name)
        fx = run_daily.Source(real_series(), "committed fixture", stamp="FIXTURE · DRY RUN · NOT POSTED")
        self.m = quiet(queue.build, self.q, queue.mornings(date(2026, 9, 23), date(2026, 9, 25)),
                       queue.truncating_source(fx), title="test")
        self.item = self.m["items"][-1]  # the Sep 25 morning

    def tearDown(self):
        self.dir.cleanup()

    def approve(self, line):
        (self.q / "APPROVED_TO_POST").write_text(line + "\n")

    def publish(self, **kw):
        args = dict(live=True, today=date(2026, 9, 25), token_provider=lambda: None)
        args.update(kw)
        return quiet(queue.publish_queued, self.q, date(2026, 9, 25), **args)

    def test_build_writes_the_sheet_and_the_contact_sheet(self):
        s = self.m["summary"]
        self.assertEqual((s["ready"], s["blocked"], s["identical_texts"], s["factcheck_failures"]), (3, 0, 0, 0))
        line = f"{self.item['as_of']} {self.item['approval_code']}"
        for name in ("APPROVAL_QUEUE.md", "index.html"):
            self.assertIn(line, (self.q / name).read_text())
        self.assertTrue((self.q / self.item["image"]).exists())
        self.assertLessEqual(s["x_weighted_chars_max"], 280)

    def test_weekly_queue_holds_only_the_chosen_weekday(self):
        fx = run_daily.Source(real_series(), "committed fixture")
        m = quiet(queue.build, self.q / "weekly", queue.mornings(date(2026, 9, 12), date(2026, 9, 25)),
                  queue.truncating_source(fx), cadence="weekly", weekday="fri")
        self.assertEqual([i["folder"] for i in m["items"]], ["2026-09-18-weekly", "2026-09-25-weekly"])
        self.assertEqual((m["summary"]["ready"], m["summary"]["not_scheduled"]), (2, 12))

    def test_same_data_twice_is_blocked_in_the_queue(self):
        s = real_series()
        m = quiet(queue.build, self.q / "dup", [date(2026, 9, 25), date(2026, 9, 26)],
                  lambda d: run_daily.Source(s, "fixture"), sample=True)
        second = m["items"][1]
        self.assertEqual(second["status"], "blocked")
        self.assertTrue(any(p.startswith("identical text") for p in second["problems"]))
        self.assertTrue(any(p.startswith("same data date") for p in second["problems"]))

    def test_live_needs_a_per_date_entry_with_the_current_code(self):
        self.assertIn("no approval file", self.publish()[1]["reason"])
        for line in ("2026-09-25", "2026-09-25 000000000000", "standing 2026-09-20..2026-10-10"):
            self.approve(line)
            code, res = self.publish()
            self.assertEqual((code, res["status"]), (6, "blocked"), line)
        self.approve(f"2026-09-25 {self.item['approval_code']}")
        self.assertIn("no X user token", self.publish()[1]["reason"])  # approval passed; stopped at the token

    def test_dry_run_needs_no_approval(self):
        code, res = self.publish(live=False)
        self.assertEqual((code, res["status"]), (0, "dry-run"))

    def test_changed_files_or_an_old_morning_are_blocked(self):
        self.approve(f"2026-09-25 {self.item['approval_code']}")
        self.assertIn("not today or yesterday", self.publish(today=date(2026, 9, 28))[1]["reason"])
        pj = self.q / "2026-09-25" / "post.json"
        b = json.loads(pj.read_text())
        pj.write_text(json.dumps({**b, "text": b["text"].replace("Lake", "LAKE")}))
        self.assertIn("changed after", self.publish()[1]["reason"])

    def test_approved_post_goes_out_once(self):
        self.approve(f"2026-09-25 {self.item['approval_code']}  # checked by Carlos")
        calls = []

        def fake_post(url, token, data=None, body=None, ctype="application/json"):
            calls.append((url, data))
            return {"data": {"id": "42"}} if url.endswith(("/media/upload", "/tweets")) else {}

        with mock.patch.object(publish, "_post", side_effect=fake_post):
            code, res = self.publish(token_provider=lambda: "token")
            self.assertEqual((code, res["status"], res["id"]), (0, "posted", "42"))
            self.assertEqual([u.rsplit("/2/", 1)[1] for u, _ in calls], ["media/upload", "media/metadata", "tweets"])
            self.assertEqual(calls[1][1]["metadata"]["alt_text"]["text"], self.item["alt"])  # full alt text, not cut
            self.assertEqual(self.publish(token_provider=lambda: "token")[0], 7)  # refused by the posted log
        statuses = [e["status"] for e in ledger.PostedLog(self.q / "posted_log.jsonl").entries()]
        self.assertEqual(statuses, ["attempt", "posted"])

    def test_refused_create_is_recorded_as_not_posted_but_a_timeout_stays_unconfirmed(self):
        self.approve(f"2026-09-25 {self.item['approval_code']}")

        def failing(exc):
            def fake_post(url, token, data=None, body=None, ctype="application/json"):
                if url.endswith("/tweets"):
                    raise exc
                return {"data": {"id": "7"}}
            return fake_post

        with mock.patch.object(publish, "_post", side_effect=failing(urllib.error.HTTPError("u", 403, "dup", {}, None))):
            self.assertEqual(self.publish(token_provider=lambda: "t")[0], 6)
        with mock.patch.object(publish, "_post", side_effect=failing(TimeoutError("read timed out"))):
            self.assertEqual(self.publish(token_provider=lambda: "t")[0], 6)
            self.assertIn("has no confirmed result", " ".join(self.publish(token_provider=lambda: "t")[1]["reasons"]))


class ApprovalFile(unittest.TestCase):
    def test_parsing(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "APPROVED_TO_POST"
            p.write_text("# comment\n2026-10-01 abcdefabcdef\nstanding 2026-10-15..2026-11-13\n"
                         "standing 2026-10-01..2026-12-31\n2026-10-02\n")
            per_date, standing, errors = approval.read(p)
            self.assertEqual(per_date, {date(2026, 10, 1): {"abcdefabcdef"}})
            self.assertEqual(standing, [(date(2026, 10, 15), date(2026, 11, 13))])
            self.assertEqual(len(errors), 2)  # a 92-day standing range and a line without a code
            self.assertTrue(approval.check(p, date(2026, 10, 20), "000000000000", allow_standing=True)[0])
            self.assertFalse(approval.check(p, date(2026, 10, 20), "000000000000", allow_standing=False)[0])


class Sources(unittest.TestCase):
    def test_usgs_water_data_api_response(self):
        raw = json.loads((FIXTURES / "usgs_waterdata_daily_response.json").read_text())["response"]
        self.assertEqual(sources.parse_usgs_waterdata_daily(json.dumps(raw)),
                         [(date(2025, 12, 26), 20.2), (date(2026, 3, 19), 27.1)])
        with self.assertRaises(ValueError):
            sources.parse_usgs_waterdata_daily(json.dumps({**raw, "numberMatched": 5}))

    def test_falls_back_past_a_failing_or_empty_source(self):
        s = real_series()
        nwis = {"value": {"timeSeries": [{"values": [{"value": [{"dateTime": f"{d}T00:00:00", "value": str(v)} for d, v in s]}]}]}}

        def fake_fetch(url, headers=None, **kw):
            if "waterdata" in url:
                return json.dumps({"type": "FeatureCollection", "features": []})  # answers, but empty
            if "waterservices" in url:
                return json.dumps(nwis)
            raise RuntimeError("blocked")

        with mock.patch.object(sources, "fetch", side_effect=fake_fetch):
            src = run_daily.load_series(argparse.Namespace(mirror_file=None), date(2026, 9, 25))
        self.assertIn("legacy", src.label)
        self.assertEqual(src.series[-1], s[-1])
        self.assertEqual(src.notes, ("usgs_waterdata_powell: no values",))  # logged, so a dry run shows why

    def test_threshold_wording_expires(self):
        self.assertTrue(any(i.startswith("review:") for i in checks.validate(real_series(), date(2027, 1, 2))))


class Eia930(unittest.TestCase):
    """The adapter on EIA's real column layout (header copied from the 2026 Jul-Dec file, typos
    included) with made-up values."""

    def setUp(self):
        self.rows = sources.parse_eia930_balance((FIXTURES / "eia930_balance_SYNTHETIC_values.csv").read_text(), "AZPS")

    def test_takes_one_version_of_each_column_and_keeps_blanks_blank(self):
        full, blank = self.rows
        self.assertEqual((full["demand"], full["net_generation"]), (6900.0, 4000.0))   # adjusted wins over as reported
        self.assertEqual((full["coal"], full["gas"], full["solar"]), (1000.0, 1600.0, 2500.0))  # never raw + adjusted
        self.assertEqual(full["storage"], -1100.0)  # charging keeps its sign; unadjusted value used when that is all there is
        self.assertIsNone(full["nuclear"])
        self.assertAlmostEqual(sum(full[f] or 0 for f in sources.GRID_FUELS), full["net_generation"])
        self.assertIsNone(blank["demand"])
        self.assertTrue(all(blank[f] is None for f in sources.GRID_FUELS))

    def test_incomplete_day_is_refused(self):
        issues = checks.grid_day_issues(self.rows)
        self.assertIn("2 of 24 hours present", issues)
        self.assertTrue(any("hour 14" in i for i in issues))

    def test_authorities_add_up_and_a_blank_total_stays_blank(self):
        from bot import grid
        text = (FIXTURES / "eia930_balance_SYNTHETIC_values.csv").read_text()
        per_ba = {ba: sources.parse_eia930_balance(text, ba) for ba in ("AZPS", "SRP")}
        h13, h14 = grid.combine(per_ba)
        self.assertEqual((h13["demand"], h13["net_generation"], h13["nuclear"]), (6900.0 + 8000.0, 13000.0, 3900.0))
        self.assertIsNone(h14["demand"])  # SRP has no hour 14 and AZPS's is blank

    def test_a_synthetic_day_renders_with_its_stamp(self):
        hours = [{"hour": h, "demand": 9000.0, "solar": 3000.0 if 8 <= h <= 18 else 0.0, "gas": 5000.0,
                  "storage": -800.0 if 10 <= h <= 14 else 400.0} for h in range(1, 25)]
        with tempfile.TemporaryDirectory() as tmp:
            out = render.render_grid(hours, Path(tmp) / "g.png", header="TEST", title="t", subtitle="s",
                                     stamp="SYNTHETIC TEST DATA · NOT REAL", source_line="made-up numbers")
            self.assertGreater(out.stat().st_size, 10_000)


class Authorize(unittest.TestCase):
    def test_asks_only_for_the_scopes_the_bot_needs_and_keeps_the_token_private(self):
        from bot import authorize
        url, state, verifier = authorize.authorize_url("cid", "http://localhost:8080/callback")
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.split("?", 1)[1]).items()}
        self.assertEqual(q["scope"].split(), ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"])
        self.assertEqual((q["code_challenge_method"], q["state"]), ("S256", state))
        seen = {}

        class Resp(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def opener(req, timeout):
            seen["body"], seen["auth"] = req.data.decode(), req.get_header("Authorization")
            return Resp(json.dumps({"refresh_token": "r1", "scope": authorize.SCOPES}).encode())

        with self.assertRaises(SystemExit):  # a forged or stale redirect
            authorize.exchange("http://localhost:8080/callback?state=other&code=c", state, verifier, "cid", "sec",
                               "http://localhost:8080/callback", opener=opener)
        tok = authorize.exchange(f"http://localhost:8080/callback?state={state}&code=c", state, verifier, "cid", "sec",
                                 "http://localhost:8080/callback", opener=opener)
        self.assertIn(f"code_verifier={verifier}", seen["body"])
        self.assertTrue(seen["auth"].startswith("Basic "))
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "rt"
            authorize.save_refresh_token(tok, str(out))
            self.assertEqual((out.read_text(), out.stat().st_mode & 0o777), ("r1", 0o600))


class XAuth(unittest.TestCase):
    def test_refuses_to_refresh_without_somewhere_to_keep_the_new_token(self):
        opener = mock.Mock()
        with self.assertRaises(RuntimeError):
            xauth.access_token({"X_REFRESH_TOKEN": "r1", "X_CLIENT_ID": "c"}, opener=opener)
        opener.assert_not_called()

    def test_refresh_saves_the_rotated_token_privately(self):
        seen = {}

        class Resp(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def opener(req, timeout):
            seen["body"], seen["auth"] = req.data.decode(), req.get_header("Authorization")
            return Resp(json.dumps({"access_token": "a2", "refresh_token": "r2"}).encode())

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "rt"
            env = {"X_REFRESH_TOKEN": "r1", "X_CLIENT_ID": "c", "X_CLIENT_SECRET": "s", "X_REFRESH_TOKEN_OUT": str(out)}
            self.assertEqual(xauth.access_token(env, opener=opener), "a2")
            self.assertEqual(out.read_text(), "r2")
            self.assertEqual(out.stat().st_mode & 0o777, 0o600)
        self.assertIn("grant_type=refresh_token", seen["body"])
        self.assertTrue(seen["auth"].startswith("Basic "))
        self.assertEqual(xauth.access_token({"X_USER_TOKEN": "a1"}), "a1")


if __name__ == "__main__":
    unittest.main()
