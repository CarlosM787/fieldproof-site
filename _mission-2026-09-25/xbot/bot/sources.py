"""Fetch and parse daily series. Every series parser returns a sorted list of (date, float)."""
from __future__ import annotations

import csv
import io
import json
import re
import time
import urllib.request
from datetime import date, datetime

UA = "ColoradoRiverDaily/0.1 (data-visual bot; contact in bio)"


def fetch(url: str, tries: int = 3, timeout: int = 30, headers: dict | None = None) -> str:
    """GET with retries and backoff. Raises the last error so the run fails loudly."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # network, HTTP, proxy
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"fetch failed after {tries} tries: {url}: {last}")


def _day(s: str) -> date:
    return datetime.fromisoformat(s[:10]).date()


def parse_usgs_waterdata_daily(text: str) -> list[tuple[date, float]]:
    """USGS Water Data API (OGC API - Features) `daily` items: GeoJSON features whose properties
    carry `time`, `value` (a string), `statistic_id` and `approval_status` ("Provisional" or
    "Approved"). If several statistics come back, the daily mean (00003) wins."""
    d = json.loads(text)
    if d.get("numberMatched") and d["numberMatched"] > d.get("numberReturned", 0):
        raise ValueError("paged response: raise `limit` so the whole period arrives in one page")
    by_stat: dict[str, dict[date, float]] = {}
    for f in d.get("features", []):
        p = f.get("properties") or {}
        try:
            val = float(p["value"])
        except (KeyError, TypeError, ValueError):
            continue
        by_stat.setdefault(p.get("statistic_id"), {})[_day(p["time"])] = val
    if not by_stat:
        return []
    stat = "00003" if "00003" in by_stat else max(by_stat, key=lambda k: len(by_stat[k]))
    return sorted(by_stat[stat].items())


def parse_usgs_dv(text: str) -> list[tuple[date, float]]:
    """USGS NWIS dv JSON (WaterML-JSON), the legacy service. Skips missing/ice/equipment flags."""
    d = json.loads(text)
    out = []
    for ts in d["value"]["timeSeries"]:
        for block in ts["values"]:
            for v in block["value"]:
                try:
                    val = float(v["value"])
                except (TypeError, ValueError):
                    continue
                if val <= -999:
                    continue
                out.append((_day(v["dateTime"]), val))
    return sorted(dict(out).items())


def parse_usbr_csv(text: str) -> list[tuple[date, float]]:
    """Reclamation hydrodata CSV. Column names vary, so take the first date-like column and the
    first numeric column after it (OPEN: confirm against a real file on an open network)."""
    rows = list(csv.reader(io.StringIO(text)))
    head, body = rows[0], rows[1:]
    out = []
    for r in body:
        if len(r) < 2:
            continue
        try:
            dt = _day(r[0].strip())
            val = float(r[1])
        except ValueError:
            continue
        out.append((dt, val))
    return sorted(dict(out).items())


def parse_mirror_cache(text: str) -> list[tuple[date, float]]:
    """THIRD-PARTY MIRROR (sandbox only): github.com/ebootheee/powell cache/current.json, a daily
    GitHub Actions cache of the USGS series above. Used here only because the sandbox network
    blocks usgs.gov; production reads USGS or Reclamation directly."""
    d = json.loads(text)
    return sorted((_day(p["date"]), float(p["value"])) for p in d["elevationFull"])


def parse_series_csv(text: str) -> list[tuple[date, float]]:
    """The committed fixture: '#' comment lines, then date,elevation_ft."""
    out = []
    for line in text.splitlines():
        if not line or line.startswith("#") or line.startswith("date,"):
            continue
        d, v = line.split(",")[:2]
        out.append((_day(d), float(v)))
    return sorted(out)


# --- EIA-930 (lead concept) -----------------------------------------------------------------

GRID_FUELS = ("solar", "wind", "hydro", "nuclear", "coal", "gas", "oil", "storage", "other")
_GEN_COL = re.compile(r"^Net Generation \(MW\) from (?P<src>.+?)(?: \((?P<variant>Imputed|Adjusted)\))?$")


def _num(s) -> float | None:
    s = str(s if s is not None else "").replace(",", "").strip()
    try:
        return float(s) if s else None
    except ValueError:
        return None


def _grid_fuel(src: str) -> str:
    s = src.lower()
    # order matters: "Solar with Integrated Battery Storage" is solar, "Hydropower Excluding
    # Pumped Storage" is hydro, and every other "... Storage" (battery, pumped, unknown) is storage
    for key, fuel in (("solar", "solar"), ("wind", "wind"), ("hydro", "hydro"), ("nuclear", "nuclear"),
                      ("coal", "coal"), ("natural gas", "gas"), ("petroleum", "oil"), ("storage", "storage")):
        if key in s:
            return fuel
    return "other"  # geothermal, other and unknown fuel sources


def _pick(r: dict, col: str) -> float | None:
    """EIA's adjusted value when it has one, else the value as reported."""
    adj = _num(r.get(f"{col} (Adjusted)"))
    return adj if adj is not None else _num(r.get(col))


def parse_eia930_balance(text: str, respondent: str) -> list[dict]:
    """EIA-930 six-month balance CSV -> one dict per hour for one balancing authority (AZPS, SRP,
    TEPC ...): local `date` and `hour` (1-24), `utc`, `demand`, `net_generation`, `interchange`
    and MW by fuel (GRID_FUELS).

    Checked against a real 2026 Jul-Dec file (a third-party copy; see AUDIT_P2.md). Each measure
    comes as reported, "(Imputed)" and "(Adjusted)"; this takes one of them (adjusted, else as
    reported) instead of adding them up. Blank cells stay None (the newest day is blank until the
    utilities report), never 0. Storage keeps its sign (negative while charging). EIA's headers
    contain typos ("Solar witho Integrated ...", doubled spaces), so names are normalised first.
    """
    out = []
    for raw in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        r = {" ".join((k or "").split()).replace(" witho ", " with "): v for k, v in raw.items()}
        if (r.get("Balancing Authority") or "").strip() != respondent:
            continue
        sources: dict[str, list] = {}  # source column -> [as reported, adjusted]
        for col, val in r.items():
            m = _GEN_COL.match(col)
            if not m or m["variant"] == "Imputed":
                continue
            sources.setdefault(m["src"], [None, None])[1 if m["variant"] else 0] = _num(val)
        fuels: dict[str, float | None] = {f: None for f in GRID_FUELS}
        for src, (reported, adjusted) in sources.items():
            v = adjusted if adjusted is not None else reported
            if v is not None:
                f = _grid_fuel(src)
                fuels[f] = (fuels[f] or 0.0) + v
        out.append({
            "ba": respondent,
            "date": datetime.strptime(r["Data Date"].strip(), "%m/%d/%Y").date(),
            "hour": int(r["Hour Number"]),
            "utc": r.get("UTC Time at End of Hour"),
            "demand": _pick(r, "Demand (MW)"),
            "net_generation": _pick(r, "Net Generation (MW)"),
            "interchange": _pick(r, "Total Interchange (MW)"),
            "forecast": _num(r.get("Demand Forecast (MW)")),
            **fuels,
        })
    return out
