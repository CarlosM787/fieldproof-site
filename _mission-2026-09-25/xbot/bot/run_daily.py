"""One daily run: fetch -> validate -> metrics -> render -> compose -> fact-check -> queue -> publish -> log.

  python -m bot.run_daily --as-of 2026-09-26 --out runs/            # dry run from official sources
  python -m bot.run_daily --mirror-file cache.json --as-of ... --sample   # sandbox replay
  python -m bot.run_daily ... --live                                 # needs token + APPROVED_TO_POST

Exit codes: 0 queued/posted, 3 skipped (no fresh data), 4 invalid data, 5 fact-check failed,
6 publish failed. A non-zero exit is the alert (GitHub Actions emails the repo owner on failure).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from . import checks, compose, config, publish, render, sources


def log(run_dir: Path, event: str, **kw):
    rec = {"utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "event": event, **kw}
    with open(run_dir / "log.jsonl", "a") as f:
        f.write(json.dumps(rec, default=str) + "\n")
    print(json.dumps(rec, default=str))


def load_series(args):
    if args.mirror_file:
        return sources.parse_mirror_cache(Path(args.mirror_file).read_text()), "third-party mirror of USGS 09379900 (sandbox replay)"
    errors = []
    for key, parse in (("usgs_powell", sources.parse_usgs_dv), ("usbr_powell", sources.parse_usbr_csv)):
        try:
            return parse(sources.fetch(config.SOURCES[key]["url"])), config.SOURCES[key]["label"]
        except Exception as e:  # try the next official source
            errors.append(f"{key}: {e}")
    raise RuntimeError("; ".join(errors))


def run(args) -> int:
    as_of = date.fromisoformat(args.as_of) if args.as_of else date.today()
    run_dir = Path(args.out) / as_of.isoformat()
    run_dir.mkdir(parents=True, exist_ok=True)
    try:
        series, source = load_series(args)
    except Exception as e:
        log(run_dir, "skip", reason=f"no data: {e}")
        return 3
    log(run_dir, "fetched", source=source, n=len(series), newest=series[-1][0] if series else None)

    issues = checks.validate(series, as_of)
    if issues:
        stale = any(i.startswith("stale") for i in issues)
        log(run_dir, "skip" if stale else "invalid", issues=issues)
        return 3 if stale else 4

    m = checks.metrics(series)
    img = render.render_powell(series, m, run_dir / f"powell-{m['date']}.png", sample=args.sample)
    text, alt = compose.compose(m)
    problems = checks.factcheck(text, alt, series)
    if problems:
        log(run_dir, "factcheck-failed", problems=problems, text=text)
        return 5

    bundle = {
        "as_of": as_of, "data_date": m["date"], "text": text, "alt": alt, "image": str(img),
        "source": source, "metrics": m,
        "data_sha256": hashlib.sha256(json.dumps(series, default=str).encode()).hexdigest()[:16],
        "chars": len(text), "x_weighted_chars": checks.x_weighted_length(text), "est_cost_usd": 0.015,
    }
    (run_dir / "post.json").write_text(json.dumps(bundle, indent=2, default=str, ensure_ascii=False))
    log(run_dir, "queued", chars=len(text), data_date=m["date"])
    try:
        res = publish.publish(bundle, run_dir, live=args.live)
    except Exception as e:
        log(run_dir, "publish-failed", error=str(e))
        return 6
    log(run_dir, "publish", **res)
    return 0 if res["status"] in ("dry-run", "posted") else 6


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--as-of")
    p.add_argument("--out", default="runs")
    p.add_argument("--mirror-file")
    p.add_argument("--sample", action="store_true", help="stamp SAMPLE / DRY RUN on the image")
    p.add_argument("--live", action="store_true")
    sys.exit(run(p.parse_args(argv)))


if __name__ == "__main__":
    main()
