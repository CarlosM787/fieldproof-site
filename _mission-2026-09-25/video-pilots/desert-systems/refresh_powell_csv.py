"""Refresh Pilot B's Lake Powell data straight from USGS, and say whether the video must be re-rendered.

  python desert-systems/refresh_powell_csv.py --out powell-usgs.csv
  python desert-systems/refresh_powell_csv.py --out powell-usgs.csv --source file:saved-response.json   (offline)
  then:  python run.py pilot-b --csv powell-usgs.csv        (renders, re-verifies every number, checks layout)

The committed CSV (../xbot/sample/usgs_09379900_lake_elevation_ft.csv) came from a third-party GitHub
mirror, because this sandbox cannot reach usgs.gov. This script asks USGS itself for the same window
(default Sep 25, 2023 to Sep 24, 2026, what the videos show), in this order:
  1. the USGS Water Data API (daily values, site USGS-09379900, parameter 62614, lake elevation in ft)
  2. the legacy NWIS daily-values service (USGS says it retires in late 2026)
writes the same CSV format, validates it (every day present, plausible range, no jump > 1.5 ft/day) and
compares it with the committed copy, value by value.
Exit codes: 0 identical to the committed copy (no re-render needed, but provisional values can still
change later); 2 values differ (re-render with --csv and re-check); 1 could not fetch or validate.
Set API_USGS_PAT to a free api.waterdata.usgs.gov key for higher rate limits (optional).
"""
import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "xbot"))
from bot import sources  # noqa: E402  (the X bot's tested USGS parsers)

SITE, PARAM = "09379900", "62614"
COMMITTED = HERE.parent.parent / "xbot" / "sample" / "usgs_09379900_lake_elevation_ft.csv"


def urls(start: date, end: date) -> dict:
    return {
        "waterdata": ("https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items?"
                      f"monitoring_location_id=USGS-{SITE}&parameter_code={PARAM}&time={start}T00:00:00Z/{end}T23:59:59Z"
                      "&skipGeometry=true&limit=50000&f=json"),
        "nwis": f"https://waterservices.usgs.gov/nwis/dv/?format=json&sites={SITE}&parameterCd={PARAM}&startDT={start}&endDT={end}",
    }


def fetch_series(source: str, start: date, end: date) -> tuple[list, str]:
    if source.startswith("file:"):
        text = Path(source[5:]).read_text()
        parser = sources.parse_usgs_waterdata_daily if '"features"' in text else sources.parse_usgs_dv
        return parser(text), f"saved response {source[5:]}"
    errors = []
    for name in (["waterdata", "nwis"] if source == "auto" else [source]):
        url = urls(start, end)[name]
        headers = {"X-Api-Key": os.environ["API_USGS_PAT"]} if name == "waterdata" and os.environ.get("API_USGS_PAT") else None
        try:
            text = sources.fetch(url, headers=headers)
            series = (sources.parse_usgs_waterdata_daily if name == "waterdata" else sources.parse_usgs_dv)(text)
        except Exception as e:  # network, HTTP, parse: try the next source
            errors.append(f"{name}: {e}")
            continue
        if series:
            return series, url
        errors.append(f"{name}: no values")
    raise SystemExit("could not fetch from USGS: " + "; ".join(errors))


def validate(series: list, start: date, end: date) -> list[str]:
    s = [(d, v) for d, v in series if start <= d <= end]
    problems = []
    want = (end - start).days + 1
    if len(s) != want:
        have = {d for d, _ in s}
        missing = [str(start + timedelta(days=i)) for i in range(want) if start + timedelta(days=i) not in have]
        problems.append(f"{len(s)} of {want} days present; missing {missing[:5]}{' ...' if len(missing) > 5 else ''}")
    for d, v in s:
        if not 3300.0 <= v <= 3711.0:
            problems.append(f"out of range on {d}: {v}")
    for (d0, v0), (d1, v1) in zip(s, s[1:]):
        if (d1 - d0).days == 1 and abs(v1 - v0) > 1.5:
            problems.append(f"jump of {v1 - v0:+.1f} ft from {d0} to {d1}")
    return problems


def write_csv(series, start, end, path, where):
    lines = [f"# USGS site {SITE} (Lake Powell at Glen Canyon Dam), parameter {PARAM}, daily values in feet.",
             f"# Provisional public-domain U.S. government data, fetched {date.today()} from {where}; values only.",
             "date,elevation_ft"] + [f"{d},{v:.1f}" for d, v in series if start <= d <= end]
    Path(path).write_text("\n".join(lines) + "\n")


def compare(new: list, old_path: Path, start: date, end: date) -> dict:
    old = dict(sources.parse_series_csv(old_path.read_text()))
    new_d = {d: round(v, 1) for d, v in new if start <= d <= end}
    changed = [(str(d), old[d], v) for d, v in sorted(new_d.items()) if d in old and abs(old[d] - v) > 1e-9]
    return {"dates_compared": sum(1 for d in new_d if d in old), "only_new": sum(1 for d in new_d if d not in old),
            "only_committed": sum(1 for d in old if start <= d <= end and d not in new_d), "values_changed": len(changed),
            "max_abs_change_ft": round(max((abs(a - b) for _, a, b in changed), default=0.0), 2), "first_changes": changed[:20]}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="start", default="2023-09-25")
    ap.add_argument("--to", dest="end", default="2026-09-24")
    ap.add_argument("--out", required=True)
    ap.add_argument("--source", default="auto", help="auto | waterdata | nwis | file:<saved JSON response>")
    ap.add_argument("--compare", default=str(COMMITTED))
    ap.add_argument("--print-urls", action="store_true", help="print the two USGS URLs and exit (to open in a browser)")
    a = ap.parse_args(argv)
    start, end = date.fromisoformat(a.start), date.fromisoformat(a.end)
    if a.print_urls:
        print(json.dumps(urls(start, end), indent=1))
        return 0
    series, where = fetch_series(a.source, start, end)
    problems = validate(series, start, end)
    if problems:
        print(json.dumps({"source": where, "problems": problems[:20]}, indent=1))
        return 1
    write_csv(series, start, end, a.out, where)
    diff = compare(series, Path(a.compare), start, end) if a.compare else {}
    print(json.dumps({"source": where, "wrote": a.out, "days": (end - start).days + 1, "compare_with": a.compare, **diff}, indent=1))
    return 2 if diff.get("values_changed") or diff.get("only_new") or diff.get("only_committed") else 0


if __name__ == "__main__":
    sys.exit(main())
