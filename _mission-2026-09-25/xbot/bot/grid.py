"""Arizona Grid Daily (lead concept): one local day of EIA-930 generation by fuel for the three
largest Arizona balancing authorities, added together: APS (AZPS), SRP and TEP (TEPC).

  python -m bot.grid --balance-file EIA930_BALANCE_2026_Jul_Dec.csv --date 2026-08-22 --out <dir> \\
      --stamp "THIRD-PARTY COPY OF EIA-930 · NOT OFFICIAL · NOT POSTED" --source-note "Read from ..."

It renders the chart and writes the day's numbers next to it; it never posts. Posting the grid
concept still needs its own compose and fact-check. EIA-930 values are preliminary and keep changing
for days after first release (AUDIT_P2.md), so a live grid post should wait for a second reading.
The stamp and source note are required so that no sample leaves without its provenance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

from . import checks, config, render, sources

BAS = ("AZPS", "SRP", "TEPC")
TOTALS = ("demand", "net_generation", "interchange")


def combine(hours_by_ba: dict[str, list[dict]]) -> list[dict]:
    """Adds the authorities hour by hour. A total blank in any authority stays blank (the day is
    incomplete); a fuel an authority does not report counts as none."""
    by_hour: dict[int, list[dict]] = {}
    for hours in hours_by_ba.values():
        for h in hours:
            by_hour.setdefault(h["hour"], []).append(h)
    out = []
    for hour in sorted(by_hour):
        rows = by_hour[hour]
        rec = {"hour": hour, "date": rows[0]["date"]}
        for k in TOTALS:
            vals = [r[k] for r in rows]
            rec[k] = None if len(rows) < len(hours_by_ba) or None in vals else sum(vals)
        for k in sources.GRID_FUELS:
            known = [r[k] for r in rows if r[k] is not None]
            rec[k] = sum(known) if known else None
        out.append(rec)
    return out


def clock(hour_ending: int) -> str:
    h = hour_ending % 24
    return "midnight" if h == 0 else "noon" if h == 12 else f"{h % 12} {'a.m.' if h < 12 else 'p.m.'}"


def day_summary(hours: list[dict]) -> dict:
    gen = sum(h["net_generation"] for h in hours)
    solar = sum(max(h["solar"] or 0.0, 0.0) for h in hours)
    peak = max(hours, key=lambda h: h["demand"])
    return {
        "generation_mwh": round(gen),
        "demand_mwh": round(sum(h["demand"] for h in hours)),
        "solar_mwh": round(solar),
        "solar_share_of_generation": round(solar / gen, 3),
        "peak_demand_mw": round(peak["demand"]),
        "peak_hour_ending": peak["hour"],
        "net_imports_mwh": round(sum(h["demand"] - h["net_generation"] for h in hours)),
        "storage_charging_mwh": round(-sum(min(h["storage"] or 0.0, 0.0) for h in hours)),
        "storage_discharging_mwh": round(sum(max(h["storage"] or 0.0, 0.0) for h in hours)),
    }


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--balance-file", required=True, help="an EIA930_BALANCE_<year>_<half>.csv file")
    p.add_argument("--date", required=True, help="local (Arizona) date, YYYY-MM-DD")
    p.add_argument("--out", required=True)
    p.add_argument("--stamp", required=True, help="provenance stamp printed on the image")
    p.add_argument("--source-note", required=True, help="where the file came from; printed on the image")
    a = p.parse_args(argv)
    raw = Path(a.balance_file).read_bytes()
    text, day, out = raw.decode("utf-8"), date.fromisoformat(a.date), Path(a.out)
    per_ba = {ba: [h for h in sources.parse_eia930_balance(text, ba) if h["date"] == day] for ba in BAS}
    issues = {ba: checks.grid_day_issues(h) for ba, h in per_ba.items()}
    record = {"date": day, "balancing_authorities": BAS, "issues": issues, "stamp": a.stamp,
              "source_note": a.source_note, "file_sha256": hashlib.sha256(raw).hexdigest()}
    out.mkdir(parents=True, exist_ok=True)
    if any(issues.values()):
        (out / f"grid-{day}.json").write_text(json.dumps(record, indent=2, default=str))
        print(json.dumps(issues, indent=2))
        sys.exit(4)
    hours = combine(per_ba)
    s = record["summary"] = day_summary(hours)
    when = f"{day:%a} {config.MONTHS_EN[day.month - 1]} {day.day}, {day.year}"
    record["image"] = render.render_grid(
        hours, out / f"grid-{day}.png", header="ARIZONA GRID DAILY · SAMPLE",
        title=f"Solar made {s['solar_share_of_generation']:.0%} of the power",
        subtitle=(f"APS + SRP + TEP · {when} · peak demand {s['peak_demand_mw']:,} MW in the hour to "
                  f"{clock(s['peak_hour_ending'])} · net imports {s['net_imports_mwh']:,} MWh"),
        stamp=a.stamp,
        source_line=(f"Data: EIA-930 hourly balance file, AZPS + SRP + TEPC, local time; preliminary, revised for days "
                     f"afterwards. {a.source_note}")).name
    (out / f"grid-{day}.json").write_text(json.dumps(record, indent=2, default=str))
    print(json.dumps(s, indent=2))


if __name__ == "__main__":
    main()
