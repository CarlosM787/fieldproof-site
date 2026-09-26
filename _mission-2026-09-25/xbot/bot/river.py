"""Weekly river segment: Lake Powell and Lake Mead in one post, once a week.

The week is the seven days ending on the newest day BOTH series have. For each lake the post gives
the level on that day, the change across the week (first to last day of the window, named in the alt
text) and the feet above that dam's minimum power pool (config.RIVER_LAKES, REPORTED thresholds).
  metrics()    the numbers, from the two daily series
  compose()    English then Spanish, <= 280 X-weighted characters (details are dropped, never cut)
  factcheck()  recomputes from the raw series with its own code and checks every number and label
  render()     1600x900 PNG: one panel per lake, the week's daily levels over the shaded water that
               stands above the minimum power pool (the post's main number is the picture)
Sources: Powell from USGS 09379900; Mead from Reclamation's hydrodata (Lake Mead 921, parameter 49),
parsed by sources.parse_usbr_csv. In this sandbox Mead comes from a third-party mirror (the image
and alt text say so); never a production source.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from . import approval, checks, config, render  # noqa: E402

LAKES = ("powell", "mead")
PLAUSIBLE = {"powell": (3300.0, 3711.0), "mead": (895.0, 1230.0)}


def parse_lakelevelnow_mead(text: str) -> list[tuple[date, float]]:
    """THIRD-PARTY MIRROR (sandbox only): theluckystrike/lakelevelnow levels.json as cached in the
    research samples: {"lake-mead": {"series": [{"t": "2026-08-30T23:00:00", "v": 1038.87}, ...]}}."""
    d = json.loads(text)
    return sorted((date.fromisoformat(p["t"][:10]), float(p["v"])) for p in d["lake-mead"]["series"])


def _common_end(series: dict) -> date:
    return min(s[-1][0] for s in series.values())


def validate(series: dict, as_of: date) -> list[str]:
    issues = []
    if as_of > config.THRESHOLD_LABELS_VALID_THROUGH:
        issues.append(f"review: threshold wording is only confirmed through {config.THRESHOLD_LABELS_VALID_THROUGH}")
    end = _common_end(series)
    for lake, s in series.items():
        lo, hi = PLAUSIBLE[lake]
        week = [(d, v) for d, v in s if end - timedelta(days=6) <= d <= end]
        if len(week) < config.LIMITS["min_days_in_week"]:
            issues.append(f"{lake}: only {len(week)} of the 7 days to {end}")
        for d, v in week:
            if not lo <= v <= hi:
                issues.append(f"{lake}: {v} ft on {d} is out of range")
        if (as_of - s[-1][0]).days > config.LIMITS["max_age_days"]:
            issues.append(f"stale: {lake} newest value is {s[-1][0]}")
    return issues


def metrics(series: dict) -> dict:
    end = _common_end(series)
    out = {"end": end, "start": end - timedelta(days=6), "lakes": {}}
    for lake in LAKES:
        week = [(d, v) for d, v in series[lake] if out["start"] <= d <= end]
        first_d, first_v = week[0]
        level = dict(week)[end]
        pool = config.RIVER_LAKES[lake]["min_power_pool_ft"]
        out["lakes"][lake] = {"level_ft": round(level, 1), "first_day": first_d, "first_ft": round(first_v, 1),
                              "change_ft": round(level - first_v, 1), "above_pool_ft": round(level - pool, 1),
                              "pool_ft": pool, "week_low": round(min(v for _, v in week), 1), "week_high": round(max(v for _, v in week), 1),
                              "days": len(week)}
    return out


def _d_en(d):
    return f"{config.MONTHS_EN[d.month - 1]} {d.day}"


def _d_es(d):
    return f"{d.day} {config.MONTHS_ES[d.month - 1]}"


def _chg(x):
    return "no change" if x == 0 else ("+" if x > 0 else "-") + f"{abs(x):.1f} ft"


def _chg_es(x):
    return "sin cambio" if x == 0 else ("+" if x > 0 else "-") + f"{abs(x):.1f}"


def compose(m: dict, credits=("USGS; Reclamation", "USGS; Reclamation")) -> tuple[str, str]:
    P, M = m["lakes"]["powell"], m["lakes"]["mead"]
    e, s = m["end"], m["start"]
    variants = []
    for names, change in ((("Lake Powell", "Lake Mead", "Lago Powell", "Lago Mead"), "since"),
                          (("Powell", "Mead", "Powell", "Mead"), "since"), (("Lake Powell", "Lake Mead", "Lago Powell", "Lago Mead"), None)):
        pe, me, ps, ms = names
        pc = f" ({_chg(P['change_ft'])} since {_d_en(s)})" if change else ""
        mc = f" ({_chg(M['change_ft'])})" if change else ""
        pc_es = f" ({_chg_es(P['change_ft'])} desde el {_d_es(s)})" if change else ""
        mc_es = f" ({_chg_es(M['change_ft'])})" if change else ""
        en = (f"Colorado River, week to {_d_en(e)}. {pe}: {P['level_ft']:,.1f} ft{pc}, {P['above_pool_ft']:,.1f} ft above "
              f"its minimum power pool. {me}: {M['level_ft']:,.1f} ft{mc}, {M['above_pool_ft']:,.1f} ft above.")
        es = (f"Río Colorado, semana al {_d_es(e)}. {ps}: {P['level_ft']:,.1f} pies{pc_es}, {P['above_pool_ft']:,.1f} sobre su "
              f"mínimo para generar energía. {ms}: {M['level_ft']:,.1f} pies{mc_es}, {M['above_pool_ft']:,.1f} sobre el suyo.")
        variants.append(en + "\n\n" + es)
    text = next((t for t in variants if checks.x_weighted_length(t) <= config.POST_MAX_CHARS), variants[-1])
    alt = (f"Two small line charts, Lake Powell and Lake Mead, one point per day from {_d_en(s)} to {_d_en(e)}, {e.year}, each over a shaded band "
           f"for the water above that dam's minimum power pool. Lake Powell ended at {P['level_ft']:,.1f} ft, {_chg(P['change_ft'])} since {_d_en(s)}, "
           f"{P['above_pool_ft']:,.1f} ft above its 3,490 ft minimum power pool (a dashed line marks the 3,525 ft protection target). "
           f"Lake Mead ended at {M['level_ft']:,.1f} ft, {_chg(M['change_ft'])} since {_d_en(s)}, {M['above_pool_ft']:,.1f} ft above its "
           f"{M['pool_ft']:,.0f} ft minimum power pool. Data: {credits[0]}. {config.PROVISIONAL_EN}"
           f" / Dos gráficas, lago Powell y lago Mead, del {_d_es(s)} al {_d_es(e)} de {e.year}: Powell {P['level_ft']:,.1f} pies, "
           f"{P['above_pool_ft']:,.1f} sobre su mínimo de 3,490; Mead {M['level_ft']:,.1f} pies, {M['above_pool_ft']:,.1f} sobre su mínimo de "
           f"{M['pool_ft']:,.0f}. Datos: {credits[1]}. {config.PROVISIONAL_ES}")
    return text, alt


def factcheck(text: str, alt: str, series: dict) -> list[str]:
    """Own recomputation: the common last day, each lake's week, level, change and buffer."""
    end = min(s[-1][0] for s in series.values())
    start = end - timedelta(days=6)
    problems, allowed = [], {float(end.day), float(end.year), float(start.day), 3490.0, 3525.0}
    want = {}
    for lake in LAKES:
        by = {d: v for d, v in series[lake] if start <= d <= end}
        first = by[min(by)]
        pool = config.RIVER_LAKES[lake]["min_power_pool_ft"]
        vals = {"level": round(by[end], 1), "change": round(by[end] - first, 1), "above": round(by[end] - pool, 1)}
        want[lake] = vals
        allowed |= {abs(v) for v in vals.values()} | {pool}
    wl = checks.x_weighted_length(text)
    if wl > config.POST_MAX_CHARS:
        problems.append(f"post is {wl} weighted characters (limit {config.POST_MAX_CHARS})")
    if not config.ALLOW_URLS_IN_POST and re.search(r"https?://|www\.", text):
        problems.append("post contains a URL")
    if _d_en(end) not in text or _d_es(end) not in text:
        problems.append("post does not name the week's last day in both languages")
    if config.PROVISIONAL_EN not in alt or config.PROVISIONAL_ES not in alt:
        problems.append("alt text lacks the provisional-data note (EN and ES)")
    if len(alt) > config.ALT_MAX_CHARS:
        problems.append(f"alt text is {len(alt)} characters (X limit {config.ALT_MAX_CHARS})")
    for lake, word in (("powell", "Powell"), ("mead", "Mead")):
        for s in (text, alt):
            name = word
            mm = re.search(r"(?:Lake |Lago |lago )?" + name + r"(?: ended at)?:? (\d[\d,]*\.\d)", s)
            if mm and float(mm.group(1).replace(",", "")) != want[lake]["level"]:
                problems.append(f"{name}: {mm.group(1)} but the data say {want[lake]['level']:,.1f}")
            if not mm and s is text:
                problems.append(f"{name} level missing from the post")
        if f"{want[lake]['above']:,.1f}" not in text:
            problems.append(f"{lake}: feet above the minimum power pool ({want[lake]['above']:,.1f}) missing from the post")
    for n in checks._nums(text):
        if not any(abs(abs(n) - a) < 0.051 for a in allowed):
            problems.append(f"number {n:g} in the post does not trace to the data")
    return problems


