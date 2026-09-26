"""Independent check of every number Pilot B shows, straight from the CSV (plain Python, no numpy,
a different algorithm from the render scripts).

  python verify_powell.py <csv> --v1                    the v1 on-screen strings (from its render log)
  python verify_powell.py <csv> <manifest.json>...      a v2 render manifest (lake_powell_v2.py)

For v2 it checks (1) the facts: segment changes, spring rises (brute force over every pair of days
Mar 1-Jul 31), first day below 3,525 ft, record low, three-year change and buffers; (2) every frame:
headline value, date, feet above 3,490 and the live counter against the CSV row the frame claims,
days never going backwards and the pen reaching the last day; (3) every drawn string: each number
in it must be a CSV value, a computed fact, a threshold, a date or a year. Exit code 1 on any FAIL.
"""
import csv
import json
import re
import sys
from datetime import date

MIN_POOL, TARGET = 3490.0, 3525.0


def load(path):
    rows = [r for r in csv.reader(line for line in open(path) if not line.startswith("#"))][1:]
    days = [date.fromisoformat(r[0]) for r in rows]
    vals = [float(r[1]) for r in rows]
    return days, vals


def r1(x):
    return round(x + 0.0, 1)


def signed(x):
    return ("+" if x >= 0 else "−") + f"{abs(x):,.1f}"


def en_date(d, year=True):
    return f"{d:%b} {d.day}, {d.year}" if year else f"{d:%b} {d.day}"


def facts(days, vals):
    n = len(vals)
    ok_days = all((days[k + 1] - days[k]).days == 1 for k in range(n - 1))
    springs = {}
    for Y in (2024, 2025, 2026):
        idx = [k for k in range(n) if date(Y, 3, 1) <= days[k] <= date(Y, 7, 31)]
        best = None
        for jj, j in enumerate(idx):                      # brute force: best rise ending at j
            for i in idx[: jj + 1]:
                rise = vals[j] - vals[i]
                key = (round(rise, 6), -j, -i)
                if best is None or key > best[0]:
                    best = (key, i, j)
        _, i, j = best
        # the low's date: first day at the minimum value before the peak (the renders' convention)
        lo_val = min(vals[k] for k in idx if k <= j)
        i = next(k for k in idx if vals[k] == lo_val and k <= j)
        springs[Y] = (i, j, r1(vals[j] - vals[i]))
    low = min(range(n), key=lambda k: (vals[k], k))
    cross = next(k for k in range(n) if vals[k] < TARGET)
    turns = [0, springs[2024][0], springs[2024][1], springs[2025][0], springs[2025][1], springs[2026][0], springs[2026][1], low]
    segs = [(a, b, r1(vals[b] - vals[a])) for a, b in zip(turns, turns[1:])]
    return {"contiguous": ok_days, "n": n, "springs": springs, "low": low, "cross": cross, "segs": segs,
            "change": r1(vals[-1] - vals[0]), "buf_start": r1(vals[0] - MIN_POOL), "buf_end": r1(vals[-1] - MIN_POOL),
            "buf_low": r1(vals[low] - MIN_POOL), "rebound": r1(vals[-1] - vals[low])}


NUM = re.compile(r"[+−-]?\d[\d,]*\.?\d*")


def allowed_numbers(days, vals, F):
    ok = set()
    add = lambda x: ok.add(f"{abs(x):,.1f}")
    for v in vals:
        add(v)
        add(v - MIN_POOL)
    for x in [F["change"], F["buf_start"], F["buf_end"], F["buf_low"], F["rebound"]] + [s[2] for s in F["segs"]] + [s[2] for s in F["springs"].values()]:
        add(x)
    for d in days:
        ok.update({str(d.day), str(d.year)})
    ok.update({"3,490", "3,525", "09379900", "2023", "2024", "2025", "2026"})
    return ok


def check_text(strings, ok, fails):
    bad = []
    for s in strings:
        for tok in NUM.findall(s):
            t = tok.lstrip("+−-").rstrip(".,")
            if t and t not in ok:
                bad.append((s, tok))
    if bad:
        fails.append(f"unexplained numbers: {bad[:8]}")
    return len(bad) == 0


