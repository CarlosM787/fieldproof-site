"""One run: fetch -> validate -> metrics -> compose -> fact-check -> render -> queue -> posted log ->
approval -> publish -> log.

  python -m bot.run_daily --out runs/                                  # dry run from official sources
  python -m bot.run_daily --out runs/ --cadence weekly --weekday fri   # weekly segment; other days do nothing
  python -m bot.run_daily --mirror-file cache.json --as-of ... --sample   # sandbox replay
  python -m bot.run_daily --out runs/ --live      # needs a token, a clear posted log and runs/APPROVED_TO_POST

Exit codes: 0 queued, posted or nothing to do; 3 skipped (no fresh data, or no new data since the
last post); 4 invalid data; 5 fact-check failed; 6 blocked or publish failed; 7 refused by the
posted log (needs a human look). A non-zero exit is the alert (GitHub Actions emails the repo owner).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import NamedTuple

from . import approval, checks, compose, config, ledger, publish, render, sources


class Source(NamedTuple):
    series: list
    label: str
    credit: tuple = compose.CREDIT_USGS          # (English, Spanish) for the alt text
    source_line: str = render.USGS_SOURCE_LINE   # printed on the image
    stamp: str | None = None                     # image stamp for samples and replays


USBR = {"credit": ("U.S. Bureau of Reclamation", "Oficina de Reclamación de EE. UU."),
        "source_line": "Data: U.S. Bureau of Reclamation, Lake Powell daily pool elevation (provisional, subject to "
                       "revision). Not an official product."}
MIRROR = {"credit": ("USGS via a third-party mirror (sandbox replay)", "USGS vía un espejo de terceros (reproducción de prueba)"),
          "source_line": "Data: USGS site 09379900 daily values (provisional), as cached by a third-party GitHub mirror "
                         "(sandbox replay). Thresholds: Bureau of Reclamation. Not an official product.",
          "stamp": "REPLAY · THIRD-PARTY MIRROR · NOT POSTED"}
PARSERS = {"usgs_waterdata_powell": sources.parse_usgs_waterdata_daily, "usgs_powell": sources.parse_usgs_dv,
           "usbr_powell": sources.parse_usbr_csv}


def log(run_dir: Path, event: str, **kw):
    rec = {"utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "event": event, **kw}
    with open(run_dir / "log.jsonl", "a") as f:
        f.write(json.dumps(rec, default=str, ensure_ascii=False) + "\n")
    print(json.dumps(rec, default=str, ensure_ascii=False))


def mirror_file_source(path) -> Source:
    return Source(sources.parse_mirror_cache(Path(path).read_text()),
                  "third-party mirror of USGS 09379900 (sandbox replay)", **MIRROR)


def load_series(args, as_of: date) -> Source:
    """Official sources in config order. The first fresh, non-empty series wins; if none is fresh,
    the freshest one comes back and validation reports it as stale."""
    if getattr(args, "mirror_file", None):
        return mirror_file_source(args.mirror_file)
    best, errors = None, []
    for key in config.POWELL_SOURCES:
        headers = None
        if key == "usgs_waterdata_powell" and os.environ.get("API_USGS_PAT"):
            headers = {"X-Api-Key": os.environ["API_USGS_PAT"]}
        try:
            series = PARSERS[key](sources.fetch(config.SOURCES[key]["url"], headers=headers))
        except Exception as e:  # try the next official source
            errors.append(f"{key}: {e}")
            continue
        if not series:
            errors.append(f"{key}: no values")
            continue
        got = Source(series, config.SOURCES[key]["label"], **(USBR if key.startswith("usbr") else {}))
        if (as_of - series[-1][0]).days <= config.LIMITS["max_age_days"]:
            return got
        if best is None or series[-1][0] > best.series[-1][0]:
            best = got
    if best:
        return best
    raise RuntimeError("; ".join(errors))


def post_folder(as_of: date, cadence: str) -> str:
    return as_of.isoformat() + ("-weekly" if cadence == "weekly" else "")


def make_post(src: Source, as_of: date, run_dir: Path, cadence: str = "daily", sample=False):
    """validate -> metrics -> compose -> fact-check -> render. Returns (exit code, bundle, detail);
    the bundle is None unless the code is 0. Nothing is published here."""
    series = src.series
    issues = checks.validate(series, as_of)
    weekly = cadence == "weekly"
    if weekly and not issues:
        issues = checks.validate_week(series)
    if issues:
        stale = any(i.startswith("stale") for i in issues)
        return (3 if stale else 4), None, {"event": "skip" if stale else "invalid", "issues": issues}
    if weekly:
        m = checks.weekly_metrics(series)
        text, alt = compose.compose_weekly(m, credit=src.credit)
        problems = checks.factcheck_weekly(text, alt, series)
    else:
        m = checks.metrics(series)
        text, alt = compose.compose(m, credit=src.credit)
        problems = checks.factcheck(text, alt, series)
    if problems:
        return 5, None, {"event": "factcheck-failed", "problems": problems, "text": text}
    kind = config.KINDS[cadence]
    stamp = (src.stamp or render.SAMPLE_STAMP) if sample else None
    img = render.render_powell(series, m, run_dir / f"{kind}-{m['date']}.png", sample=stamp, weekly=weekly,
                               source_line=src.source_line)
    bundle = {
        "kind": kind, "as_of": as_of, "data_date": m["date"], "text": text, "alt": alt, "image": img.name,
        "source": src.label, "credit": src.credit[0], "metrics": m, "factcheck_problems": [],
        "rotating_fact": None if weekly else compose.rotating_fact(m, text),
        "data_sha256": hashlib.sha256(json.dumps(series, default=str).encode()).hexdigest()[:16],
        "chars": len(text), "x_weighted_chars": checks.x_weighted_length(text), "alt_chars": len(alt),
        "est_cost_usd": round(config.PRICE_POST + config.PRICE_ALT_TEXT, 3),
        "est_cost_worst_case_usd": round(config.PRICE_POST + config.PRICE_ALT_TEXT + config.PRICE_MEDIA_UPLOAD_WORST_CASE, 3),
    }
    bundle["approval_code"] = approval.approval_code(bundle, img.read_bytes())  # str(date) is the ISO date post.json keeps
    return 0, bundle, {"event": "queued"}


def write_bundle(run_dir: Path, bundle: dict):
    (run_dir / "post.json").write_text(json.dumps(bundle, indent=2, default=str, ensure_ascii=False))


def refusal_exit(log_: ledger.PostedLog, bundle: dict, refusals) -> int:
    """0 when this morning's post already went out (a second scheduled run), 3 when the source has
    not moved on since the last post (the same data also gives the same text), 7 for anything a
    human must look at: an unconfirmed attempt, or the same text for new data."""
    codes = {c for c, _ in refusals}
    if "unconfirmed" in codes:
        return 7
    if log_.posted_this_morning(bundle["kind"], bundle["as_of"]):
        return 0
    if codes & {"same-data-date", "older-data-date"}:
        return 3
    return 7


def run(args) -> int:
    as_of = date.fromisoformat(args.as_of) if args.as_of else config.today_az()
    cadence = getattr(args, "cadence", "daily") or "daily"
    weekday = getattr(args, "weekday", config.WEEKLY_DEFAULT_WEEKDAY) or config.WEEKLY_DEFAULT_WEEKDAY
    if cadence == "weekly" and as_of.weekday() != config.WEEKDAYS[weekday]:
        print(json.dumps({"event": "not-scheduled", "as_of": str(as_of), "cadence": cadence, "weekday": weekday}))
        return 0
    out = Path(args.out)
    run_dir = out / post_folder(as_of, cadence)
    run_dir.mkdir(parents=True, exist_ok=True)
    try:
        src = load_series(args, as_of)
    except Exception as e:
        log(run_dir, "skip", reason=f"no data: {e}")
        return 3
    log(run_dir, "fetched", source=src.label, n=len(src.series), newest=src.series[-1][0] if src.series else None)

    code, bundle, detail = make_post(src, as_of, run_dir, cadence=cadence, sample=args.sample)
    if code:
        log(run_dir, **detail)
        return code
    write_bundle(run_dir, bundle)
    log(run_dir, "queued", chars=bundle["x_weighted_chars"], data_date=bundle["data_date"], code=bundle["approval_code"])

    posted = ledger.PostedLog(getattr(args, "posted_log", None) or out / "posted_log.jsonl")
    refusals = posted.check(bundle["kind"], bundle["data_date"], bundle["text"], today=as_of)
    if refusals:
        log(run_dir, "refused", refusals=[r for _, r in refusals])
        return refusal_exit(posted, bundle, refusals)
    ok, why = (approval.check(out / "APPROVED_TO_POST", as_of, bundle["approval_code"], allow_standing=True)
               if args.live else (False, "dry run"))
    try:
        res = publish.publish(bundle, run_dir, live=args.live, approved=ok, ledger=posted)
    except Exception as e:
        log(run_dir, "publish-failed", error=str(e))
        return 6
    log(run_dir, "publish", approval=why, **res)
    return 0 if res["status"] in ("dry-run", "posted") else 6


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--as-of")
    p.add_argument("--out", default="runs")
    p.add_argument("--cadence", choices=("daily", "weekly"), default="daily")
    p.add_argument("--weekday", choices=tuple(config.WEEKDAYS), default=config.WEEKLY_DEFAULT_WEEKDAY,
                   help="the weekly segment posts only on this day")
    p.add_argument("--posted-log", help="default: <out>/posted_log.jsonl")
    p.add_argument("--mirror-file")
    p.add_argument("--sample", action="store_true", help="stamp SAMPLE / DRY RUN on the image")
    p.add_argument("--live", action="store_true")
    sys.exit(run(p.parse_args(argv)))


if __name__ == "__main__":
    main()
