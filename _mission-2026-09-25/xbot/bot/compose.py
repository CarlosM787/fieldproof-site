"""Post text and alt text, English then Spanish in one post. Plain, calm, no alarm words."""
from __future__ import annotations

from . import checks, config


def _d_en(d):
    return f"{config.MONTHS_EN[d.month - 1]} {d.day}"


def _d_es(d):
    return f"{d.day} {config.MONTHS_ES[d.month - 1]}"


def _ft(x):
    return f"{x:,.1f}"


def _chg(x):
    # ASCII signs on purpose: X counts U+2212 (minus) as two characters
    return ("+" if x > 0 else "-") + f"{abs(x):.1f}"


def compose(m: dict) -> tuple[str, str]:
    """Returns (post_text, alt_text). One rotating second fact keeps the daily post from repeating."""
    d = m["date"]
    line_en = f"Lake Powell, {_d_en(d)}: {_ft(m['ft'])} ft"
    line_es = f"Lago Powell, {_d_es(d)}: {_ft(m['ft'])} pies"
    if m["change_1d"] == 0:
        line_en += " (no change in a day)"
        line_es += " (sin cambio en un día)"
    elif m["change_1d"] is not None:
        line_en += f" ({_chg(m['change_1d'])} ft in a day)"
        line_es += f" ({_chg(m['change_1d'])} en un día)"
    line_en += f". {_ft(m['above_min_power_pool'])} ft above the 3,490 ft minimum power pool."
    line_es += f". {_ft(m['above_min_power_pool'])} pies sobre el mínimo para generar energía (3,490)."

    rot = d.toordinal() % 3
    extra_en = extra_es = ""
    if rot == 0 and m["change_yoy"] is not None:
        extra_en = f" A year ago: {_ft(m['year_ago_ft'])}."
        extra_es = f" Hace un año: {_ft(m['year_ago_ft'])}."
    elif rot == 1 and m["change_30d"] is not None:
        extra_en = f" 30 days: {_chg(m['change_30d'])} ft."
        extra_es = f" 30 días: {_chg(m['change_30d'])}."
    elif rot == 2:
        gap = m["vs_3525"]
        extra_en = f" {_ft(abs(gap))} ft {'below' if gap < 0 else 'above'} the 3,525 ft target."
        extra_es = f" {_ft(abs(gap))} {'bajo' if gap < 0 else 'sobre'} la meta de 3,525."
    text = line_en + extra_en + "\n\n" + line_es + extra_es
    if checks.x_weighted_length(text) > config.POST_MAX_CHARS:  # drop the rotating fact rather than truncate
        text = line_en + "\n\n" + line_es

    alt = (
        f"Line chart of Lake Powell's daily water level for the last 90 days, ending at {_ft(m['ft'])} ft on "
        f"{_d_en(d)}, {d.year}, {_ft(m['above_min_power_pool'])} ft above a marked line at the 3,490 ft minimum power pool. "
        f"A second marked line shows the 3,525 ft protection target. A faint line shows the same days one year earlier"
        + (f", when the lake was near {_ft(m['year_ago_ft'])} ft." if m["year_ago_ft"] else ".")
        + f" / Gráfica del nivel diario del lago Powell en los últimos 90 días; termina en {_ft(m['ft'])} pies el {_d_es(d)} de {d.year}."
    )
    return text, alt
