"""Private approval queue: render a run of mornings into one folder, write a review sheet
(APPROVAL_QUEUE.md + index.html + queue.json), and publish only what a human approved.

  python -m bot.queue build --out runs --days 1                     # this morning, official sources, unstamped
  python -m bot.queue build --out q --fixture sample/usgs_09379900_lake_elevation_ft.csv --from 2026-09-20 --to 2026-09-25
  python -m bot.queue build --out q --mirror-repo <clone> --from 2026-09-12 --to 2026-09-25   # sandbox replay
  python -m bot.queue build ... --cadence weekly --weekday fri      # weekly segment: only that weekday
  python -m bot.queue publish --queue runs --date 2026-09-25 [--cadence weekly] [--live]

`build` never posts. `publish --live` posts one queued date, and only if APPROVED_TO_POST (in the
queue folder) lists that date with the post's approval code (standing approvals do not count here),
the files still hash to that code, the post morning is today or yesterday in Arizona, the posted
log has no refusal, and a token is available. Without --live it reports what would happen.
"""
from __future__ import annotations

import argparse
import html
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import approval, config, ledger, publish, run_daily, sources


def mornings(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def truncating_source(src: run_daily.Source):
    """What each morning would have seen of one fetched series: only the values dated before it.
    Approximate for live sources, which may revise provisional values afterwards."""
    def series_for(as_of: date):
        s = [(d, v) for d, v in src.series if d < as_of]
        return src._replace(series=s) if s else None
    return series_for


def _day(iso: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{d:%a} {config.MONTHS_EN[d.month - 1]} {d.day}"


def _chg(x) -> str:
    return "" if x is None else ("no change" if x == 0 else f"{x:+.1f}")


def build(out, days: list[date], series_for, *, cadence: str = "daily", weekday: str = config.WEEKLY_DEFAULT_WEEKDAY,
          sample=True, posted_log=None, title: str = "", note: str = "") -> dict:
    """Queue one post per scheduled morning. `series_for(as_of)` returns a run_daily.Source with
    only the data that morning had, or None. Returns the manifest (also written as queue.json)."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    posted = ledger.PostedLog(posted_log or out / "posted_log.jsonl")
    items, not_scheduled = [], 0
    for as_of in days:
        if cadence == "weekly" and as_of.weekday() != config.WEEKDAYS[weekday]:
            not_scheduled += 1
            continue
        item = {"as_of": as_of.isoformat(), "folder": run_daily.post_folder(as_of, cadence), "problems": []}
        src = series_for(as_of)
        if src is None:
            items.append({**item, "status": "skip", "problems": ["no data that morning"]})
            continue
        run_dir = out / item["folder"]
        run_dir.mkdir(parents=True, exist_ok=True)
        code, bundle, detail = run_daily.make_post(src, as_of, run_dir, cadence=cadence, sample=sample)
        if code:
            run_daily.log(run_dir, **detail)
            items.append({**item, "status": detail["event"], "problems": detail.get("issues") or detail.get("problems")})
            continue
        run_daily.write_bundle(run_dir, bundle)
        run_daily.log(run_dir, "queued", data_date=bundle["data_date"], code=bundle["approval_code"])
        m = bundle["metrics"]
        items.append({**item, "status": "ready", "kind": bundle["kind"], "source": src.label,
                      "data_date": str(bundle["data_date"]), "ft": m["ft"],
                      "change": m["change_7d"] if cadence == "weekly" else m["change_1d"],
                      "x_weighted_chars": bundle["x_weighted_chars"], "alt_chars": bundle["alt_chars"],
                      "rotating_fact": bundle["rotating_fact"], "image": f"{item['folder']}/{bundle['image']}",
                      "text": bundle["text"], "alt": bundle["alt"], "approval_code": bundle["approval_code"]})

    # the queue is checked as a whole: the same text or the same data date never goes out twice
    first_text, first_date = {}, {}
    for it in (i for i in items if i["status"] == "ready"):
        sha = ledger.text_sha256(it["text"])
        if sha in first_text:
            it["problems"].append(f"identical text to the post for {first_text[sha]}")
        first_text.setdefault(sha, it["as_of"])
        key = (it["kind"], it["data_date"])
        if key in first_date:
            it["problems"].append(f"same data date ({it['data_date']}) as the post for {first_date[key]}: the source had not moved on")
        first_date.setdefault(key, it["as_of"])
        for _, reason in posted.check(it["kind"], date.fromisoformat(it["data_date"]), it["text"], date.fromisoformat(it["as_of"])):
            it["problems"].append(f"posted log: {reason}")
        if it["problems"]:
            it["status"] = "blocked"

    ready = [i for i in items if i["status"] == "ready"]
    lengths = [i["x_weighted_chars"] for i in ready]
    manifest = {
        "title": title or f"{config.ACCOUNT_NAME} ({cadence})",
        "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cadence": cadence, "weekday": weekday if cadence == "weekly" else None, "note": note,
        "summary": {
            "mornings": len(days), "not_scheduled": not_scheduled, "queued": len(items), "ready": len(ready),
            "blocked": sum(i["status"] == "blocked" for i in items),
            "skipped_or_invalid": sum(i["status"] in ("skip", "invalid") for i in items),
            "factcheck_failures": sum(i["status"] == "factcheck-failed" for i in items),
            "identical_texts": sum(any(p.startswith("identical text") for p in i["problems"]) for i in items),
            "x_weighted_chars_min": min(lengths, default=None), "x_weighted_chars_max": max(lengths, default=None),
        },
        "items": items,
    }
    (out / "queue.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False, default=str))
    (out / "APPROVAL_QUEUE.md").write_text(sheet_markdown(manifest))
    (out / "index.html").write_text(sheet_html(manifest))
    return manifest


def _checks_line(it: dict) -> str:
    if it["status"] == "ready":
        return ("validation passed · every number traced to the data · text unique in this queue · "
                "data date new in this queue · posted log clear")
    return "; ".join(it["problems"] or [it["status"]])


def sheet_markdown(m: dict) -> str:
    s = m["summary"]
    lines = [
        f"# Approval queue: {m['title']}", "",
        "**PRIVATE · DRY RUN · nothing here has been posted or approved.**", "",
        f"Built {m['built_utc']} UTC. {m['note']}".rstrip(), "",
        f"**Summary:** {s['mornings']} mornings · {s['ready']} ready · {s['blocked']} blocked · "
        f"{s['skipped_or_invalid']} skipped or invalid · fact-check failures: {s['factcheck_failures']} · "
        f"identical texts: {s['identical_texts']}"
        + (f" · X-weighted length {s['x_weighted_chars_min']}–{s['x_weighted_chars_max']} (limit {config.POST_MAX_CHARS})"
           if s["ready"] else "")
        + (f" · {s['not_scheduled']} mornings are not {m['weekday']} (weekly segment)" if m["cadence"] == "weekly" else ""),
        "", "## How to approve", "",
        "1. Read each post below (index.html shows the images side by side).",
        "2. For each post you approve, copy its approval line into `APPROVED_TO_POST` in this folder, one line per post. "
        "The code covers this exact text, alt text and image: a re-rendered post gets a new code and needs a new approval.",
        "3. Nothing posts until `python -m bot.queue publish --queue <this folder> --date <morning> --live` runs with an "
        "X token. It re-checks the files, the approval line, the date and the posted log first.", "",
        "| Morning | Data for | Level (ft) | Change (ft) | X chars | Rotating fact | Status | Approval line |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for it in m["items"]:
        ready = it["status"] == "ready"
        lines.append(f"| {_day(it['as_of'])} | {_day(it['data_date']) if it.get('data_date') else ''} | "
                     f"{it['ft']:,.1f} | {_chg(it['change'])} | {it['x_weighted_chars']} | {it['rotating_fact'] or '-'} | "
                     f"{it['status']} | {'`' + it['as_of'] + ' ' + it['approval_code'] + '`' if ready else '-'} |"
                     if it.get("data_date") else
                     f"| {_day(it['as_of'])} | | | | | | {it['status']} | - |")
    for it in m["items"]:
        lines += ["", f"## {_day(it['as_of'])}, {it['as_of'][:4]}"
                  + (f" · data for {_day(it['data_date'])}" if it.get("data_date") else ""), ""]
        if not it.get("data_date"):
            lines.append(f"**Not queued:** {_checks_line(it)}")
            continue
        lines += [f"![chart]({it['image']})", "", f"**Post** ({it['x_weighted_chars']} X-weighted characters):", "",
                  "```text", it["text"], "```", "", f"**Alt text** ({it['alt_chars']} characters): {it['alt']}", "",
                  f"**Source:** {it['source']}", "", f"**Checks:** {_checks_line(it)}", ""]
        lines.append(f"**Approve:** `{it['as_of']} {it['approval_code']}`" if it["status"] == "ready"
                     else "**Not approvable** until the problem above is fixed and the queue is rebuilt.")
    return "\n".join(lines) + "\n"


CSS = """
body{margin:0;background:#0b1a24;color:#eaf2f5;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1200px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:22px;margin:0 0 4px}.warn{color:#f2a541;font-weight:600}.muted{color:#8fa6b2}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;margin-top:16px}
.card{background:#10232f;border:1px solid #1d3a4b;border-radius:10px;padding:12px}
.card img{width:100%;border-radius:6px;display:block}
pre{white-space:pre-wrap;background:#0b1a24;border-radius:6px;padding:8px;margin:8px 0;font:13px/1.4 ui-monospace,monospace}
code{background:#0b1a24;border-radius:4px;padding:2px 6px;font:13px ui-monospace,monospace;user-select:all}
.st{float:right;font-size:12px;border-radius:99px;padding:1px 8px;background:#1d3a4b}
.st.ready{background:#1f5f4a}.st.blocked,.st.factcheck-failed,.st.invalid{background:#7a2e2e}
details{margin-top:6px}summary{cursor:pointer;color:#8fa6b2}
"""


def sheet_html(m: dict) -> str:
    e = html.escape
    s = m["summary"]
    cards = []
    for it in m["items"]:
        head = f"<span class='st {e(it['status'])}'>{e(it['status'])}</span><b>{e(_day(it['as_of']))}</b>"
        if not it.get("data_date"):
            cards.append(f"<div class='card'>{head}<p class='muted'>{e(_checks_line(it))}</p></div>")
            continue
        approve = (f"<p>Approve: <code>{e(it['as_of'])} {e(it['approval_code'])}</code></p>" if it["status"] == "ready"
                   else f"<p class='warn'>{e(_checks_line(it))}</p>")
        cards.append(
            f"<div class='card'>{head} <span class='muted'>· data for {e(_day(it['data_date']))} · "
            f"{it['x_weighted_chars']} X chars</span><img src='{e(it['image'])}' alt='{e(it['alt'])}' loading='lazy'>"
            f"<pre>{e(it['text'])}</pre><details><summary>Alt text ({it['alt_chars']} characters)</summary>"
            f"<p>{e(it['alt'])}</p></details>{approve}</div>")
    summary = (f"{s['ready']} ready · {s['blocked']} blocked · {s['skipped_or_invalid']} skipped or invalid · "
               f"identical texts: {s['identical_texts']} · fact-check failures: {s['factcheck_failures']}"
               + (f" · X-weighted length {s['x_weighted_chars_min']}–{s['x_weighted_chars_max']}" if s["ready"] else ""))
    return (f"<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            f"<meta name='viewport' content='width=device-width,initial-scale=1'><title>Approval queue</title>"
            f"<style>{CSS}</style></head><body><main><h1>Approval queue: {e(m['title'])}</h1>"
            f"<p class='warn'>PRIVATE · DRY RUN · nothing here has been posted or approved.</p>"
            f"<p class='muted'>Built {e(m['built_utc'])} UTC. {e(m['note'])}</p><p>{e(summary)}</p>"
            f"<p class='muted'>To approve a post, copy its line into APPROVED_TO_POST in this folder "
            f"(details in APPROVAL_QUEUE.md).</p><div class='grid'>{''.join(cards)}</div></main></body></html>\n")


def publish_queued(queue, post_date: date, *, cadence: str = "daily", live: bool = False, posted_log=None,
                   today: date | None = None, token_provider=None) -> tuple[int, dict]:
    queue = Path(queue)
    run_dir = queue / run_daily.post_folder(post_date, cadence)
    if not (run_dir / "post.json").exists():
        return 4, {"status": "blocked", "reason": f"nothing queued in {run_dir}"}
    bundle = json.loads((run_dir / "post.json").read_text())
    today = today or config.today_az()

    def done(code: int, res: dict):
        run_daily.log(run_dir, "publish", **res)
        return code, res

    code_now = approval.approval_code(bundle, (run_dir / bundle["image"]).read_bytes())
    if code_now != bundle["approval_code"]:
        return done(6, {"status": "blocked", "reason": "the queued files changed after the sheet was written; rebuild the queue and approve again"})
    posted = ledger.PostedLog(posted_log or queue / "posted_log.jsonl")
    refusals = posted.check(bundle["kind"], date.fromisoformat(bundle["data_date"]), bundle["text"], today)
    if refusals:
        return done(7, {"status": "refused", "reasons": [r for _, r in refusals]})
    ok, why = approval.check(queue / "APPROVED_TO_POST", post_date, code_now, allow_standing=False)
    if live and not ok:
        return done(6, {"status": "blocked", "reason": why})
    if live and not 0 <= (today - post_date).days <= 1:
        return done(6, {"status": "blocked", "reason": f"{post_date} is not today or yesterday ({today}); queue a fresh post instead"})
    extra = {"token_provider": token_provider} if token_provider else {}
    try:
        res = publish.publish(bundle, run_dir, live=live, approved=ok, ledger=posted, **extra)
    except Exception as err:
        return done(6, {"status": "publish-failed", "error": str(err)})
    return done(0 if res["status"] in ("dry-run", "posted") else 6, {**res, "approval": why})


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="render mornings into a queue folder with an approval sheet")
    b.add_argument("--out", required=True)
    b.add_argument("--from", dest="start")
    b.add_argument("--to", dest="end")
    b.add_argument("--days", type=int, help="N mornings ending on --to (default: today in Arizona)")
    src = b.add_mutually_exclusive_group()
    src.add_argument("--fixture", help="a date,value CSV like sample/usgs_09379900_lake_elevation_ft.csv")
    src.add_argument("--mirror-repo", help="a clone of the third-party mirror (sandbox replay)")
    b.add_argument("--cadence", choices=("daily", "weekly"), default="daily")
    b.add_argument("--weekday", choices=tuple(config.WEEKDAYS), default=config.WEEKLY_DEFAULT_WEEKDAY)
    b.add_argument("--posted-log")
    b.add_argument("--title", default="")
    pub = sub.add_parser("publish", help="publish one queued morning (dry run unless --live)")
    pub.add_argument("--queue", required=True)
    pub.add_argument("--date", help="post morning YYYY-MM-DD (default: today in Arizona)")
    pub.add_argument("--cadence", choices=("daily", "weekly"), default="daily")
    pub.add_argument("--posted-log")
    pub.add_argument("--live", action="store_true")
    a = p.parse_args(argv)

    if a.cmd == "publish":
        code, res = publish_queued(a.queue, date.fromisoformat(a.date) if a.date else config.today_az(),
                                   cadence=a.cadence, live=a.live, posted_log=a.posted_log)
        sys.exit(code)

    end = date.fromisoformat(a.end) if a.end else config.today_az()
    start = date.fromisoformat(a.start) if a.start else end - timedelta(days=(a.days or 1) - 1)
    days = mornings(start, end)
    if a.mirror_repo:
        from . import replay
        series_for = replay.mirror_source(Path(a.mirror_repo), Path(a.out) / "_cache")
        sample, note = True, replay.NOTE
    elif a.fixture:
        fx = run_daily.Source(sources.parse_series_csv(Path(a.fixture).read_text()), f"committed fixture {Path(a.fixture).name}",
                              stamp="FIXTURE · DRY RUN · NOT POSTED")
        series_for, sample, note = truncating_source(fx), True, "Built from the committed fixture (test data)."
    else:
        src = run_daily.load_series(argparse.Namespace(mirror_file=None), end)
        series_for, sample = truncating_source(src), False
        note = ("Built from official sources; each morning sees only values dated before it."
                + (f" Sources passed over: {'; '.join(src.notes)}." if src.notes else ""))
    manifest = build(a.out, days, series_for, cadence=a.cadence, weekday=a.weekday, sample=sample,
                     posted_log=a.posted_log, title=a.title, note=note)
    print(json.dumps(manifest["summary"], indent=2))
    s = manifest["summary"]
    # a non-zero exit is the alert: 5 something needs a human, 3 nothing could be queued
    sys.exit(5 if (s["blocked"] or s["factcheck_failures"]) else 3 if (s["queued"] and not s["ready"]) else 0)


if __name__ == "__main__":
    main()
