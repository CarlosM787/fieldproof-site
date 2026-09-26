"""Arizona Grid Daily: one post per complete local day of EIA-930 data for APS, SRP and TEP.

  metrics()          the numbers the post may use (from grid.combine of the three authorities)
  compose()          English then Spanish in one post, <= 280 X-weighted characters, no URL; a rotating
                     second fact (peak demand, solar peak, net imports, batteries) so days don't repeat
  factcheck()        recomputes every number from the raw per-authority rows with its own loops (not
                     metrics(), not grid.combine) and checks each "<fuel> N%" pair, the peak, the hour,
                     the date in both languages, the alt text and the length. Any problem blocks.
  revision_issues()  compares two readings of the same day: EIA-930 hours move for about a day after
                     first release (AUDIT_P2.md), so the post for day D goes out on D + 2 only if the
                     reading it uses agrees with the one before it.
  make_post()        completeness gate -> metrics -> compose -> fact-check -> chart -> approval code.
Nothing here posts. The chart and credit say "preliminary"; the image carries the source URL, the post
does not (a post with a URL costs $0.20 instead of $0.015: VERIFIED, X pricing page).
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from pathlib import Path

from . import approval, checks, config, grid, render, sources

MIX_FUELS = ("gas", "nuclear", "coal", "solar", "wind", "hydro", "oil")   # fuels a share may be quoted for
STAMP_THIRD_PARTY = "THIRD-PARTY COPY OF EIA-930 · NOT OFFICIAL · NOT POSTED"


# ---------------------------------------------------------------- reading
def day_rows(balance_text: str, day: date, bas=config.GRID_BAS) -> dict[str, list[dict]]:
    return {ba: [h for h in sources.parse_eia930_balance(balance_text, ba) if h["date"] == day] for ba in bas}


def completeness(per_ba: dict) -> dict[str, list[str]]:
    return {ba: checks.grid_day_issues(h) for ba, h in per_ba.items()}


# ---------------------------------------------------------------- wording helpers
def _h12(h: int) -> str:
    h %= 24
    return "midnight" if h == 0 else "noon" if h == 12 else f"{h % 12}"


def hour_label(hour_ending: int) -> tuple[str, str]:
    """The hour that ends at `hour_ending` (1-24, Arizona time): ('4-5 p.m.', '16-17 h')."""
    a, b = hour_ending - 1, hour_ending
    suf = lambda h: "" if h % 12 == 0 else (" a.m." if h % 24 < 12 else " p.m.")
    if (a % 24 < 12) == (b % 24 < 12) and a % 12 and b % 12:
        en = f"{_h12(a)}-{_h12(b)}{suf(b)}"
    else:
        en = f"{_h12(a)}{suf(a)}-{_h12(b)}{suf(b)}"
    return en, f"{a}-{b} h"


def _pct(x: float) -> int:
    return int(round(100 * x))


def _dates(d: date) -> tuple[str, str, str, str]:
    """('Sat Aug 22', 'sáb 22 ago', 'Sat Aug 22, 2026', 'sáb 22 ago 2026')"""
    en = f"{config.WEEKDAYS_EN[d.weekday()]} {config.MONTHS_EN[d.month - 1]} {d.day}"
    es = f"{config.WEEKDAYS_ES[d.weekday()]} {d.day} {config.MONTHS_ES[d.month - 1]}"
    return en, es, f"{en}, {d.year}", f"{es} {d.year}"


# ---------------------------------------------------------------- metrics
def metrics(per_ba: dict, day: date) -> dict:
    hours = grid.combine(per_ba)
    gen = sum(h["net_generation"] for h in hours)
    dem = sum(h["demand"] for h in hours)
    fuel = {f: sum((h[f] or 0.0) for h in hours) for f in sources.GRID_FUELS}
    peak = max(hours, key=lambda h: (h["demand"], -h["hour"]))
    solar_peak = max(hours, key=lambda h: ((h["solar"] or 0.0), -h["hour"]))
    shares = {f: fuel[f] / gen for f in MIX_FUELS}
    mix = sorted(((f, _pct(s)) for f, s in shares.items() if _pct(s) >= 1), key=lambda t: (-t[1], MIX_FUELS.index(t[0])))
    return {
        "date": day, "bas": list(per_ba), "hours": len(hours),
        "generation_mwh": round(gen), "demand_mwh": round(dem), "net_imports_mwh": round(dem - gen),
        "fuel_mwh": {f: round(v) for f, v in fuel.items()}, "share_pct": {f: _pct(s) for f, s in shares.items()}, "mix": mix,
        "peak_demand_mw": round(peak["demand"]), "peak_hour_ending": peak["hour"],
        "solar_peak_mw": round(solar_peak["solar"] or 0.0), "solar_peak_hour_ending": solar_peak["hour"],
        "storage_charged_mwh": round(-sum(min(h["storage"] or 0.0, 0.0) for h in hours)),
        "storage_discharged_mwh": round(sum(max(h["storage"] or 0.0, 0.0) for h in hours)),
        "by_ba": {ba: {"demand_mwh": round(sum(h["demand"] for h in rows)), "generation_mwh": round(sum(h["net_generation"] for h in rows))}
                  for ba, rows in per_ba.items()},
    }


# ---------------------------------------------------------------- compose
def _names() -> tuple[str, str]:
    short = [config.GRID_BA_NAMES[b][0] for b in config.GRID_BAS]
    full = [config.GRID_BA_NAMES[b][1] for b in config.GRID_BAS]
    return "+".join(short), (", ".join(full[:-1]) + " and " + full[-1]) if len(full) > 1 else full[0]


def _mix(m: dict, lang: int, n: int) -> str:
    return ", ".join(f"{config.GRID_FUEL_NAMES[f][lang]} {p}%" for f, p in m["mix"][:n])


def _rotating(m: dict) -> tuple[str, str, str]:
    """(label, English, Spanish): one of four second facts, keyed on the date."""
    rot = m["date"].toordinal() % 4
    if rot == 0:
        en, es = hour_label(m["peak_hour_ending"])
        return "peak demand", f" Peak demand: {m['peak_demand_mw']:,} MW ({en}).", f" Demanda máxima: {m['peak_demand_mw']:,} MW ({es})."
    if rot == 1 and m["solar_peak_mw"] > 0:
        en, es = hour_label(m["solar_peak_hour_ending"])
        return "solar peak", f" Solar peak: {m['solar_peak_mw']:,} MW ({en}).", f" Pico solar: {m['solar_peak_mw']:,} MW ({es})."
    if rot == 2:
        x = m["net_imports_mwh"]
        if x >= 0:
            return "net imports", f" Net imports: {x:,} MWh.", f" Importación neta: {x:,} MWh."
        return "net exports", f" Net exports: {-x:,} MWh.", f" Exportación neta: {-x:,} MWh."
    if m["storage_discharged_mwh"] > 0:
        return ("batteries", f" Batteries returned {m['storage_discharged_mwh']:,} MWh.",
                f" Las baterías devolvieron {m['storage_discharged_mwh']:,} MWh.")
    en, es = hour_label(m["peak_hour_ending"])
    return "peak demand", f" Peak demand: {m['peak_demand_mw']:,} MW ({en}).", f" Demanda máxima: {m['peak_demand_mw']:,} MW ({es})."


def rotating_fact(m: dict, text: str) -> str | None:
    label, en, _ = _rotating(m)
    return label if en in text else None


def compose(m: dict, credit=config.CREDIT_EIA) -> tuple[str, str]:
    d = m["date"]
    d_en, d_es, d_en_y, d_es_y = _dates(d)
    short, full = _names()
    _, extra_en, extra_es = _rotating(m)
    text = None
    for n, with_extra in ((4, True), (3, True), (4, False), (3, False)):   # drop detail rather than truncate
        en = f"Arizona grid ({short}), {d_en}: {_mix(m, 0, n)} of generation." + (extra_en if with_extra else "")
        es = f"Red de Arizona ({short}), {d_es}: {_mix(m, 1, n)} de la generación." + (extra_es if with_extra else "")
        text = en + "\n\n" + es
        if checks.x_weighted_length(text) <= config.POST_MAX_CHARS:
            break
    pk_en, pk_es = hour_label(m["peak_hour_ending"])
    alt = (f"Stacked area chart of electricity generation by source, hour by hour, for {full} combined on {d_en_y} (Arizona time). "
           f"{_mix(m, 0, 5).capitalize()} of generation. A dashed line shows demand, which peaked at {m['peak_demand_mw']:,} MW ({pk_en}). "
           f"Batteries charging show below zero. Source: {credit[0]}. {config.PRELIMINARY_EN}"
           f" / Gráfica de la generación eléctrica por fuente, hora por hora, de APS, SRP y TEP el {d_es_y} (hora de Arizona): "
           f"{_mix(m, 1, 5)} de la generación. Demanda máxima: {m['peak_demand_mw']:,} MW ({pk_es}). Fuente: {credit[1]}. {config.PRELIMINARY_ES}")
    return text, alt


# ---------------------------------------------------------------- independent fact-check
_FUEL_WORD = {"gas": "gas", "nuclear": "nuclear", "coal": "coal", "carbón": "coal", "solar": "solar", "wind": "wind",
              "eólica": "wind", "hydro": "hydro", "hidro": "hydro", "oil": "oil", "petróleo": "oil"}
_PAIR = re.compile(r"\b(gas|nuclear|coal|carbón|solar|wind|eólica|hydro|hidro|oil|petróleo) (\d+)%", re.I)
_MW = re.compile(r"(Peak demand|Demanda máxima|demand, which peaked at|Solar peak|Pico solar):? ?(\d[\d,]*) MW \(([^)]*)\)", re.I)


def _recompute(per_ba: dict) -> dict:
    """Straight from the rows: loops over authorities and hours, no shared code with metrics()."""
    gen = dem = 0.0
    fuel = {f: 0.0 for f in sources.GRID_FUELS}
    by_hour_dem, by_hour_solar, charge, discharge = {}, {}, 0.0, 0.0
    for rows in per_ba.values():
        for h in rows:
            gen += h["net_generation"]
            dem += h["demand"]
            by_hour_dem[h["hour"]] = by_hour_dem.get(h["hour"], 0.0) + h["demand"]
            by_hour_solar[h["hour"]] = by_hour_solar.get(h["hour"], 0.0) + (h["solar"] or 0.0)
            for f in sources.GRID_FUELS:
                fuel[f] += h[f] or 0.0
    for hr in by_hour_dem:
        s = sum((h["storage"] or 0.0) for rows in per_ba.values() for h in rows if h["hour"] == hr)
        charge += -min(s, 0.0)
        discharge += max(s, 0.0)
    peak_h = min(h for h, v in by_hour_dem.items() if v == max(by_hour_dem.values()))
    sol_h = min(h for h, v in by_hour_solar.items() if v == max(by_hour_solar.values()))
    return {"gen": gen, "dem": dem, "pct": {f: int(round(100 * fuel[f] / gen)) for f in sources.GRID_FUELS},
            "peak": (round(by_hour_dem[peak_h]), peak_h), "solar_peak": (round(by_hour_solar[sol_h]), sol_h),
            "net": round(dem - gen), "charge": round(charge), "discharge": round(discharge)}


def factcheck(text: str, alt: str, per_ba: dict, day: date) -> list[str]:
    R = _recompute(per_ba)
    problems = []
    wl = checks.x_weighted_length(text)
    if wl > config.POST_MAX_CHARS:
        problems.append(f"post is {wl} weighted characters (limit {config.POST_MAX_CHARS})")
    if not config.ALLOW_URLS_IN_POST and re.search(r"https?://|www\.|\.gov\b|\.com\b", text):
        problems.append("post contains a URL ($0.20 instead of $0.015; the source URL belongs on the image)")
    d_en, d_es, d_en_y, d_es_y = _dates(day)
    if d_en not in text or d_es not in text:
        problems.append(f"post does not name the data date in both languages ({d_en} / {d_es})")
    if d_en_y not in alt or d_es_y not in alt:
        problems.append("alt text does not name the data date in both languages")
    if config.PRELIMINARY_EN not in alt or config.PRELIMINARY_ES not in alt:
        problems.append("alt text lacks the preliminary-data note (EN and ES)")
    if "EIA-930" not in alt:
        problems.append("alt text does not credit EIA-930")
    if len(alt) > config.ALT_MAX_CHARS:
        problems.append(f"alt text is {len(alt)} characters (X limit {config.ALT_MAX_CHARS})")
    for where, s in (("post", text), ("alt text", alt)):
        for word, pct in _PAIR.findall(s):
            f = _FUEL_WORD[word.lower()]
            if int(pct) != R["pct"][f]:
                problems.append(f"{where}: {word} {pct}% but the data say {R['pct'][f]}%")
        for what, mw, when in _MW.findall(s):
            mw = int(mw.replace(",", ""))
            want, he = R["solar_peak"] if what.lower().startswith(("solar", "pico")) else R["peak"]
            if mw != want or when not in hour_label(he):
                problems.append(f"{where}: {what} {mw} MW ({when}) but the data say {want} MW ({'/'.join(hour_label(he))})")
    for label, key in (("Net imports", "net"), ("Importación neta", "net"), ("Net exports", "net"), ("Exportación neta", "net"),
                       ("Batteries returned", "discharge"), ("baterías devolvieron", "discharge")):
        mm = re.search(re.escape(label) + r":? (\d[\d,]*) MWh", text)
        if mm and int(mm.group(1).replace(",", "")) != abs(R[key]):
            problems.append(f"post: {label} {mm.group(1)} MWh but the data say {abs(R[key]):,}")
    allowed = {float(day.day), float(day.year), 930.0, float(R["peak"][0]), float(R["solar_peak"][0]), float(abs(R["net"])),
               float(R["charge"]), float(R["discharge"])} | {float(v) for v in R["pct"].values()}
    for he in (R["peak"][1], R["solar_peak"][1]):
        allowed |= {float(he), float(he - 1), float(he % 12 or 12), float((he - 1) % 12 or 12)}
    body = re.sub(r"\(APS\+SRP\+TEP\)", " ", text)
    for n in checks._nums(body):
        if not any(abs(abs(n) - a) < 0.51 for a in allowed):
            problems.append(f"number {n:g} in the post does not trace to the data")
    return problems


# ---------------------------------------------------------------- second reading
def revision_issues(first: dict, second: dict, tol=None) -> list[str]:
    """Hours of the same day read twice (e.g. on D + 1 and D + 2): every total and fuel must agree
    within max(tol['mw'] MW, tol['share'] x value), and each quoted share within 1 percentage point."""
    tol = tol or config.GRID_REVISION_TOLERANCE
    issues = []
    for ba in second:
        a = {h["hour"]: h for h in first.get(ba, [])}
        for h in second[ba]:
            o = a.get(h["hour"])
            if o is None:
                issues.append(f"{ba} hour {h['hour']}: missing from the first reading")
                continue
            for k in ("demand", "net_generation") + sources.GRID_FUELS:
                x, y = o.get(k), h.get(k)
                if (x is None) != (y is None):
                    issues.append(f"{ba} hour {h['hour']} {k}: {x} -> {y}")
                elif x is not None and abs(x - y) > max(tol["mw"], tol["share"] * abs(y)):
                    issues.append(f"{ba} hour {h['hour']} {k}: {x:.0f} -> {y:.0f} MW")
    if not issues:
        p1, p2 = _recompute(first)["pct"], _recompute(second)["pct"]
        issues += [f"{f} share {p1[f]}% -> {p2[f]}%" for f in MIX_FUELS if abs(p1[f] - p2[f]) > 1]
    return issues


# ---------------------------------------------------------------- the bundle
def source_line(note: str = "") -> str:
    return (f"Data: {config.CREDIT_EIA[0]} Hourly Electric Grid Monitor, balance file: {' + '.join(config.GRID_BAS)}, "
            f"Arizona time; preliminary, revised for days afterwards. {config.GRID_SOURCE_URL} {note}").strip()


def make_post(per_ba: dict, day: date, as_of: date, run_dir: Path, *, stamp: str | None = None, source_note: str = "",
              source_label: str = "EIA-930 balance file", second_reading: dict | None = None, file_sha256: str | None = None):
    """(exit code, bundle, detail) like run_daily.make_post: 4 incomplete day, 5 fact-check failed, 0 queued.
    `second_reading` is the same day read earlier; without it the bundle says the check was not possible."""
    issues = completeness(per_ba)
    if any(issues.values()):
        return 4, None, {"event": "invalid", "issues": [f"{ba}: {i}" for ba, ii in issues.items() for i in ii[:3]]}
    m = metrics(per_ba, day)
    text, alt = compose(m)
    problems = factcheck(text, alt, per_ba, day)
    if problems:
        return 5, None, {"event": "factcheck-failed", "problems": problems, "text": text}
    rev = revision_issues(second_reading, per_ba) if second_reading is not None else None
    d_en, _, d_en_y, _ = _dates(day)
    pk_en, _ = hour_label(m["peak_hour_ending"])
    run_dir = Path(run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    short, _ = _names()
    img = render.render_grid(
        grid.combine(per_ba), run_dir / f"{config.KINDS['grid']}-{day}.png",
        header=config.GRID_ACCOUNT_NAME.upper() + (" · SAMPLE" if stamp else ""),
        title=" · ".join(f"{config.GRID_FUEL_NAMES[f][0].capitalize()} {p}%" for f, p in m["mix"][:4]),
        subtitle=f"{short.replace('+', ' + ')} · {d_en_y} · peak demand {m['peak_demand_mw']:,} MW ({pk_en}) · "
                 f"net {'imports' if m['net_imports_mwh'] >= 0 else 'exports'} {abs(m['net_imports_mwh']):,} MWh",
        stamp=stamp or "", source_line=source_line(source_note))
    kind = config.KINDS["grid"]
    bundle = {
        "kind": kind, "as_of": as_of, "data_date": day, "text": text, "alt": alt, "image": img.name, "source": source_label,
        "credit": config.CREDIT_EIA[0], "source_url": config.GRID_SOURCE_URL, "file_sha256": file_sha256,
        "metrics": {k: v for k, v in m.items() if k != "date"}, "rotating_fact": rotating_fact(m, text),
        "second_reading": ({"status": "not available", "why": "one reading only"} if rev is None else
                           {"status": "agrees" if not rev else "revised", "issues": rev[:20]}),
        "factcheck_problems": [], "chars": len(text), "x_weighted_chars": checks.x_weighted_length(text), "alt_chars": len(alt),
        "data_sha256": hashlib.sha256(json.dumps(per_ba, default=str, sort_keys=True).encode()).hexdigest()[:16],
        "est_cost_usd": round(config.PRICE_POST + config.PRICE_ALT_TEXT, 3),
    }
    bundle["approval_code"] = approval.approval_code(bundle, img.read_bytes())
    return 0, bundle, {"event": "queued"}
