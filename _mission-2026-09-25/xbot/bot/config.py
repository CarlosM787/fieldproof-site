"""Settings for the daily data-visual X pipeline (Colorado River Daily + Arizona Grid Daily).

Everything a reviewer might want to check lives here: sources, thresholds, limits, wording rules.
Evidence labels (VERIFIED / REPORTED / INFERENCE / OPEN) and dates are in AUDIT_P2.md.
"""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "fonts"

ACCOUNT_NAME = "Colorado River Daily"
# X rule (developer guidelines, VERIFIED in xdevplatform/docs @3ef050bd): automated accounts turn on
# the "Automated" label, link to the human who runs them, and say so in the bio.
BIO_EN = "Daily Lake Powell and Lake Mead charts from public USGS and Reclamation data. Automated account run by @(Carlos's handle). Not official."
BIO_ES = "Gráficas diarias del lago Powell y el lago Mead con datos públicos del USGS y Reclamation. Cuenta automatizada de @(Carlos). No oficial."

# Arizona keeps MST (UTC-7) all year, so the bot's "today" is the Arizona date, whatever the
# runner's clock says.
ARIZONA = timezone(timedelta(hours=-7))


def today_az() -> date:
    return datetime.now(ARIZONA).date()


# Official sources (keyless). Lake Powell sources are tried in the order of POWELL_SOURCES.
SOURCES = {
    # USGS's modern Water Data API. The legacy NWIS services below are "scheduled [to be retired]
    # late 2026, but uncertain" (VERIFIED: DOI-USGS/dataRetrieval @ad9deab, vignettes/tutorial.Rmd),
    # so this goes first. OPEN until run on an open network: the query follows USGS's own
    # dataretrieval-python client. An optional free key (env API_USGS_PAT) raises the rate limit.
    "usgs_waterdata_powell": {
        "label": "USGS Water Data API, daily values, site USGS-09379900, parameter 62614 (lake elevation, ft)",
        "url": "https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items?monitoring_location_id=USGS-09379900&parameter_code=62614&time=P400D&skipGeometry=true&limit=50000&f=json",
    },
    "usgs_powell": {
        "label": "USGS NWIS site 09379900, parameter 62614 (lake elevation, ft), daily values (legacy service)",
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
POWELL_SOURCES = ("usgs_waterdata_powell", "usgs_powell", "usbr_powell")

# Lake Powell operating thresholds (feet above sea level). REPORTED: widely published Reclamation
# figures, also encoded in the third-party analyzer used for the sandbox replay. Re-check on
# usbr.gov before the first live post.
POWELL_THRESHOLDS = [
    {"ft": 3525.0, "en": "3,525 ft protection target (2019 drought agreement)", "es": "3,525 pies, meta de protección (acuerdo de sequía de 2019)"},
    {"ft": 3490.0, "en": "3,490 ft minimum power pool", "es": "3,490 pies, nivel mínimo para generar energía"},
]
MIN_POWER_POOL_FT = 3490.0
# The 3,525 ft target comes from the 2019 drought agreements, which run with the 2007 Interim
# Guidelines through the end of 2026 (REPORTED). After this date the bot refuses to post until a
# human re-checks the threshold wording and moves the date.
THRESHOLD_LABELS_VALID_THROUGH = date(2026, 12, 31)

LIMITS = {
    "min_ft": 3300.0,            # below dead pool: a unit or parsing error, not news
    "max_ft": 3711.0,            # full pool is about 3,700 ft
    "max_daily_jump_ft": 1.5,    # bigger day-to-day moves need a human look
    "max_age_days": 2,           # the newest value must be from yesterday or the day before
    "min_days_last_30": 27,      # tolerate a few missing days, not a broken feed
    "min_days_in_week": 6,       # the weekly post needs at least 6 of its 7 days
}

POST_MAX_CHARS = 280
ALT_MAX_CHARS = 1000         # POST /2/media/metadata alt_text.text maxLength (VERIFIED openapi.json @3ef050bd)
ALLOW_URLS_IN_POST = False   # X charges $0.20 per post with a URL vs $0.015 without (VERIFIED docs.x.com pricing)

# Every alt text carries this. USGS labels recent daily values "Provisional", "subject to revision".
PROVISIONAL_EN = "Recent values are provisional and may be revised."
PROVISIONAL_ES = "Los valores recientes son provisionales y pueden cambiar."

# Posted log (bot/ledger.py): never the same data date twice for one series, and never a text
# identical to anything posted within this many days.
DUPLICATE_TEXT_WINDOW_DAYS = 30
KINDS = {"daily": "powell-daily", "weekly": "powell-weekly"}
WEEKDAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
WEEKLY_DEFAULT_WEEKDAY = "fri"

# X pay-per-use prices per request (VERIFIED docs.x.com pricing @3ef050bd). Whether the media upload
# itself is billed is OPEN, so the estimate carries it separately as a worst case.
PRICE_POST, PRICE_ALT_TEXT, PRICE_MEDIA_UPLOAD_WORST_CASE = 0.015, 0.005, 0.015

MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

# ---------------------------------------------------------------- phase three: Arizona Grid Daily + weekly river
# Balancing authorities in the grid post (EIA-930 respondent codes). VERIFIED 2026-09-26 in a third-party copy of
# EIA's EIA930_BALANCE_2026_Jul_Dec.csv (sha256 f94cde6b...bf20): AZPS, SRP, TEPC, WALC and DEAA are present; HGMA,
# GRIF and GRMA are not. The post covers the three Arizona utilities. WALC (WAPA Desert Southwest) also spans Nevada
# and California, and DEAA (Arlington Valley) is generation-only (its demand column is blank), so both are named in
# the methods note instead of being summed into "Arizona" (PROPOSED; one line to change).
GRID_BAS = ("AZPS", "SRP", "TEPC")
GRID_BA_NAMES = {"AZPS": ("APS", "Arizona Public Service"), "SRP": ("SRP", "Salt River Project"),
                 "TEPC": ("TEP", "Tucson Electric Power")}
GRID_OTHER_AZ_BAS = {"WALC": "WAPA Desert Southwest (spans AZ, NV, CA)", "DEAA": "Arlington Valley (generation only)"}
GRID_ACCOUNT_NAME = "Arizona Grid Daily"
# EIA-930 hourly values are revised for about a day after first release (AUDIT_P2.md §4), so the post for day D goes
# out on the morning of D + 2, after a second reading of D agrees with the first one within these tolerances.
GRID_POST_LAG_DAYS = 2
GRID_REVISION_TOLERANCE = {"mw": 50.0, "share": 0.02}
GRID_SOURCE_URL = "https://www.eia.gov/electricity/gridmonitor/"
PRELIMINARY_EN = "EIA-930 hourly data are preliminary and may be revised."
PRELIMINARY_ES = "Los datos horarios del EIA-930 son preliminares y pueden cambiar."
CREDIT_EIA = ("U.S. Energy Information Administration, EIA-930", "Administración de Información Energética de EE. UU., EIA-930")
GRID_FUEL_NAMES = {"gas": ("gas", "gas"), "nuclear": ("nuclear", "nuclear"), "coal": ("coal", "carbón"), "solar": ("solar", "solar"),
                   "wind": ("wind", "eólica"), "hydro": ("hydro", "hidro"), "oil": ("oil", "petróleo"), "other": ("other", "otras"),
                   "storage": ("batteries", "baterías")}
WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
WEEKDAYS_ES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]

# Weekly river segment: Lake Powell (USGS 09379900) and Lake Mead (Reclamation, Lake Mead 921, parameter 49).
# Minimum power pools are REPORTED (search results 2026-09-26; usbr.gov is blocked here): Powell 3,490 ft, Mead
# about 950 ft. Confirm both on usbr.gov before the first post (THRESHOLD_LABELS_VALID_THROUGH applies to both).
RIVER_LAKES = {
    "powell": {"en": "Lake Powell", "es": "Lago Powell", "min_power_pool_ft": 3490.0, "credit": "USGS 09379900"},
    "mead": {"en": "Lake Mead", "es": "Lago Mead", "min_power_pool_ft": 950.0, "credit": "Reclamation (Lake Mead)"},
}
KINDS.update({"grid": "az-grid-daily", "river-weekly": "river-weekly"})