def main():
    days, vals = load(sys.argv[1])
    F = facts(days, vals)
    fails, passes = [], 0

    def check(cond, what):
        nonlocal passes
        if cond:
            passes += 1
        else:
            fails.append(what)

    check(F["contiguous"] and F["n"] == 1096, "CSV rows contiguous, 1096 days")
    check(str(days[0]) == "2023-09-25" and str(days[-1]) == "2026-09-24", "date range")
    if "--v1" in sys.argv:
        sp = F["springs"]
        v1 = {  # v1's on-screen strings (render log and README), with what they must equal
            "2024 runoff: +29.2 ft (Apr 14 → Jul 8)": f"2024 runoff: {signed(sp[2024][2])} ft ({en_date(days[sp[2024][0]], False)} → {en_date(days[sp[2024][1]], False)})",
            "2025 runoff: +4.1 ft (May 4 → Jun 18)": f"2025 runoff: {signed(sp[2025][2])} ft ({en_date(days[sp[2025][0]], False)} → {en_date(days[sp[2025][1]], False)})",
            "2026 runoff: +2.0 ft (May 5 → May 31)": f"2026 runoff: {signed(sp[2026][2])} ft ({en_date(days[sp[2026][0]], False)} → {en_date(days[sp[2026][1]], False)})",
            "Lowest in this record: 3,516.4 ft (Sep 16, 2026)": f"Lowest in this record: {vals[F['low']]:,.1f} ft ({en_date(days[F['low']])})",
            "Sep 25, 2023: 3,573.3 ft": f"{en_date(days[0])}: {vals[0]:,.1f} ft",
            "Sep 24, 2026: 3,517.5 ft": f"{en_date(days[-1])}: {vals[-1]:,.1f} ft",
            "−55.8 ft in three years": f"{signed(F['change'])} ft in three years",
            "27.5 ft above the minimum power pool": f"{F['buf_end']:,.1f} ft above the minimum power pool",
            "−55.8 pies en tres años": f"{signed(F['change'])} pies en tres años",
        }
        for shown, expect in v1.items():
            check(shown == expect, f"v1: {shown!r} != {expect!r}")
        print(json.dumps({"mode": "v1", "checks_passed": passes, "fails": fails}, ensure_ascii=False, indent=1))
        sys.exit(1 if fails else 0)

    ok = allowed_numbers(days, vals, F)
    for path in sys.argv[2:]:
        M = json.load(open(path))
        # facts behind the beats and the end card
        for b, (a, bb, ch) in zip(M["beats"], F["segs"]):
            check(b["from"] == str(days[a]) and b["to"] == str(days[bb]) and abs(b["change"] - ch) < 1e-9, f"beat {b['en']!r}: {b['from']}->{b['to']} {b['change']} vs {days[a]}->{days[bb]} {ch}")
            check(b["final_counter"] == f"{signed(ch)} ft", f"beat counter {b['final_counter']} vs {signed(ch)} ft")
        sp = F["springs"]
        e2 = f"{signed(sp[2024][2])} → {signed(sp[2025][2])} → {signed(sp[2026][2])} ft"
        texts = M["text"] + M["chart_labels"]
        check(e2 in texts, f"end card springs line {e2!r} missing")
        check(f"Three years: {signed(F['change'])} ft" in texts, "end card three-year change")
        check(f"{F['buf_end']:,.1f} ft" in texts, "cold-open buffer")
        check(signed(F["segs"][-1][2]) in M["chart_labels"], "last segment label")
        check(f"{vals[F['low']]:,.1f} ft · {en_date(days[F['low']], False)} · lowest" in M["chart_labels"], "record-low label")
        check_text(texts, ok, fails) and check(True, "")
        # every frame
        last, reached, nf = -1, False, 0
        for r in M["frames"]:
            if "day" not in r:
                continue
            nf += 1
            i = r["day"]
            check(i >= last, f"frame {r['f']}: day went backwards")
            last = i
            reached |= i == len(vals) - 1
            check(r["date"] == str(days[i]), f"frame {r['f']}: date")
            check(r["big"] == f"{vals[i]:,.1f} ft", f"frame {r['f']}: headline {r['big']}")
            check(r["date_text"] == f"Lake Powell · {en_date(days[i])}", f"frame {r['f']}: date text")
            check(r["buffer_text"] == f"{vals[i] - MIN_POOL:,.1f} ft above the minimum power pool", f"frame {r['f']}: buffer text")
            if "counter" in r:
                exp = f"{signed(r1(vals[r['counter_to_day']] - vals[r['counter_from_day']]))} ft"
                check(r["counter"] == exp, f"frame {r['f']}: counter {r['counter']} vs {exp}")
        check(reached, f"{path}: the pen never reached the last day")
        print(json.dumps({"manifest": path, "frames_checked": nf, "texts_checked": len(texts)}, ensure_ascii=False))
    print(json.dumps({"checks_passed": passes, "fails": fails[:20], "fail_count": len(fails)}, ensure_ascii=False, indent=1))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
