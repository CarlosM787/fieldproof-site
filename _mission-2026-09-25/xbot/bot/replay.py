"""Seven-day replay: what the bot would have posted each morning, using only the data that existed
that morning. Reads each day's commit of the third-party mirror's cache (git history), so no value
from a later day leaks into an earlier post.

  python -m bot.replay --repo /path/to/ebootheee-powell-clone --from 2026-09-19 --to 2026-09-25 --out sample/
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import date, timedelta
from pathlib import Path

from . import run_daily


def commit_for(repo: Path, day: date) -> str | None:
    out = subprocess.run(["git", "-C", str(repo), "log", "--format=%H %s", "--", "cache/current.json"],
                         capture_output=True, text=True, check=True).stdout.splitlines()
    for line in out:
        sha, subj = line.split(" ", 1)
        if subj.strip().endswith(day.isoformat()):
            return sha
    return None


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--repo", required=True)
    p.add_argument("--from", dest="start", required=True)
    p.add_argument("--to", dest="end", required=True)
    p.add_argument("--out", default="sample")
    a = p.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    d, end, summary = date.fromisoformat(a.start), date.fromisoformat(a.end), []
    while d <= end:
        sha = commit_for(Path(a.repo), d)
        if not sha:
            summary.append({"post_day": d, "result": "skip: no mirror commit that morning"})
        else:
            blob = subprocess.run(["git", "-C", a.repo, "show", f"{sha}:cache/current.json"], capture_output=True, text=True, check=True).stdout
            cache = out / "_cache" / f"{d}.json"
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(blob)
            code = run_daily.run(argparse.Namespace(as_of=d.isoformat(), out=str(out), mirror_file=str(cache), sample=True, live=False))
            post = out / d.isoformat() / "post.json"
            summary.append({"post_day": d, "mirror_commit": sha[:7], "exit": code,
                            **({k: json.loads(post.read_text())[k] for k in ("data_date", "text", "chars", "x_weighted_chars", "image")} if post.exists() else {})})
        d += timedelta(days=1)
    (out / "SAMPLE_7_DAYS.json").write_text(json.dumps(summary, indent=2, default=str, ensure_ascii=False))
    print(json.dumps(summary, indent=2, default=str, ensure_ascii=False))


if __name__ == "__main__":
    main()
