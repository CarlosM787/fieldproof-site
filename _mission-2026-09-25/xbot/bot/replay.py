"""Replay: what the bot would have queued each morning, using only the data that existed that
morning. Reads each day's commit of the third-party mirror's cache (git history), so no value from
a later day leaks into an earlier post. The output is an ordinary approval queue (APPROVAL_QUEUE.md,
index.html, queue.json) and stays private: mirror caches and renders never go into git.

  python -m bot.replay --repo /path/to/ebootheee-powell-clone --from 2026-09-12 --to 2026-09-25 --out <private dir>
  python -m bot.replay ... --cadence weekly --weekday fri
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import date
from pathlib import Path

from . import config, queue, run_daily

NOTE = ("Replayed from the commit history of a third-party GitHub mirror of USGS data "
        "(github.com/ebootheee/powell, no licence file): each morning reads that morning's commit. "
        "Not official data; for checking the pipeline only.")


def commit_for(repo: Path, day: date) -> str | None:
    out = subprocess.run(["git", "-C", str(repo), "log", "--format=%H %s", "--", "cache/current.json"],
                         capture_output=True, text=True, check=True).stdout.splitlines()
    for line in out:
        sha, subj = line.split(" ", 1)
        if subj.strip().endswith(day.isoformat()):
            return sha
    return None


def mirror_source(repo: Path, cache_dir: Path):
    """series_for(morning) for queue.build: that morning's mirror commit, or None if there is none."""
    def series_for(day: date):
        sha = commit_for(repo, day)
        if not sha:
            return None
        blob = subprocess.run(["git", "-C", str(repo), "show", f"{sha}:cache/current.json"],
                              capture_output=True, text=True, check=True).stdout
        cache = cache_dir / f"{day}.json"
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(blob)
        src = run_daily.mirror_file_source(cache)
        return src._replace(label=f"third-party mirror github.com/ebootheee/powell @{sha[:7]} of USGS 09379900 (sandbox replay)")
    return series_for


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--repo", required=True)
    p.add_argument("--from", dest="start", required=True)
    p.add_argument("--to", dest="end", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--cadence", choices=("daily", "weekly"), default="daily")
    p.add_argument("--weekday", choices=tuple(config.WEEKDAYS), default=config.WEEKLY_DEFAULT_WEEKDAY)
    p.add_argument("--title", default="")
    a = p.parse_args(argv)
    out = Path(a.out)
    manifest = queue.build(out, queue.mornings(date.fromisoformat(a.start), date.fromisoformat(a.end)),
                           mirror_source(Path(a.repo), out / "_cache"), cadence=a.cadence, weekday=a.weekday,
                           sample=True, title=a.title, note=NOTE)
    print(json.dumps(manifest["summary"], indent=2))


if __name__ == "__main__":
    main()
