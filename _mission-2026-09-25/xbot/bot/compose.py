"""Post text and alt text, English then Spanish in one post. Plain, calm, no alarm words.

Every alt text names the source and says that recent values are provisional (config.PROVISIONAL_*).
`credit` is who the numbers come from; a replay from a third-party mirror says so.
"""
from __future__ import annotations

from . import checks, config

CREDIT_USGS = ("USGS", "USGS")


def _d_en(d):
    return f"{config.MONTHS_EN[d.month - 1]} {d.day}"


def _d_es(d):
    return f"{d.day} {config.MONTHS_ES[d.month - 1]}"


def _ft(x):
    return f"{x:,.1f}"


def _chg(x):
    # ASCII signs on purpose: X counts U+2212 (minus) as two characters
    return ("+" if x > 0 else "-") + f"{abs(x):.1f}"


def _source_note(credit) -> tuple[str, str]:
    en, es = credit
    return f" Data: {en}. {config.PROVISIONAL_EN}", f" Datos: {es}. {config.PROVISIONAL_ES}"


def _extra(m: dict) -> tuple[str | None, str, str]:
    """The rotating second fact of the daily post: (label, English, Spanish)."""
    rot = m["date"].toordinal() % 3
    if rot == 0 and m["change_yoy"] is not None:
        return "a year ago", f" A year ago: {_ft(m['year_ago_ft'])}.", f" Hace un año: {_ft(m['year_ago_ft'])}."
    if rot == 1 and m["change_30d"] is not None:
        return "30-day change", f" 30 days: {_chg(m['change_30d'])} ft.", f" 30 días: {_chg(m['change_30d'])}."
    if rot == 2:
        gap = m["vs_3525"]
        return ("3,525 ft target", f" {_ft(abs(gap))} ft {'below' if gap < 0 else 'above'} the 3,525 ft target.",
                f" {_ft(abs(gap))} {'bajo' if gap < 0 else 'sobre'} la meta de 3,525.")
    return None, "", ""


def rotating_fact(m: dict, text: str) -> str | None:
    """Which rotating fact the daily text carries (None if there was none or it was dropped)."""
    label, en, _ = _extra(m)
    return label if label and en in text else None


def compose(m: dict, credit=CREDIT_USGS) -> tuple[str, str]:
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

    _, extra_en, extra_es = _extra(m)
    text = line_en + extra_en + "\n\n" + line_es + extra_es
    if checks.x_weighted_length(text) > config.POST_MAX_CHARS:  # drop the rotating fact rather than truncate
        text = line_en + "\n\n" + line_es

    note_en, note_es = _source_note(credit)
    alt = (
        f"Line chart of Lake Powell's daily water level for the last 90 days, ending at {_ft(m['ft'])} ft on "
        f"{_d_en(d)}, {d.year}, {_ft(m['above_min_power_pool'])} ft above a marked line at the 3,490 ft minimum power pool. "
        f"A second marked line shows the 3,525 ft protection target. A faint line shows the same days one year earlier"
        + (f", when the lake was near {_ft(m['year_ago_ft'])} ft." if m["year_ago_ft"] else ".")
        + note_en
        + f" / Gráfica del nivel diario del lago Powell en los últimos 90 días; termina en {_ft(m['ft'])} pies el {_d_es(d)} de {d.year}."
        + note_es
    )
    return text, alt


def compose_weekly(m: dict, credit=CREDIT_USGS) -> tuple[str, str]:
    """The weekly segment: the level at the end of the seven days, the change over them, the buffer
    and (when it fits) the level a year earlier. The week's range is on the chart and in the alt
    text; in the post it would push the text past 280. Returns (post_text, alt_text)."""
    d, c, lo, hi = m["date"], m["change_7d"], m["week_low"], m["week_high"]
    line_en = f"Lake Powell, week to {_d_en(d)}: {_ft(m['ft'])} ft"
    line_es = f"Lago Powell, semana al {_d_es(d)}: {_ft(m['ft'])} pies"
    if c == 0:
        line_en += " (no change in 7 days)"
        line_es += " (sin cambio en 7 días)"
    elif c is not None:
        line_en += f" ({_chg(c)} ft in 7 days)"
        line_es += f" ({_chg(c)} en 7 días)"
    line_en += f". {_ft(m['above_min_power_pool'])} ft above the 3,490 ft minimum power pool."
    line_es += f". {_ft(m['above_min_power_pool'])} pies sobre el mínimo para generar energía (3,490)."
    text = line_en + "\n\n" + line_es
    if m["year_ago_ft"] is not None:
        longer = (line_en + f" A year ago: {_ft(m['year_ago_ft'])}.\n\n"
                  + line_es + f" Hace un año: {_ft(m['year_ago_ft'])}.")
        if checks.x_weighted_length(longer) <= config.POST_MAX_CHARS:  # drop the extra rather than truncate
            text = longer

    note_en, note_es = _source_note(credit)
    alt = (
        f"Line chart of Lake Powell's daily water level for the last 90 days, with the week to {_d_en(d)}, {d.year} shaded. "
        f"The lake ended the week at {_ft(m['ft'])} ft"
        + (f", {_chg(c)} ft from seven days earlier" if c else (", unchanged from seven days earlier" if c == 0 else ""))
        + f", and ranged from {_ft(lo)} to {_ft(hi)} ft during the week; that is {_ft(m['above_min_power_pool'])} ft above "
        f"a marked line at the 3,490 ft minimum power pool. A second marked line shows the 3,525 ft protection target. "
        f"A faint line shows the same days one year earlier." + note_en
        + f" / Gráfica del nivel diario del lago Powell en los últimos 90 días, con la semana al {_d_es(d)} de {d.year} "
        f"sombreada; terminó en {_ft(m['ft'])} pies." + note_es
    )
    return text, alt
