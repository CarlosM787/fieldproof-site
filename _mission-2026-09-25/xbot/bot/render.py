"""The daily chart: 1600x900 PNG. The filled band is the water between the lake and the minimum
power pool, so the post's main number (feet of buffer) is also the picture."""
from __future__ import annotations

import textwrap
from datetime import date, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402

from . import config  # noqa: E402

for f in config.FONTS.glob("*.ttf"):
    font_manager.fontManager.addfont(str(f))
# family names as the bundled files register them (the SemiBold cut is its own family; Mono ships only 500)
SANS, SEMI, MONO = "IBM Plex Sans Condensed", "IBM Plex Sans Condensed SemiBold", "IBM Plex Mono Medium"

BG, INK, MUTED, WATER, AMBER, LINE = "#0b1a24", "#eaf2f5", "#8fa6b2", "#62d2e8", "#f2a541", "#9fb3bf"

SAMPLE_STAMP = "SAMPLE · DRY RUN · NOT POSTED"
USGS_SOURCE_LINE = ("Data: USGS site 09379900 daily values (provisional, subject to revision). "
                    "Thresholds: Bureau of Reclamation. Not an official product.")


def _fmt(x):
    return f"{x:,.1f}"


def _source(fig, line: str):
    """The provenance line at the foot of the image, wrapped so a long one never runs off the edge."""
    fig.text(0.07, 0.025, textwrap.fill(line, 175), color=MUTED, fontsize=5.8, family=SANS, va="bottom", linespacing=1.3)


def _stamp(sample) -> str | None:
    return (SAMPLE_STAMP if sample is True else sample) or None


