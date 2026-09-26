"""Writes eia930_balance_SYNTHETIC_full_day.csv: EIA's real balance-file column layout (copied from
eia930_balance_SYNTHETIC_values.csv, typos included) with MADE-UP values: 24 hours for AZPS, SRP and
TEPC on Mon Jun 15, 2026 (SYNTHETIC: not EIA data). Deterministic; re-run to regenerate."""
import csv
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
header = next(csv.reader(open(HERE / "eia930_balance_SYNTHETIC_values.csv")))
SIZE = {"AZPS": 1.0, "SRP": 1.2, "TEPC": 0.4}
NUC = {"AZPS": 0.0, "SRP": 3900.0, "TEPC": 0.0}
rows = []
for ba, k in SIZE.items():
    for hr in range(1, 25):
        sun = max(0.0, math.sin(math.pi * (hr - 6.5) / 13.0))            # hour ending 7..19
        solar = round(2600 * k * sun)
        wind = round(150 * k * (1.2 + math.cos(hr / 3.0)))
        coal = round(900 * k)
        batt = round(-450 * k * sun) if 9 <= hr <= 15 else (round(520 * k) if 18 <= hr <= 21 else 0)
        demand = round(6200 * k + 1900 * k * math.sin(math.pi * (hr - 8) / 16.0) ** 2)
        gas = max(0, round(demand * 0.97 - solar - wind - coal - NUC[ba] - batt)) if ba != "SRP" else round(1800 + 900 * (1 - sun))
        ng = solar + wind + coal + gas + round(NUC[ba]) + batt
        r = {c: "" for c in header}
        r.update({"Balancing Authority": ba, "Data Date": "06/15/2026", "Hour Number": str(hr),
                  "Local Time at End of Hour": f"06/15/2026 {(hr - 1) % 12 + 1}:00:00 {'AM' if hr < 12 or hr == 24 else 'PM'}",
                  "UTC Time at End of Hour": "", "Demand (MW)": str(demand), "Net Generation (MW)": str(ng),
                  "Total Interchange (MW)": str(ng - demand), "Net Generation (MW) from Coal": str(coal),
                  "Net Generation (MW) from Natural Gas": str(gas), "Net Generation (MW) from Nuclear": str(round(NUC[ba])) if NUC[ba] else "",
                  "Net Generation (MW) from Solar without Integrated Battery Storage": str(solar),
                  "Net Generation (MW) from Wind without Integrated Battery Storage": str(wind),
                  "Net Generation (MW) from Battery Storage": str(batt), "Region": "SW"})
        rows.append([r[c] for c in header])
with open(HERE / "eia930_balance_SYNTHETIC_full_day.csv", "w", newline="") as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL)
    w.writerow(header)
    w.writerows(rows)
print(len(rows), "rows")
