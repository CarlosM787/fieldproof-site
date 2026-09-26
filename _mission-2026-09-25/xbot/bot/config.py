"""Settings for the daily data-visual X pipeline (Colorado River Daily + Arizona Grid Daily).

Everything a reviewer might want to check lives here: sources, thresholds, limits, wording rules.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "fonts"

ACCOUNT_NAME = "Colorado River Daily"
# X rule (developer guidelines, VERIFIED in xdevplatform/docs @3ef050bd): automated accounts turn on
# the "Automated" label, link to the human who runs them, and say so in the bio.
BIO_EN = "Daily Lake Powell and Lake Mead charts from public USGS and Reclamation data. Automated account run by @(Carlos's handle). Not official."
BIO_ES = "Gráficas diarias del lago Powell y el lago Mead con datos públicos del USGS y Reclamation. Cuenta automatizada de @(Carlos). No oficial."

# Official sources (all keyless). The pipeline tries them in order.
SOURCES = {
    "usgs_powell": {
        "label": "USGS NWIS site 09379900, parameter 62614 (lake elevation, ft), daily values",
        "url": "https://waterservices.usgs.gov/nwis/dv/?format=json&sites=09379900&parameterCd=62614&period=P400D",
    },
    "usbr_powell": {
        "label": "Bureau of Reclamation hydrodata, Lake Powell (919), parameter 49 (pool elevation)",
        "url": "https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/csv/49.csv",
    },
    "usbr_mead": {
        "label": "Bureau of Reclamation hydrodata, Lake Mead (921), parameter 49 (pool elevation)",
        "url": "https://www.usbr.gov/uc/water/hydrodata/reservoir_data/921/csv/49.csv",
    },
    # Lead concept (Arizona Grid Daily). Keyless bulk file; the documented API needs a free key.
    "eia930_bulk": {
        "label": "EIA-930 Hourly Electric Grid Monitor, balance file",
        "url": "https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_BALANCE_2026_Jul_Dec.csv",
    },
}

# Lake Powell operating thresholds (feet above sea level). REPORTED: widely published Reclamation
# figures, also encoded in the third-party analyzer used for the sandbox replay. Re-check on
# usbr.gov before the first live post.
POWELL_THRESHOLDS = [
    {"ft": 3525.0, "en": "3,525 ft protection target (2019 drought agreement)", "es": "3,525 pies, meta de protección (acuerdo de sequía de 2019)"},
    {"ft": 3490.0, "en": "3,490 ft minimum power pool", "es": "3,490 pies, nivel mínimo para generar energía"},
]
MIN_POWER_POOL_FT = 3490.0

LIMITS = {
    "min_ft": 3300.0,            # below dead pool: a unit or parsing error, not news
    "max_ft": 3711.0,            # full pool is about 3,700 ft
    "max_daily_jump_ft": 1.5,    # bigger day-to-day moves need a human look
    "max_age_days": 2,           # the newest value must be from yesterday or the day before
    "min_days_last_30": 27,      # tolerate a few missing days, not a broken feed
}

POST_MAX_CHARS = 280
ALLOW_URLS_IN_POST = False   # X charges $0.20 per post with a URL vs $0.015 without (VERIFIED docs.x.com pricing)

MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
