# Daily data-visual X bot: pipeline + seven-day sample (dry run)

Built 2026-09-25/26. **Nothing has been posted. No X account, app or credential was created or used.**

## The concept

The research lane scored 11 daily-data concepts (energy, water, border, heat, space, launches,
markets, fire, music, public spending). Full scoring: `XBOT_RESEARCH.md` in Carlos's private mission
folder.

| | Concept | Score | Why |
|---|---|---|---|
| **Lead** | **Arizona Grid Daily**: yesterday's generation by fuel for APS, SRP and TEP (EIA-930), with solar share and the evening peak, EN/ES | 4.07 / 5 | Fits an electrical engineer; fresh every day; public-domain data; a strong visual (the solar "belly" and the evening gas ramp); sponsor fit with solar, storage and EE firms |
| **Challenger** | **Colorado River Daily**: Lake Powell and Lake Mead against their operating thresholds | 3.75 / 5 | High curiosity across the Southwest; public data; but the lake moves about 0.1 ft a day, so it works better as a **weekly** segment in the same account |

Switch rule (from the research): make the river the lead if its posts earn ≥ 1.5× the median
impressions and ≥ 2× the follows per post over ≥ 8 posts each, or if the grid data is late or
incomplete on > 10% of days.

## What is built (`bot/`)

`fetch → validate → metrics → render → compose → fact-check → queue → publish → log`

| Stage | Behaviour |
|---|---|
| fetch (`sources.py`) | Official keyless sources with retries and backoff: USGS NWIS (Powell), Reclamation hydrodata (Powell, Mead), EIA-930 bulk file (grid). A clearly labelled third-party-mirror reader exists only for this sandbox. |
| validate (`checks.py`) | Order and duplicates, freshness (newest value ≤ 2 days old), plausible range, day-over-day jumps > 1.5 ft, ≥ 27 of the last 30 days present. Stale data → **skip** (exit 3); bad data → **stop** (exit 4). |
| render (`render.py`) | 1600×900 PNG. The shaded band is the water above the 3,490 ft minimum power pool, so the headline number is the picture; a faint line shows a year earlier. Source line on the image, not a link in the post. |
| compose (`compose.py`) | English then Spanish in one post, calm wording, one rotating second fact (a year ago / 30 days / the 3,525 ft target) so posts don't repeat. ASCII signs, because X counts "−" as two characters. Drops the extra fact rather than truncating. |
| fact-check (`checks.py`) | Re-derives every number independently from the raw series and blocks the post if any number doesn't trace, if it has a URL, if it exceeds 280 X-weighted characters, or if the date is missing in either language. |
| queue / log | `post.json` (text, alt text EN/ES, image, source, data hash, cost estimate) and `log.jsonl` per day. |
| publish (`publish.py`) | **Dry run by default.** Live needs the `--live` flag **and** an `X_USER_TOKEN` **and** a file `APPROVED_TO_POST` containing that day's date. Uses the v2 media upload, alt text and create-post endpoints. |

Tests: `python -m unittest discover -s tests -t .` → **10/10 pass**, including one that composes and
fact-checks a post for **every day of the past year** of real data (366 posts, all ≤ 280 weighted
characters, every number traced).

## The seven-day sample (`sample/`)

A replay of what the bot would have posted each morning from **Sat Sep 19 to Fri Sep 25, 2026**,
using only the data that existed that morning: each day reads that day's commit of a third-party
GitHub cache of the official USGS series (site 09379900, lake elevation). The sandbox's network
policy blocks usgs.gov and eia.gov, which is why the mirror was used. Production reads USGS or
Reclamation directly.

| Post morning | Data for | Level | Post (English line) |
|---|---|---|---|
| Sep 19 | Sep 18 | 3,516.6 ft | no change in a day; 26.6 ft above the minimum power pool; 8.4 ft below the 3,525 ft target |
| Sep 20 | Sep 19 | 3,516.7 ft | +0.1; 26.7 ft above; a year ago 3,545.6 |
| Sep 21 | Sep 20 | 3,516.9 ft | +0.2; 26.9 ft above; 30 days −2.1 ft |
| Sep 22 | Sep 21 | 3,517.1 ft | +0.2; 27.1 ft above; 7.9 ft below the target |
| Sep 23 | Sep 22 | 3,517.3 ft | +0.2; 27.3 ft above; a year ago 3,545.3 |
| Sep 24 | Sep 23 | 3,517.4 ft | +0.1; 27.4 ft above; 30 days −1.1 ft |
| Sep 25 | Sep 24 | 3,517.5 ft | +0.1; 27.5 ft above; 7.5 ft below the target |