def render_week(series: dict, m: dict, out: Path, *, stamp: str = "", source_line: str = "") -> Path:
    BG, INK, MUTED, WATER, AMBER, LINE = render.BG, render.INK, render.MUTED, render.WATER, render.AMBER, render.LINE
    fig = plt.figure(figsize=(8, 4.5), dpi=200, facecolor=BG)
    fig.text(0.07, 0.905, "COLORADO RIVER · WEEKLY", color=MUTED, fontsize=7, family=render.SEMI, weight=600)
    if stamp:
        fig.text(0.93, 0.905, stamp, color=AMBER, fontsize=6.5, family=render.MONO, weight=500, ha="right")
    fig.text(0.07, 0.80, f"Week to {_d_en(m['end'])}, {m['end'].year}", color=INK, fontsize=16, family=render.SANS, weight=700)
    fig.text(0.07, 0.745, f"Semana al {_d_es(m['end'])} {m['end'].year} · feet of water above each dam's minimum power pool",
             color=MUTED, fontsize=7.5, family=render.SANS)
    for k, lake in enumerate(LAKES):
        L, cfg = m["lakes"][lake], config.RIVER_LAKES[lake]
        week = [(d, v) for d, v in series[lake] if m["start"] <= d <= m["end"]]
        ax = fig.add_axes([0.07 + k * 0.45, 0.14, 0.36, 0.40], facecolor=BG)
        xs, ys = [d for d, _ in week], [v for _, v in week]
        pool = cfg["min_power_pool_ft"]
        top = max(ys + ([3525.0] if lake == "powell" else [])) + 6
        ax.set_ylim(pool - 6, top)
        ax.fill_between(xs, [pool] * len(xs), ys, color=WATER, alpha=0.16, linewidth=0)
        ax.plot(xs, ys, color=WATER, lw=2.0, marker="o", ms=2.5)
        ax.axhline(pool, color=AMBER, lw=1.4)
        ax.text(xs[0], pool + (top - pool) * 0.03, f"{pool:,.0f} ft minimum power pool", color=AMBER, fontsize=6, family=render.SANS, va="bottom")
        if lake == "powell":
            ax.axhline(3525, color=LINE, lw=0.9, ls=(0, (1, 2)))
            ax.text(xs[-1], 3525.8, "3,525 ft protection target", color=LINE, fontsize=6, family=render.SANS, ha="right", va="bottom")
        ax.annotate("", xy=(xs[-1], pool), xytext=(xs[-1], ys[-1]), arrowprops=dict(arrowstyle="<->", color=INK, lw=0.8, shrinkA=0, shrinkB=0))
        ax.text(xs[-1] - timedelta(hours=18), (ys[-1] + pool) / 2, f"{L['above_pool_ft']:,.1f} ft", color=INK, fontsize=8, family=render.MONO,
                weight=500, va="center", ha="right")
        for s_ in ("top", "right"):
            ax.spines[s_].set_visible(False)
        ax.spines["left"].set_color("#244052")
        ax.spines["bottom"].set_color("#244052")
        ax.tick_params(colors=MUTED, labelsize=6, length=0)
        ax.set_xticks(xs[::2], [_d_en(d) for d in xs[::2]])
        ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
        ax.grid(axis="y", color="#16303f", lw=0.6)
        for lbl in ax.get_xticklabels() + ax.get_yticklabels():
            lbl.set_family(render.MONO)
            lbl.set_weight(500)
        fig.text(0.07 + k * 0.45, 0.645, f"{cfg['en']}  {L['level_ft']:,.1f} ft", color=INK, fontsize=11, family=render.SEMI, weight=600)
        fig.text(0.07 + k * 0.45, 0.595, f"{_chg(L['change_ft'])} since {_d_en(m['start'])} · {L['above_pool_ft']:,.1f} ft above {pool:,.0f}",
                 color=MUTED, fontsize=7, family=render.SANS)
    render._source(fig, source_line)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, facecolor=BG, dpi=200)
    plt.close(fig)
    return out


