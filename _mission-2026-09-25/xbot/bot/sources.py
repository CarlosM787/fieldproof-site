"""Fetch and parse daily series. Every parser returns a sorted list of (date, float)."""
from __future__ import annotations

import csv
import io
import json
import time
import urllib.request
from datetime import date, datetime

UA = "ColoradoRiverDaily/0.1 (data-visual bot; contact in bio)"


def fetch(url: str, tries: int = 3, timeout: int = 30) -> str:
    """GET with retries and backoff. Raises the last error so the run fails loudly."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # network, HTTP, proxy
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"fetch failed after {tries} tries: {url}: {last}")


def _day(s: str) -> date:
    return datetime.fromisoformat(s[:10]).date()


def parse_usgs_dv(text: str) -> list[tuple[date, float]]:
    """USGS NWIS dv JSON (WaterML-JSON). Skips missing/ice/equipment flags."""
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


def parse_eia930_balance(text: str, respondent: str) -> list[dict]:
    """EIA-930 six-month balance CSV -> hourly rows for one balancing authority (e.g. AZPS, SRP,
    TEPC). Column names are matched loosely ("... from Solar"); OPEN until run on a real file."""
    rows = csv.DictReader(io.StringIO(text))
    fuels = {"Solar": "solar", "Wind": "wind", "Natural Gas": "gas", "Coal": "coal", "Nuclear": "nuclear",
             "Hydropower": "hydro", "Other": "other", "Petroleum": "oil"}
    out = []
    for r in rows:
        if r.get("Balancing Authority", "").strip() != respondent:
            continue
        rec = {"utc": r.get("UTC Time at End of Hour") or r.get("UTC Time at End of Hour ")}
        for col, val in r.items():
            if not col or "from" not in col:
                continue
            for k, short in fuels.items():
                if k in col:
                    try:
                        rec[short] = rec.get(short, 0.0) + float(str(val).replace(",", "") or 0)
                    except ValueError:
                        pass
        try:
            rec["demand"] = float(str(r.get("Demand (MW)", "")).replace(",", ""))
        except ValueError:
            rec["demand"] = None
        out.append(rec)
    return out
