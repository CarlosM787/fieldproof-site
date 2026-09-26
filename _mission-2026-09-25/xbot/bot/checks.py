"""Validation, metrics and the independent fact check.

validate()          - is the data fit to publish?
metrics()           - the numbers a daily post may use
weekly_metrics()    - the numbers a weekly post may use
factcheck()         - re-derives every number from the raw series, separately from metrics(), and
factcheck_weekly()    compares it with the text that is about to be posted. Any mismatch blocks.
grid_day_issues()   - completeness gate for one day of EIA-930 hours (lead concept)
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from . import config, sources


def validate(series: list[tuple[date, float]], as_of: date) -> list[str]:
    issues = []
    if not series:
        return ["no data"]
    if as_of > config.THRESHOLD_LABELS_VALID_THROUGH:
        issues.append(f"review: threshold wording is only confirmed through {config.THRESHOLD_LABELS_VALID_THROUGH} "
                      "(re-check the 3,490/3,525 ft labels, then move THRESHOLD_LABELS_VALID_THROUGH)")
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


def validate_week(series: list[tuple[date, float]]) -> list[str]:
    last_d = series[-1][0]
    n = sum(1 for d, _ in series if last_d - timedelta(days=6) <= d <= last_d)
    if n < config.LIMITS["min_days_in_week"]:
        return [f"only {n} of the 7 days in the week to {last_d} present"]
    return []


def _value_near(series, target: date, tol_days: int = 3):
    best = None
    for d, v in series:
        gap = abs((d - target).days)
        if gap <= tol_days and (best is None or gap < best[0]):
            best = (gap, d, v)
    return (best[1], best[2]) if best else (None, None)


def _year_ago(d: date) -> date:
    try:
        return d.replace(year=d.year - 1)
    except ValueError:  # Feb 29
        return d - timedelta(days=365)


def metrics(series: list[tuple[date, float]]) -> dict:
    last_d, last_v = series[-1]
    prev = dict(series).get(last_d - timedelta(days=1))
    d30, v30 = _value_near(series, last_d - timedelta(days=30), 2)
    dy, vy = _value_near(series, _year_ago(last_d), 3)
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


def weekly_metrics(series: list[tuple[date, float]]) -> dict:
    """The week is the seven days ending on the newest value; the change is against the value
    seven days earlier (the previous week's last day)."""
    m = metrics(series)
    last_d, last_v = series[-1]
    week = [v for d, v in series if last_d - timedelta(days=6) <= d <= last_d]
    before = dict(series).get(last_d - timedelta(days=7))
    m.update({
        "week_start": last_d - timedelta(days=6),
        "week_low": round(min(week), 1),
        "week_high": round(max(week), 1),
        "change_7d": round(last_v - before, 1) if before is not None else None,
    })
    return m


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


LABELS = re.compile(r"\b(7|30) (days|días)\b|\b2019\b")


def x_weighted_length(text: str) -> int:
    """X counts most Latin characters as 1 and everything else (e.g. U+2212 minus, emoji) as 2
    (twitter-text weighted ranges 0-4351, 8192-8205, 8208-8223, 8242-8247 weigh 1)."""
    n = 0
    for ch in text:
        c = ord(ch)
        n += 1 if (c <= 4351 or 8192 <= c <= 8205 or 8208 <= c <= 8223 or 8242 <= c <= 8247) else 2
    return n


def _common_problems(text: str, alt: str, last_d: date, last_v: float) -> list[str]:
    """Checks every post shares: length, links, dates, today's value, and the alt text."""
    problems = []
    wl = x_weighted_length(text)
    if wl > config.POST_MAX_CHARS:
        problems.append(f"post is {wl} weighted characters (limit {config.POST_MAX_CHARS})")
    if not config.ALLOW_URLS_IN_POST and re.search(r"https?://|www\.", text):
        problems.append("post contains a URL ($0.20 instead of $0.015; sources belong in the image)")
    if config.MONTHS_EN[last_d.month - 1] not in text or config.MONTHS_ES[last_d.month - 1] not in text:
        problems.append("post does not name the data date in both languages")
    if f"{last_v:,.1f}" not in text:
        problems.append(f"post does not state today's value {last_v:,.1f}")
    if f"{last_v:,.1f}" not in alt:
        problems.append("alt text does not state today's value")
    if config.PROVISIONAL_EN not in alt or config.PROVISIONAL_ES not in alt:
        problems.append("alt text lacks the provisional-data note (EN and ES)")
    if len(alt) > config.ALT_MAX_CHARS:
        problems.append(f"alt text is {len(alt)} characters (X limit {config.ALT_MAX_CHARS})")
    return problems


def _untraced(text: str, allowed: set) -> list[str]:
    return [f"number {n} in the post does not trace to the data"
            for n in _nums(LABELS.sub(" ", text))
            if not any(abs(abs(n) - abs(a)) < 0.051 for a in allowed)]


def _base_allowed(series) -> set:
    """Numbers any Powell post may use: today's value, the two thresholds and the distances to
    them, the date, and the value one year earlier (with the change since then)."""
    last_d, last_v = series[-1]
    by_day = dict(series)
    allowed = {round(last_v, 1), config.MIN_POWER_POOL_FT, 3525.0, float(last_d.day), float(last_d.year),
               round(last_v - config.MIN_POWER_POOL_FT, 1), round(abs(last_v - 3525.0), 1)}
    for back in range(362, 369):
        v = by_day.get(last_d - timedelta(days=back))
        if v is not None:
            allowed.add(round(last_v - v, 1))
            allowed.add(round(v, 1))
    return allowed


def factcheck(text: str, alt: str, series: list[tuple[date, float]]) -> list[str]:
    """Independent re-derivation for the daily post. Returns problems; empty means publishable."""
    last_d, last_v = series[-1]
    by_day = dict(series)
    allowed = _base_allowed(series)
    prev = by_day.get(last_d - timedelta(days=1))
    if prev is not None:
        allowed.add(round(last_v - prev, 1))
    for back in (29, 30, 31, 32):
        v = by_day.get(last_d - timedelta(days=back))
        if v is not None:
            allowed.add(round(last_v - v, 1))
    return _common_problems(text, alt, last_d, last_v) + _untraced(text, allowed)


def factcheck_weekly(text: str, alt: str, series: list[tuple[date, float]]) -> list[str]:
    """Independent re-derivation for the weekly post (the week = the 7 days ending on the newest
    value). Returns problems; empty means publishable."""
    last_d, last_v = series[-1]
    by_day = dict(series)
    allowed = _base_allowed(series)
    for back in (6, 7, 8):
        v = by_day.get(last_d - timedelta(days=back))
        if v is not None:
            allowed.add(round(last_v - v, 1))
    week = [v for d, v in series if last_d - timedelta(days=6) <= d <= last_d]
    allowed |= {round(max(week), 1), round(min(week), 1)}
    return _common_problems(text, alt, last_d, last_v) + _untraced(text, allowed)


def grid_day_issues(hours: list[dict]) -> list[str]:
    """Completeness gate for one local day of EIA-930 hours (lead concept): 24 distinct hours, each
    with demand, net generation and at least one fuel; no negative demand; the fuel mix adds up to
    the reported net generation. EIA-930 values keep being revised for days (AUDIT_P2.md), so
    passing this gate means complete, not final."""
    issues = []
    got = sorted({h["hour"] for h in hours})
    if got != list(range(1, 25)):
        issues.append(f"{len(got)} of 24 hours present")
    for h in hours:
        if h["demand"] is None or h["net_generation"] is None:
            issues.append(f"hour {h['hour']}: demand or net generation is blank")
            continue
        if h["demand"] < 0:
            issues.append(f"hour {h['hour']}: negative demand {h['demand']}")
        fuels = [h[f] for f in sources.GRID_FUELS if h.get(f) is not None]
        if not fuels:
            issues.append(f"hour {h['hour']}: no generation by fuel")
        elif abs(sum(fuels) - h["net_generation"]) > max(25.0, 0.02 * abs(h["net_generation"])):
            issues.append(f"hour {h['hour']}: fuels add to {sum(fuels):.0f} MW, net generation is {h['net_generation']:.0f} MW")
    return issues
