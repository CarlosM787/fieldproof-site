"""Posted log: the bot's memory of what it already put on X, so a late source, a re-run or a second
scheduled run can never post the same thing twice.

One JSON line per event, append-only. Commit it with the run logs so it survives between GitHub
Actions runs:
    {"utc": ..., "status": "attempt" | "posted" | "not-posted", "kind": "powell-daily",
     "data_date": "2026-09-24", "as_of": "2026-09-25", "text": ..., "text_sha256": ..., "post_id": ...}

`attempt` is written just before POST /2/tweets and `posted` just after it succeeds, so a run that
dies in between leaves an attempt that blocks every later try until a human checks the account:
    python -m bot.ledger resolve --log runs/posted_log.jsonl --kind powell-daily --date 2026-09-24 --posted --id 123
    python -m bot.ledger resolve --log runs/posted_log.jsonl --kind powell-daily --date 2026-09-24 --not-posted

check() refusals, as (code, reason):
  same-data-date   this series already posted that data date
  unconfirmed      an attempt for that data date never got a result
  older-data-date  the data is older than the newest data date this series has posted
  identical-text   the same text (ignoring case and spacing) was posted in the last 30 days, any series
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import config

BLOCKING = ("attempt", "posted")


def normalize(text: str) -> str:
    return " ".join(text.split()).casefold()


def text_sha256(text: str) -> str:
    return hashlib.sha256(normalize(text).encode()).hexdigest()


class PostedLog:
    def __init__(self, path):
        self.path = Path(path)

    def entries(self) -> list[dict]:
        if not self.path.exists():
            return []
        return [json.loads(line) for line in self.path.read_text().splitlines() if line.strip()]

    def _latest(self) -> dict:
        """The most recent record for each (kind, data_date)."""
        state = {}
        for e in self.entries():
            state[(e["kind"], e["data_date"])] = e
        return state

    def check(self, kind: str, data_date: date, text: str, today: date) -> list[tuple[str, str]]:
        refusals = []
        state = self._latest()
        last = state.get((kind, data_date.isoformat()))
        if last and last["status"] == "posted":
            refusals.append(("same-data-date", f"{kind} already posted the data for {data_date} "
                                               f"(post {last.get('post_id')}, {last['utc'][:16]} UTC)"))
        elif last and last["status"] == "attempt":
            refusals.append(("unconfirmed", f"an attempt to post {kind} {data_date} at {last['utc'][:16]} UTC has no "
                                            "confirmed result: check the account, then run `python -m bot.ledger resolve`"))
        newest = max((date.fromisoformat(d) for (k, d), e in state.items() if k == kind and e["status"] in BLOCKING),
                     default=None)
        if newest and data_date < newest:
            refusals.append(("older-data-date", f"data for {data_date} is older than the newest {kind} post ({newest})"))
        cutoff = today - timedelta(days=config.DUPLICATE_TEXT_WINDOW_DAYS)
        sha = text_sha256(text)
        for e in state.values():  # an attempt later resolved as not posted no longer counts
            if e["status"] in BLOCKING and e.get("text_sha256") == sha and date.fromisoformat(e["utc"][:10]) >= cutoff:
                refusals.append(("identical-text", f"the same text was posted on {e['utc'][:10]} ({e['kind']} {e['data_date']})"))
                break
        return refusals

    def posted_this_morning(self, kind: str, as_of: date) -> bool:
        return any(e["kind"] == kind and e["status"] == "posted" and e.get("as_of") == str(as_of)
                   for e in self._latest().values())

    def record(self, status: str, bundle: dict, now: datetime | None = None, **extra) -> dict:
        rec = {
            "utc": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
            "status": status,
            "kind": bundle["kind"],
            "data_date": str(bundle["data_date"]),
            "as_of": str(bundle.get("as_of")),
            "text": bundle["text"],
            "text_sha256": text_sha256(bundle["text"]),
            **extra,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec


def main(argv=None):
    p = argparse.ArgumentParser(description="Show the posted log, or resolve an unconfirmed attempt by hand.")
    sub = p.add_subparsers(dest="cmd", required=True)
    show = sub.add_parser("show")
    show.add_argument("--log", default="runs/posted_log.jsonl")
    res = sub.add_parser("resolve")
    res.add_argument("--log", default="runs/posted_log.jsonl")
    res.add_argument("--kind", required=True)
    res.add_argument("--date", required=True, help="the data date of the attempt")
    how = res.add_mutually_exclusive_group(required=True)
    how.add_argument("--posted", action="store_true", help="the post is on the account")
    how.add_argument("--not-posted", action="store_true", help="the post is not on the account")
    res.add_argument("--id", help="the post id, when it is on the account")
    a = p.parse_args(argv)
    log = PostedLog(a.log)
    if a.cmd == "show":
        for e in log.entries():
            print(e["utc"], e["status"], e["kind"], e["data_date"], e.get("post_id") or "")
        return
    last = log._latest().get((a.kind, a.date))
    if not last or last["status"] != "attempt":
        raise SystemExit(f"no unconfirmed attempt for {a.kind} {a.date}")
    log.record("posted" if a.posted else "not-posted",
               {"kind": a.kind, "data_date": a.date, "as_of": last.get("as_of"), "text": last["text"]},
               post_id=a.id, resolved_by="human")
    print(f"recorded {a.kind} {a.date} as {'posted' if a.posted else 'not posted'}")


if __name__ == "__main__":
    main()