All seven passed validation and fact-check (240–276 weighted characters). The rendered images,
post bundles and contact sheet are kept **private** (Carlos asked for a private sample; this
repository is public): they are in his private mission report, not in git. Every image is stamped
"SAMPLE · DRY RUN · NOT POSTED". Re-create them with
`python -m bot.replay --repo <clone of the mirror> --from 2026-09-19 --to 2026-09-25 --out sample`.

A design mock of the lead concept's layout, with **made-up numbers** stamped as such, is also in the
private report. The grid adapter (`parse_eia930_balance`) is written but **untested against a real
EIA file**; the first real grid sample needs an open network (one command, below).

Thresholds (3,490 ft minimum power pool; 3,525 ft protection target from the 2019 drought
agreement) are REPORTED: widely published Reclamation figures, confirmed here only through
third-party code. Check them on usbr.gov before the first live post.

## X rules this follows (from X's own docs, read from the xdevplatform/docs repo)

- Pay-per-use API: $0.015 per post, **$0.20 if the post contains a URL**, $0.005 for alt text,
  $0.001 per read of your own posts. So: no links in posts; links live in the bio.
- Automated accounts: turn on the **Automated** label linked to Carlos's own account, say so in the
  bio, official API only, no identical posts across accounts, reply only when mentioned.
- Creator Revenue Sharing was retired on Sep 7, 2026; its replacement needs Premium, ≥ 500
  verified followers and ≥ 500k verified impressions in 90 days. **Not a 90-day money path.**
- Open: whether media uploads are billed as posts; the minimum credit top-up.

## Economics (first 30 days, 30–60 image posts)

Metered X usage ≈ $0.60–3.90; prepay $5–10 with a monthly cap; GitHub Actions $0 on a public repo
(about 90 minutes a month); optional X Premium $8/month later. Cash ≈ **$5–18**. Carlos's time: a few
hours of setup, then about 1–2 hours a week. No audience numbers are promised; the research found no
verified growth benchmarks, so days 1–14 set the baseline.

**30 / 60 / 90** (pass thresholds from the research): day 30: posted ≥ 27 of 30 days, 0 wrong-data
posts, spend ≤ $10, and one of (a post ≥ 1,000 impressions, ≥ 50 followers, ≥ 10 newsletter sign-ups);
day 60: ≥ 200 followers, median impressions ≥ 2× day 30, ≥ 25 subscribers; day 90: ≥ 1 paid
commitment (sponsor, data, consulting) or ≥ 100 subscribers with ≥ 40% opens or ≥ 3 qualified leads.
**Stop rule:** day 60 with median < 150 impressions, < 100 followers and no inbound contact → stop or
re-point at the challenger. Money paths that don't depend on X: a weekly "Arizona Grid Brief"
newsletter, sponsor slots, EE consulting, a clean Arizona dataset or alert product, chart licensing.

## One-time setup (Carlos only; about an hour)

1. Decide the account: a dedicated account (e.g. an "Arizona Grid Daily" handle) with the Automated
   label linked to Carlos's personal account. Never an account that imitates anyone else.
2. developer.x.com → create a project and app (pay-per-use) → prepay $5–10 → set a monthly spending
   cap.
3. Create an OAuth 2.0 user token for the bot account (scopes: `tweet.write`, `users.read`,
   `media.write`, `offline.access`). Store it only as a GitHub Actions secret `X_USER_TOKEN`.
4. Approve a home for the bot (a small repo; the control room's "no new repo" rule means this is
   Carlos's call). Copy `bot/`, `fonts/`, `tests/` and `workflow/daily.yml.template` →
   `.github/workflows/daily.yml`.
5. First run on an open network: `python -m bot.run_daily --out runs` (dry run), and the research
   lane's `endpoint_smoketest.py` to confirm EIA-930 freshness.
6. First 14 days: approve each post (`APPROVED_TO_POST` with the date) before setting `LIVE=true`.

Font: IBM Plex Sans Condensed and IBM Plex Mono (SIL Open Font License, `fonts/FONTS_LICENSE.txt`).
