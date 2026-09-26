"""The daily chart: 1600x900 PNG. The filled band is the water between the lake and the minimum
power pool, so the post's main number (feet of buffer) is also the picture."""
from __future__ import annotations

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
SANS, MONO = "IBM Plex Sans Condensed", "IBM Plex Mono Medium"

BG, INK, MUTED, WATER, AMBER, LINE = "#0b1a24", "#eaf2f5", "#8fa6b2", "#62d2e8", "#f2a541", "#9fb3bf"


def _fmt(x):
    return f"{x:,.1f}"


def render_powell(series, m: dict, out: Path, sample: bool = False) -> Path:
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
            color=INK, fontsize=8, family=MONO, va="center")
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

    months_en, months_es = config.MONTHS_EN, config.MONTHS_ES
    fig.text(0.07, 0.905, config.ACCOUNT_NAME.upper(), color=MUTED, fontsize=7, family=SANS, weight=600)
    fig.text(0.07, 0.765, f"{_fmt(m['ft'])} ft", color=INK, fontsize=30, family=SANS, weight=700)
    fig.text(0.07, 0.705, f"Lake Powell · {months_en[last.month-1]} {last.day}, {last.year}     Lago Powell · {last.day} {months_es[last.month-1]} {last.year}",
             color=MUTED, fontsize=7.5, family=SANS)
    chips = [f"{_fmt(m['above_min_power_pool'])} ft above the minimum power pool"]
    sign = lambda x: f"{x:+.1f}".replace("-", "\u2212")
    if m["change_1d"] is not None:
        chips.append("no change in a day" if m["change_1d"] == 0 else f"{sign(m['change_1d'])} ft in a day")
    if m["change_yoy"] is not None:
        chips.append(f"{sign(m['change_yoy'])} ft vs a year ago")
    for i, c in enumerate(chips):
        fig.text(0.93, 0.84 - i * 0.07, c, color=INK if i == 0 else MUTED, fontsize=8 if i == 0 else 7.2,
                 family=SANS, weight=600 if i == 0 else 400, ha="right")
    fig.text(0.07, 0.045, "Data: USGS site 09379900 daily values (provisional). Thresholds: Bureau of Reclamation. Not an official product.",
             color=MUTED, fontsize=5.8, family=SANS)
    if sample:
        fig.text(0.93, 0.905, "SAMPLE · DRY RUN · NOT POSTED", color=AMBER, fontsize=6.5, family=MONO, ha="right")
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, facecolor=BG, dpi=200)
    plt.close(fig)
    return out


def render_grid_mock(hours: list[dict], label: str, out: Path) -> Path:
    """Design mock for the lead concept (Arizona Grid Daily): stacked generation by fuel over one day.
    Only ever called with labelled synthetic data in this sandbox."""
    order = [("solar", "#f7c948"), ("gas", "#e07a5f"), ("nuclear", "#b8a1ff"), ("coal", "#8d8d8d"), ("hydro", "#62d2e8"), ("wind", "#9be3b9"), ("other", "#5a6b75")]
    fig = plt.figure(figsize=(8, 4.5), dpi=200, facecolor=BG)
    ax = fig.add_axes([0.07, 0.13, 0.80, 0.52], facecolor=BG)
    x = list(range(len(hours)))
    base = [0.0] * len(hours)
    for k, col in order:
        vals = [h.get(k, 0.0) for h in hours]
        top = [b + v for b, v in zip(base, vals)]
        ax.fill_between(x, base, top, color=col, alpha=0.9, linewidth=0, label=k)
        base = top
    ax.plot(x, [h.get("demand", 0) for h in hours], color=INK, lw=1.2, ls=(0, (3, 2)))
    for s in ("top", "left", "right"):
        ax.spines[s].set_visible(False)
    ax.tick_params(colors=MUTED, labelsize=6.5, length=0)
    ax.set_xticks([0, 6, 12, 18, 23], ["12 a", "6 a", "noon", "6 p", "11 p"])
    fig.text(0.07, 0.9, "ARIZONA GRID DAILY · DESIGN MOCK", color=MUTED, fontsize=7, family=SANS, weight=600)
    fig.text(0.07, 0.77, label, color=INK, fontsize=18, family=SANS, weight=700)
    fig.text(0.93, 0.9, "SYNTHETIC TEST DATA · NOT REAL", color=AMBER, fontsize=7, family=MONO, ha="right")
    fig.text(0.07, 0.045, "Real version: EIA-930 hourly net generation by fuel for APS/SRP/TEP. This image uses made-up numbers to show the layout only.",
             color=MUTED, fontsize=5.8, family=SANS)
    fig.savefig(out, facecolor=BG, dpi=200)
    plt.close(fig)
    return out