def render_powell(series, m: dict, out: Path, sample=False, weekly: bool = False,
                  source_line: str = USGS_SOURCE_LINE) -> Path:
    """`sample` stamps the image (True for the default stamp, or the stamp text). `weekly` shades
    the seven days of the weekly segment and swaps the headline chips; `m` is then weekly_metrics()."""
    last = m["date"]
    start = last - timedelta(days=89)
    cur = [(d, v) for d, v in series if start <= d <= last]
    by = dict(series)
    ghost = []
    for d, _ in cur:
        try:
            dy = d.replace(year=d.year - 1)
        except ValueError:
            dy = d - timedelta(days=365)
        if dy in by:
            ghost.append((d, by[dy]))

    fig = plt.figure(figsize=(8, 4.5), dpi=200, facecolor=BG)
    ax = fig.add_axes([0.07, 0.13, 0.80, 0.50], facecolor=BG)
    xs, ys = [d for d, _ in cur], [v for _, v in cur]
    lo = min(config.MIN_POWER_POOL_FT - 6, min(ys) - 4)
    hi = max(max(ys), max([v for _, v in ghost] or [ys[-1]]), 3525) + 6
    ax.set_ylim(lo, hi)
    ax.set_xlim(start, last + timedelta(days=12))
    if weekly:
        ax.axvspan(m["week_start"] - timedelta(days=0.5), last + timedelta(days=0.5), color=INK, alpha=0.07, lw=0)
    ax.fill_between(xs, [config.MIN_POWER_POOL_FT] * len(xs), ys, color=WATER, alpha=0.16, linewidth=0)
    if ghost:
        ax.plot([d for d, _ in ghost], [v for _, v in ghost], color=WATER, alpha=0.38, lw=1.2, ls=(0, (3, 2.5)))
        gd, gv = ghost[-1]
        ax.text(gd + timedelta(days=1.5), gv, "a year ago", color=MUTED, fontsize=6.5, family=SANS, va="center")
    ax.plot(xs, ys, color=WATER, lw=2.0, solid_capstyle="round")
    ax.scatter([xs[-1]], [ys[-1]], s=22, color=WATER, zorder=5, edgecolor=BG, linewidth=1.2)
    ax.axhline(config.MIN_POWER_POOL_FT, color=AMBER, lw=1.4)
    ax.axhline(3525, color=LINE, lw=0.9, ls=(0, (1, 2)))
    ax.text(start + timedelta(days=1), config.MIN_POWER_POOL_FT + 0.8, "3,490 ft minimum power pool", color=AMBER,
            fontsize=6.3, family=SANS, ha="left", va="bottom")
    ax.text(last + timedelta(days=11.5), 3525.8, "3,525 ft protection target", color=LINE, fontsize=6.3,
            family=SANS, ha="right", va="bottom")
    # buffer bracket at the last point
    ax.annotate("", xy=(last + timedelta(days=3), config.MIN_POWER_POOL_FT), xytext=(last + timedelta(days=3), ys[-1]),
                arrowprops=dict(arrowstyle="<->", color=INK, lw=0.8, shrinkA=0, shrinkB=0))
    ax.text(last + timedelta(days=4), (ys[-1] + config.MIN_POWER_POOL_FT) / 2, f"{_fmt(m['above_min_power_pool'])} ft",
            color=INK, fontsize=8, family=MONO, weight=500, va="center")
    for s in ("top", "left", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color("#244052")
    ax.tick_params(colors=MUTED, labelsize=6.5, length=0)
    ax.yaxis.tick_right()
    firsts, y, mo = [], start.year, start.month
    while date(y, mo, 1) <= last:
        if date(y, mo, 1) >= start:
            firsts.append(date(y, mo, 1))
        y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
    ax.xaxis.set_major_locator(matplotlib.ticker.FixedLocator([mdates.date2num(t) for t in firsts]))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b"))
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.grid(axis="y", color="#16303f", lw=0.6)
    for lbl in ax.get_xticklabels() + ax.get_yticklabels():
        lbl.set_family(MONO)
        lbl.set_weight(500)

    months_en, months_es = config.MONTHS_EN, config.MONTHS_ES
    fig.text(0.07, 0.905, config.ACCOUNT_NAME.upper() + (" · WEEKLY" if weekly else ""), color=MUTED, fontsize=7,
             family=SEMI, weight=600)
    fig.text(0.07, 0.765, f"{_fmt(m['ft'])} ft", color=INK, fontsize=30, family=SANS, weight=700)
    when_en = f"{'Week to ' if weekly else ''}{months_en[last.month-1]} {last.day}, {last.year}"
    when_es = f"{'Semana al ' if weekly else ''}{last.day} {months_es[last.month-1]} {last.year}"
    fig.text(0.07, 0.705, f"Lake Powell · {when_en}     Lago Powell · {when_es}", color=MUTED, fontsize=7.5, family=SANS)
    chips = [f"{_fmt(m['above_min_power_pool'])} ft above the minimum power pool"]
    sign = lambda x: f"{x:+.1f}".replace("-", "−")
    if weekly:
        if m.get("change_7d") is not None:
            chips.append("no change in 7 days" if m["change_7d"] == 0 else f"{sign(m['change_7d'])} ft in 7 days")
        chips.append(f"week range {_fmt(m['week_low'])}–{_fmt(m['week_high'])} ft")
    else:
        if m["change_1d"] is not None:
            chips.append("no change in a day" if m["change_1d"] == 0 else f"{sign(m['change_1d'])} ft in a day")
        if m["change_yoy"] is not None:
            chips.append(f"{sign(m['change_yoy'])} ft vs a year ago")
    for i, c in enumerate(chips):
        fig.text(0.93, 0.84 - i * 0.07, c, color=INK if i == 0 else MUTED, fontsize=8 if i == 0 else 7.2,
                 family=SEMI if i == 0 else SANS, weight=600 if i == 0 else 400, ha="right")
    _source(fig, source_line)
    stamp = _stamp(sample)
    if stamp:
        fig.text(0.93, 0.905, stamp, color=AMBER, fontsize=6.5, family=MONO, weight=500, ha="right")
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, facecolor=BG, dpi=200)
    plt.close(fig)
    return out


GRID_COLORS = [("nuclear", "#b8a1ff"), ("coal", "#8d8d8d"), ("hydro", "#62d2e8"), ("wind", "#9be3b9"),
               ("solar", "#f7c948"), ("gas", "#e07a5f"), ("oil", "#c9803f"), ("other", "#5a6b75"),
               ("storage", "#4f9d8f")]