def make_post(series: dict, as_of: date, run_dir: Path, *, stamp: str | None = None, source_line: str = "",
              credits=("USGS; Reclamation", "USGS; Reclamation"), source_label: str = ""):
    issues = validate(series, as_of)
    if issues:
        stale = any(i.startswith("stale") for i in issues)
        return (3 if stale else 4), None, {"event": "skip" if stale else "invalid", "issues": issues}
    m = metrics(series)
    text, alt = compose(m, credits)
    problems = factcheck(text, alt, series)
    if problems:
        return 5, None, {"event": "factcheck-failed", "problems": problems, "text": text}
    kind = config.KINDS["river-weekly"]
    img = render_week(series, m, Path(run_dir) / f"{kind}-{m['end']}.png", stamp=stamp or "", source_line=source_line)
    bundle = {"kind": kind, "as_of": as_of, "data_date": m["end"], "text": text, "alt": alt, "image": img.name,
              "source": source_label, "credit": credits[0],
              "metrics": {"start": str(m["start"]), "end": str(m["end"]), "lakes": {k: {kk: str(vv) if isinstance(vv, date) else vv for kk, vv in v.items()}
                                                                                   for k, v in m["lakes"].items()}},
              "factcheck_problems": [], "chars": len(text), "x_weighted_chars": checks.x_weighted_length(text), "alt_chars": len(alt),
              "data_sha256": hashlib.sha256(json.dumps(series, default=str, sort_keys=True).encode()).hexdigest()[:16],
              "est_cost_usd": round(config.PRICE_POST + config.PRICE_ALT_TEXT, 3)}
    bundle["approval_code"] = approval.approval_code(bundle, img.read_bytes())
    return 0, bundle, {"event": "queued"}
