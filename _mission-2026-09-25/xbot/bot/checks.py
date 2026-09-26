"""Validation, metrics and the independent fact check.

validate()  - is the data fit to publish?
metrics()   - the numbers a post may use
factcheck() - re-derives every number from the raw series, separately from metrics(), and
              compares it with the text that is about to be posted. Any mismatch blocks the post.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from . import config


def validate(series: list[tuple[date, float]], as_of: date) -> list[str]:
    issues = []
    if not series:
        return ["no data"]
    dates = [d for d, _ in series]
    if dates != sorted(dates) or len(set(dates)) != len(dates):
        issues.append("dates out of order or duplicated")
    last_d, last_v = series[-1]
    age = (as_of - last_d).days
    if age > config.LIMITS["max_age_days"]:
        issues.append(f"stale: newest value is {last_d} ({age} days before {as_of})")
    if age < 0:
        issues.append(f"newest value {last_d} is after the run date {as_of}")
    for d, v in series[-60:]:
        if not (config.LIMITS["min_ft"] <= v <= config.LIMITS["max_ft"]):
            issues.append(f"out of range: {v} ft on {d}")
    recent = series[-31:]
    for (d0, v0), (d1, v1) in zip(recent, recent[1:]):
        if (d1 - d0).days == 1 and abs(v1 - v0) > config.LIMITS["max_daily_jump_ft"]:
            issues.append(f"jump of {v1 - v0:+.1f} ft from {d0} to {d1}")
    window = {d for d in dates if last_d - timedelta(days=29) <= d <= last_d}
    if len(window) < config.LIMITS["min_days_last_30"]:
        issues.append(f"only {len(window)} of the last 30 days present")
    return issues


def _value_near(series, target: date, tol_days: int = 3):
    best = None
    for d, v in series:
        gap = abs((d - target).days)
        if gap <= tol_days and (best is None or gap < best[0]):
            best = (gap, d, v)
    return (best[1], best[2]) if best else (None, None)


def metrics(series: list[tuple[date, float]]) -> dict:
    last_d, last_v = series[-1]
    prev = dict(series).get(last_d - timedelta(days=1))
    d30, v30 = _value_near(series, last_d - timedelta(days=30), 2)
    try:
        year_ago = last_d.replace(year=last_d.year - 1)
    except ValueError:  # Feb 29
        year_ago = last_d - timedelta(days=365)
    dy, vy = _value_near(series, year_ago, 3)
    # most recent earlier day that was as low or lower than today (outside the last 30 days)
    lowest_since = None
    for d, v in reversed(series[:-31]):
        if v <= last_v:
            lowest_since = d
            break
    return {
        "date": last_d,
        "ft": round(last_v, 1),
        "change_1d": round(last_v - prev, 1) if prev is not None else None,
        "change_30d": round(last_v - v30, 1) if v30 is not None else None,
        "year_ago_date": dy,
        "year_ago_ft": round(vy, 1) if vy is not None else None,
        "change_yoy": round(last_v - vy, 1) if vy is not None else None,
        "above_min_power_pool": round(last_v - config.MIN_POWER_POOL_FT, 1),
        "vs_3525": round(last_v - 3525.0, 1),
        "lowest_since": lowest_since,
        "record_start": series[0][0],
    }


NUM = re.compile(r"[+−-]?\d[\d,]*\.?\d*")


def _nums(text: str) -> list[float]:
    out = []
    for m in NUM.findall(text):
        s = m.replace(",", "").replace("−", "-")
        try:
            out.append(float(s))
        except ValueError:
            pass
    return out


LABELS = re.compile(r"\b30 (days|días)\b|\b2019\b")


def x_weighted_length(text: str) -> int:
    """X counts most Latin characters as 1 and everything else (e.g. U+2212 minus, emoji) as 2
    (twitter-text weighted ranges 0-4351, 8192-8205, 8208-8223, 8242-8247 weigh 1)."""
    n = 0
    for ch in text:
        c = ord(ch)
        n += 1 if (c <= 4351 or 8192 <= c <= 8205 or 8208 <= c <= 8223 or 8242 <= c <= 8247) else 2
    return n


def factcheck(text: str, alt: str, series: list[tuple[date, float]]) -> list[str]:
    """Independent re-derivation. Returns a list of problems; empty means publishable."""
    problems = []
    wl = x_weighted_length(text)
    if wl > config.POST_MAX_CHARS:
        problems.append(f"post is {wl} weighted characters (limit {config.POST_MAX_CHARS})")
    if not config.ALLOW_URLS_IN_POST and re.search(r"https?://|www\.", text):
        problems.append("post contains a URL ($0.20 instead of $0.015; sources belong in the image)")
    last_d, last_v = series[-1]
    by_day = dict(series)
    allowed = {round(last_v, 1), config.MIN_POWER_POOL_FT, 3525.0, float(last_d.day), float(last_d.year)}
    prev = by_day.get(last_d - timedelta(days=1))
    if prev is not None:
        allowed.add(round(last_v - prev, 1))
    allowed.add(round(last_v - config.MIN_POWER_POOL_FT, 1))
    allowed.add(round(abs(last_v - 3525.0), 1))
    for back in (29, 30, 31, 32):
        v = by_day.get(last_d - timedelta(days=back))
        if v is not None:
            allowed.add(round(last_v - v, 1))
    for back in range(362, 369):
        v = by_day.get(last_d - timedelta(days=back))
        if v is not None:
            allowed.add(round(last_v - v, 1))
            allowed.add(round(v, 1))
    for n in _nums(LABELS.sub(" ", text)):
        if not any(abs(abs(n) - abs(a)) < 0.051 for a in allowed):
            problems.append(f"number {n} in the post does not trace to the data")
    if config.MONTHS_EN[last_d.month - 1] not in text or config.MONTHS_ES[last_d.month - 1] not in text:
        problems.append("post does not name the data date in both languages")
    if f"{last_v:,.1f}" not in text:
        problems.append(f"post does not state today's value {last_v:,.1f}")
    if f"{last_v:,.1f}" not in alt:
        problems.append("alt text does not state today's value")
    return problems