def render_grid(hours: list[dict], out: Path, *, header: str, title: str, subtitle: str, stamp: str,
                source_line: str) -> Path:
    """Arizona Grid Daily: one local day of generation by fuel, stacked, with demand as a dashed
    line. Storage below zero is charging. `hours` are the dicts from sources.parse_eia930_balance
    (blank values count as 0 here; checks.grid_day_issues decides whether a day is complete)."""
    fig = plt.figure(figsize=(8, 4.5), dpi=200, facecolor=BG)
    ax = fig.add_axes([0.07, 0.13, 0.72, 0.52], facecolor=BG)
    x = [h["hour"] for h in hours]
    base_pos, base_neg = [0.0] * len(hours), [0.0] * len(hours)
    for k, col in GRID_COLORS:
        vals = [h.get(k) or 0.0 for h in hours]
        if not any(vals):
            continue
        pos = [max(v, 0.0) for v in vals]
        neg = [min(v, 0.0) for v in vals]
        if any(pos):
            top = [b + v for b, v in zip(base_pos, pos)]
            ax.fill_between(x, base_pos, top, color=col, alpha=0.9, linewidth=0, step=None)
            base_pos = top
        if any(neg):
            bottom = [b + v for b, v in zip(base_neg, neg)]
            ax.fill_between(x, base_neg, bottom, color=col, alpha=0.55, linewidth=0, hatch="////", edgecolor=BG)
            base_neg = bottom
    ax.plot(x, [h.get("demand") or 0 for h in hours], color=INK, lw=1.2, ls=(0, (3, 2)))
    ax.axhline(0, color="#244052", lw=0.8)
    for s in ("top", "left", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_visible(False)
    ax.tick_params(colors=MUTED, labelsize=6.5, length=0)
    ax.set_xlim(1, 24)
    ax.set_xticks([1, 6, 12, 18, 24], ["1 a", "6 a", "noon", "6 p", "midnight"])
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.grid(axis="y", color="#16303f", lw=0.6)
    for lbl in ax.get_xticklabels() + ax.get_yticklabels():
        lbl.set_family(MONO)
        lbl.set_weight(500)
    used = [(k, c) for k, c in GRID_COLORS if any(h.get(k) for h in hours)]
    for i, (k, col) in enumerate(reversed(used)):  # swatches are drawn: the bundled fonts have no square glyph
        fig.add_artist(matplotlib.patches.Rectangle((0.815, 0.622 - i * 0.045), 0.012, 0.02, color=col,
                                                    transform=fig.transFigure))
        fig.text(0.835, 0.62 - i * 0.045, k + (" (below 0: charging)" if k == "storage" else ""), color=MUTED,
                 fontsize=6.5, family=SANS)
    fig.text(0.815, 0.62 - len(used) * 0.045, "- - demand", color=INK, fontsize=6.5, family=SANS)
    fig.text(0.07, 0.9, header, color=MUTED, fontsize=7, family=SEMI, weight=600)
    fig.text(0.07, 0.77, title, color=INK, fontsize=18, family=SANS, weight=700)
    fig.text(0.07, 0.715, subtitle, color=MUTED, fontsize=7.5, family=SANS)
    fig.text(0.93, 0.9, stamp, color=AMBER, fontsize=6.5, family=MONO, weight=500, ha="right")
    _source(fig, source_line)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, facecolor=BG, dpi=200)
    plt.close(fig)
    return out


def render_grid_mock(hours: list[dict], label: str, out: Path) -> Path:
    """Design mock for the lead concept (Arizona Grid Daily). Only ever called with labelled
    synthetic data; `hours` use the keys above plus `demand`, in hour order."""
    hours = [{**h, "hour": i + 1} for i, h in enumerate(hours)]
    return render_grid(hours, out, header="ARIZONA GRID DAILY · DESIGN MOCK", title=label, subtitle="",
                       stamp="SYNTHETIC TEST DATA · NOT REAL",
                       source_line="Real version: EIA-930 hourly net generation by fuel for APS/SRP/TEP. "
                                   "This image uses made-up numbers to show the layout only.")
