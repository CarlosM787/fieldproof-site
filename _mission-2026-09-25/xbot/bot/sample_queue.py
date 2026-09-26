"""The phase-three sample approval queue: Arizona Grid Daily posts plus one weekly river post, each
exactly as it would go out (text, alt text, image) with its approval line. Nothing is posted.

  python -m bot.sample_queue --eia-file EIA930_BALANCE_2026_Jul_Dec.csv --eia-note "Downloaded from eia.gov on <date>." \\
      --grid-from 2026-08-16 --grid-to 2026-08-22 --powell-csv sample/usgs_09379900_lake_elevation_ft.csv \\
      --mead-csv 921-49.csv --river-as-of 2026-09-06 --out <queue dir> [--stamp "..."]
  (sandbox: --mead-mirror <lakelevelnow json> instead of --mead-csv; every image is then stamped as a copy)

Each grid day D is queued for the morning of D + config.GRID_POST_LAG_DAYS. The dates are the data's
true dates. Writes <out>/<morning>-grid/ and <out>/<morning>-river/ (post.json, the PNG, log.jsonl),
queue.json, APPROVAL_QUEUE.md and index.html (a static page: images, exact text, alt text, checks,
source links and the approval line to copy into APPROVED_TO_POST).
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import config, grid_post, ledger, river, run_daily, sources

SOURCE_LINKS = {
    "EIA-930 Hourly Electric Grid Monitor": config.GRID_SOURCE_URL,
    "EIA-930 six-month balance file (Jul-Dec 2026)": config.SOURCES["eia930_bulk"]["url"],
    "USGS 09379900 (Lake Powell) monitoring location": "https://waterdata.usgs.gov/monitoring-location/USGS-09379900/",
    "Reclamation hydrodata, Lake Mead (921), pool elevation": config.SOURCES["usbr_mead"]["url"],
    "Reclamation hydrodata, Lake Powell (919), pool elevation": config.SOURCES["usbr_powell"]["url"],
}


def _json_default(o):
    return o.isoformat() if isinstance(o, date) else str(o)


def build(out, *, eia_text: str, eia_sha: str, eia_note: str, grid_days: list[date], powell, mead, river_as_of: date,
          stamp_grid: str | None, stamp_river: str | None, river_source_line: str, river_credits, title: str, note: str) -> dict:
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    items = []
    parsed = {ba: sources.parse_eia930_balance(eia_text, ba) for ba in config.GRID_BAS}   # one pass per authority
    for day in grid_days:
        as_of = day + timedelta(days=config.GRID_POST_LAG_DAYS)
        folder = run_daily.post_folder(as_of, "grid")
        per_ba = {ba: [h for h in rows if h["date"] == day] for ba, rows in parsed.items()}
        code, bundle, detail = grid_post.make_post(per_ba, day, as_of, out / folder, stamp=stamp_grid, source_note=eia_note,
                                                   source_label="EIA-930 balance file (" + " + ".join(config.GRID_BAS) + ")",
                                                   file_sha256=eia_sha)
        items.append(_item(out, folder, as_of, "grid", code, bundle, detail))
    folder = run_daily.post_folder(river_as_of, "river-weekly")
    series = {"powell": [(d, v) for d, v in powell if d < river_as_of], "mead": [(d, v) for d, v in mead if d < river_as_of]}
    code, bundle, detail = river.make_post(series, river_as_of, out / folder, stamp=stamp_river, source_line=river_source_line,
                                           credits=river_credits, source_label="USGS 09379900 (Powell) + Reclamation 921/49 (Mead)")
    items.append(_item(out, folder, river_as_of, "river-weekly", code, bundle, detail))
    # the queue as a whole: no identical texts, no repeated data date within a series
    seen_text, seen_date = {}, {}
    for it in (i for i in items if i["status"] == "ready"):
        sha = ledger.text_sha256(it["text"])
        if sha in seen_text:
            it["problems"].append(f"identical text to {seen_text[sha]}")
        seen_text.setdefault(sha, it["as_of"])
        key = (it["kind"], it["data_date"])
        if key in seen_date:
            it["problems"].append(f"same data date as {seen_date[key]}")
        seen_date.setdefault(key, it["as_of"])
        if it["problems"]:
            it["status"] = "blocked"
    ready = [i for i in items if i["status"] == "ready"]
    m = {"title": title, "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "note": note,
         "summary": {"posts": len(items), "ready": len(ready), "blocked_or_invalid": len(items) - len(ready),
                     "factcheck_failures": sum(i["status"] == "factcheck-failed" for i in items),
                     "x_weighted_chars": [min((i["x_weighted_chars"] for i in ready), default=None), max((i["x_weighted_chars"] for i in ready), default=None)],
                     "alt_chars": [min((i["alt_chars"] for i in ready), default=None), max((i["alt_chars"] for i in ready), default=None)],
                     "est_cost_usd_if_all_posted": round(sum(i.get("est_cost_usd", 0) for i in ready), 3)},
         "source_links": SOURCE_LINKS, "items": items}
    (out / "queue.json").write_text(json.dumps(m, indent=2, ensure_ascii=False, default=_json_default))
    (out / "APPROVAL_QUEUE.md").write_text(markdown(m))
    (out / "index.html").write_text(page(m))
    return m


def _item(out, folder, as_of, cadence, code, bundle, detail):
    it = {"as_of": as_of.isoformat(), "folder": folder, "cadence": cadence, "problems": []}
    run_dir = out / folder
    run_dir.mkdir(parents=True, exist_ok=True)
    if code:
        run_daily.log(run_dir, **detail)
        return {**it, "status": detail["event"], "problems": detail.get("issues") or detail.get("problems") or []}
    run_daily.write_bundle(run_dir, bundle)
    run_daily.log(run_dir, "queued", data_date=bundle["data_date"], code=bundle["approval_code"])
    return {**it, "status": "ready", "kind": bundle["kind"], "data_date": str(bundle["data_date"]), "text": bundle["text"],
            "alt": bundle["alt"], "image": f"{folder}/{bundle['image']}", "x_weighted_chars": bundle["x_weighted_chars"],
            "alt_chars": bundle["alt_chars"], "approval_code": bundle["approval_code"], "source": bundle["source"],
            "second_reading": bundle.get("second_reading"), "rotating_fact": bundle.get("rotating_fact"),
            "est_cost_usd": bundle["est_cost_usd"], "approval_line": f"{as_of.isoformat()} {bundle['approval_code']}"}


def _day(iso):
    d = date.fromisoformat(iso[:10])
    return f"{config.WEEKDAYS_EN[d.weekday()]} {config.MONTHS_EN[d.month - 1]} {d.day}, {d.year}"


def _checks(it) -> list[str]:
    if it["status"] != "ready":
        return it["problems"] or [it["status"]]
    out = ["complete day (24 hours, every authority)" if it["cadence"] == "grid" else "7-day windows complete for both lakes",
           "fact-check: every number recomputed from the raw rows", f"{it['x_weighted_chars']} of 280 X-weighted characters, no URL",
           f"alt text {it['alt_chars']} of 1,000 characters, EN + ES, with the preliminary/provisional note",
           "text unique in this queue"]
    sr = it.get("second_reading")
    if sr:
        out.append("second reading: " + (sr["status"] + (" (" + sr.get("why", "") + "); production posts only after two readings agree"
                                                          if sr["status"] == "not available" else "")))
    return out


def markdown(m: dict) -> str:
    s = m["summary"]
    lines = [f"# {m['title']}", "", "**SAMPLE · DRY RUN · nothing here has been posted or approved.**", "", m["note"], "",
             f"Built {m['built_utc']} UTC. **{s['ready']} of {s['posts']} ready**, fact-check failures {s['factcheck_failures']}, "
             f"X-weighted length {s['x_weighted_chars'][0]}-{s['x_weighted_chars'][1]}, alt text {s['alt_chars'][0]}-{s['alt_chars'][1]} characters, "
             f"metered cost if all were posted ${s['est_cost_usd_if_all_posted']:.3f} (VERIFIED prices: $0.015 per post, $0.005 per alt text).", "",
             "Approve a post by copying its approval line into `APPROVED_TO_POST` in the queue folder. The code covers this exact text, "
             "alt text and image; a re-render needs a new approval. In production the line is for today's or yesterday's morning only.", "",
             "| Morning | Kind | Data for | Chars | Status | Approval line |", "|---|---|---|---|---|---|"]
    for it in m["items"]:
        lines.append(f"| {_day(it['as_of'])} | {it['cadence']} | {_day(it['data_date']) if it.get('data_date') else ''} | "
                     f"{it.get('x_weighted_chars', '')} | {it['status']} | {'`' + it['approval_line'] + '`' if it.get('approval_line') else '-'} |")
    for it in m["items"]:
        lines += ["", f"## {_day(it['as_of'])} · {it['cadence']}", ""]
        if it["status"] != "ready":
            lines.append("**Not queued:** " + "; ".join(it["problems"]))
            continue
        lines += [f"![chart]({it['image']})", "", "```text", it["text"], "```", "", f"**Alt text** ({it['alt_chars']} characters): {it['alt']}", "",
                  f"**Source:** {it['source']}", "", "**Checks:** " + "; ".join(_checks(it)), "", f"**Approve:** `{it['approval_line']}`"]
    lines += ["", "## Source links", ""] + [f"- {k}: {v}" for k, v in m["source_links"].items()]
    return "\n".join(lines) + "\n"


CSS = """
:root{--bg:#0b1a24;--card:#10232f;--line:#1d3a4b;--ink:#eaf2f5;--muted:#8fa6b2;--warn:#f2a541;--ok:#1f5f4a;--bad:#7a2e2e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1240px;margin:0 auto;padding:20px 16px 56px}h1{font-size:22px;margin:0 0 6px}h2{font-size:17px;margin:28px 0 8px}
.warn{color:var(--warn);font-weight:600}.muted{color:var(--muted)}a{color:#62d2e8;overflow-wrap:anywhere}li,p{overflow-wrap:anywhere}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr));gap:16px;margin-top:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;min-width:0}
.card img{width:100%;height:auto;border-radius:6px;display:block;margin:8px 0}
pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border-radius:6px;padding:10px;margin:8px 0;font:13px/1.45 ui-monospace,Consolas,monospace}
code{background:var(--bg);border-radius:4px;padding:2px 6px;font:13px ui-monospace,Consolas,monospace;user-select:all;word-break:break-all}
.st{float:right;font-size:12px;border-radius:99px;padding:1px 9px;background:var(--line)}.st.ready{background:var(--ok)}.st.blocked,.st.invalid,.st.factcheck-failed{background:var(--bad)}
ul.checks{margin:6px 0 8px;padding-left:18px;color:var(--muted);font-size:13px}details{margin:6px 0}summary{cursor:pointer;color:var(--muted)}
.kind{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
"""


def page(m: dict) -> str:
    e = html.escape
    s = m["summary"]
    cards = []
    for it in m["items"]:
        head = (f"<span class='st {e(it['status'])}'>{e(it['status'])}</span><div class='kind'>{e(it['cadence'])}</div>"
                f"<b>Morning of {e(_day(it['as_of']))}</b>")
        if it["status"] != "ready":
            cards.append(f"<div class='card'>{head}<p class='warn'>{e('; '.join(it['problems']))}</p></div>")
            continue
        checks_html = "".join(f"<li>{e(c)}</li>" for c in _checks(it))
        cards.append(
            f"<div class='card'>{head}<div class='muted'>data for {e(_day(it['data_date']))} · {it['x_weighted_chars']} X chars</div>"
            f"<img src='{e(it['image'])}' alt='{e(it['alt'])}' loading='lazy' width='1600' height='900'>"
            f"<pre>{e(it['text'])}</pre><details><summary>Alt text ({it['alt_chars']} characters)</summary><p>{e(it['alt'])}</p></details>"
            f"<ul class='checks'>{checks_html}</ul><div class='muted'>Source: {e(it['source'])}</div>"
            f"<p>Approval line: <code>{e(it['approval_line'])}</code></p></div>")
    links = "".join(f"<li>{e(k)}: <a href='{e(v)}' rel='noopener'>{e(v)}</a></li>" for k, v in m["source_links"].items())
    return (f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>X approval queue</title><style>{CSS}</style></head><body><main><h1>{e(m['title'])}</h1>"
            f"<p class='warn'>SAMPLE · DRY RUN · nothing here has been posted or approved.</p><p class='muted'>{e(m['note'])}</p>"
            f"<p>{s['ready']} of {s['posts']} ready · fact-check failures {s['factcheck_failures']} · X-weighted length "
            f"{s['x_weighted_chars'][0]}–{s['x_weighted_chars'][1]} · alt text {s['alt_chars'][0]}–{s['alt_chars'][1]} characters · "
            f"metered cost if all were posted ${s['est_cost_usd_if_all_posted']:.3f}</p>"
            f"<p class='muted'>To approve a post, copy its approval line into APPROVED_TO_POST in the queue folder. The code is a hash of the "
            f"exact text, alt text and image. Built {e(m['built_utc'])} UTC.</p><div class='grid'>{''.join(cards)}</div>"
            f"<h2>Source links</h2><ul>{links}</ul></main></body></html>\n")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--eia-file", required=True)
    p.add_argument("--eia-note", required=True, help="where the EIA file came from (printed on every grid image)")
    p.add_argument("--grid-from", required=True)
    p.add_argument("--grid-to", required=True)
    p.add_argument("--powell-csv", required=True)
    mead = p.add_mutually_exclusive_group(required=True)
    mead.add_argument("--mead-csv", help="Reclamation hydrodata CSV for Lake Mead (921/49)")
    mead.add_argument("--mead-mirror", help="sandbox only: a third-party mirror JSON (lakelevelnow)")
    p.add_argument("--river-as-of", required=True)
    p.add_argument("--stamp", help="stamp for every image (default: provenance stamps for copies, none for official files)")
    p.add_argument("--official", action="store_true", help="the EIA and Mead files were downloaded from eia.gov / usbr.gov")
    p.add_argument("--out", required=True)
    a = p.parse_args(argv)
    raw = Path(a.eia_file).read_bytes()
    d0, d1 = date.fromisoformat(a.grid_from), date.fromisoformat(a.grid_to)
    powell = sources.parse_series_csv(Path(a.powell_csv).read_text())
    if a.mead_mirror:
        mead_series = river.parse_lakelevelnow_mead(Path(a.mead_mirror).read_text())
    else:
        mead_series = sources.parse_usbr_csv(Path(a.mead_csv).read_text())
    copy = not a.official
    river_line = ("Data: USGS site 09379900 (Lake Powell) and Bureau of Reclamation (Lake Mead) daily values, provisional"
                  + ("; read here from third-party GitHub mirrors (sandbox sample)" if copy else "")
                  + ". Minimum power pools: Reclamation (3,490 ft Powell; about 950 ft Mead). Not an official product.")
    m = build(a.out, eia_text=raw.decode("utf-8"), eia_sha=hashlib.sha256(raw).hexdigest(), eia_note=a.eia_note,
              grid_days=[d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)], powell=powell, mead=mead_series,
              river_as_of=date.fromisoformat(a.river_as_of),
              stamp_grid=a.stamp or (grid_post.STAMP_THIRD_PARTY if copy else None),
              stamp_river=a.stamp or ("REPLAY · THIRD-PARTY MIRRORS · NOT POSTED" if copy else None),
              river_source_line=river_line,
              river_credits=(("USGS; Reclamation via third-party mirrors (sandbox sample)", "USGS; Reclamation vía espejos de terceros (muestra de prueba)")
                             if copy else ("USGS; U.S. Bureau of Reclamation", "USGS; Oficina de Reclamación de EE. UU.")),
              title="X approval queue: Arizona Grid Daily (7 days) + Colorado River weekly",
              note=("Built from third-party copies of official data, with their true dates: EIA-930 (a GitHub copy of EIA's Jul-Dec 2026 "
                    "balance file), USGS 09379900 (a GitHub mirror) and Reclamation's Lake Mead series (a GitHub mirror). "
                    "Not official, not posted; for checking the format and the approval flow only." if copy else
                    "Built from files downloaded from eia.gov, USGS and usbr.gov. Dry run: nothing is posted."))
    print(json.dumps(m["summary"], indent=2))
    return 0 if m["summary"]["ready"] == m["summary"]["posts"] else 5


if __name__ == "__main__":
    raise SystemExit(main())
