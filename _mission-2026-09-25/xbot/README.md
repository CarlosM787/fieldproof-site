# Daily data-visual X bot: pipeline, approval queue and replays (dry run)

Built 2026-09-25/26 and hardened 2026-09-26 (phase two). **Nothing has been posted. No X account, app
or credential was created or used.** Phase two added the audit (`AUDIT_P2.md`) and Carlos's launch
checklist (`LAUNCH_CHECKLIST_P2.md`).

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

**Status.** The river posts (daily and weekly) are built end to end. The grid chart and its EIA-930
adapter now work on a real EIA file; the grid's post text and fact-check are the next build step
(checklist step 9).

## What is built (`bot/`)

`fetch → validate → metrics → compose → fact-check → render → queue → posted log → approval → publish → log`

| Stage | Behaviour |
|---|---|
| fetch (`sources.py`) | Official keyless sources with retries: the USGS Water Data API first (USGS says its legacy NWIS services retire in late 2026), then legacy NWIS, then Reclamation. The first fresh, non-empty series wins, and sources passed over are logged. EIA-930 balance-file adapter (grid) checked against a real 2026 file. A clearly labelled third-party-mirror reader exists only for this sandbox. |
| validate (`checks.py`) | Order and duplicates, freshness (newest value ≤ 2 days old), plausible range, day-over-day jumps > 1.5 ft, ≥ 27 of the last 30 days present; the weekly post needs 6 of its 7 days. Refuses to post after 2026-12-31 until the threshold wording is re-checked. Stale → **skip** (exit 3); bad → **stop** (exit 4). |
| compose (`compose.py`) | English then Spanish in one post, calm wording, one rotating second fact (a year ago / 30 days / the 3,525 ft target) so daily posts don't repeat; a weekly variant (level, 7-day change, buffer, a year ago). ASCII signs, because X counts "−" as two characters. Drops an extra fact rather than truncating. Alt text names the source and says recent values are provisional, in both languages. |
| fact-check (`checks.py`) | Re-derives every number independently from the raw series and blocks the post if any number doesn't trace, if it has a URL, if it exceeds 280 X-weighted characters, if the date is missing in either language, or if the alt text lacks the provisional note or exceeds X's 1,000 characters. |
| render (`render.py`) | 1600×900 PNG. The shaded band is the water above the 3,490 ft minimum power pool, so the headline number is the picture; a faint line shows a year earlier; the weekly post shades its seven days. The source line is on the image, not a link in the post. `render_grid` draws a day of generation by fuel with storage charging below zero. |
| posted log (`ledger.py`) | Append-only. Refuses a second post for the same data date (per series), older data, and any text identical to one posted in the last 30 days. Writes `attempt`/`posted` around the create-post call, so a crash can't double-post. |
| queue (`queue.py`, `approval.py`) | `python -m bot.queue build` renders N mornings into a folder with `APPROVAL_QUEUE.md`, `index.html` (contact sheet) and `queue.json`, and flags identical texts and repeated data dates. `python -m bot.queue publish` posts one morning, only with `--live` and a per-date line in `APPROVED_TO_POST` carrying that post's approval code (a hash of text, alt text and image). |
| publish (`publish.py`, `xauth.py`) | **Dry run by default.** Live needs `--live`, a matching approval, a clear posted log, and a user token from an OAuth 2.0 refresh. X access tokens last 2 hours and refresh tokens are single-use, so the rotated one is saved for the workflow to store. Uses the v2 media upload, alt text and create-post endpoints. |
| grid (`grid.py`) | One local day of AZPS + SRP + TEPC by fuel, refused unless all 24 hours are complete; a provenance stamp is required. |

Commands:
```bash
python -m bot.queue build --out runs --days 1                     # this morning, official sources, dry run
python -m bot.queue publish --queue runs                          # what would post (add --live to post)
python -m bot.run_daily --out runs --cadence weekly --weekday fri # weekly segment (other days do nothing)
python -m bot.replay --repo <mirror clone> --from 2026-09-12 --to 2026-09-25 --out <private dir>
python -m bot.authorize --redirect-uri http://localhost:8080/callback --out ~/x_refresh_token   # once, on Carlos's PC
```

Tests: `python -m unittest discover -s tests -t .` → **45/45 pass**, with no network (X calls are
mocked). Among them: a post composed and fact-checked for **every day of the past year** of real
data, and a weekly post for every week.

## Samples (kept private; not in git)

This repository is public, so rendered posts, mirror caches and queues stay in Carlos's private
mission report. Replays read a third-party GitHub mirror of the official USGS series (site 09379900),
because this sandbox's network blocks usgs.gov and eia.gov. Production reads USGS or Reclamation
directly.

- **7-day sample** (phase one): Sat Sep 19 to Fri Sep 25, 2026. All seven passed, at 240–276 weighted
  characters.
- **14-morning approval queue** (phase two): Sat Sep 12 to Fri Sep 25, 2026.
  - All 14 are ready. Fact-check failures: 0. Identical texts: 0. Length: 240–276 X-weighted
    characters.
  - The weekly variant has 2 posts (Fridays Sep 18 and Sep 25), each 269 characters.
- **Grid sample**: Sat Aug 22, 2026, from a third-party copy of EIA's balance file, through the fixed
  adapter, stamped as a copy (see AUDIT_P2.md §12). The phase-one design mock keeps its SYNTHETIC
  stamp.

Thresholds (3,490 ft minimum power pool; 3,525 ft protection target from the 2019 drought agreement)
are REPORTED: widely published Reclamation figures, confirmed here only through third-party code.
Check them on usbr.gov before the first live post, and again before Jan 1, 2027.

## X rules this follows (from X's own docs, read from the xdevplatform/docs repo)

- Pay-per-use API: $0.015 per post, **$0.20 if the post contains a URL**, $0.005 for alt text,
  $0.001 per read of your own posts. So: no links in posts; links live in the bio.
- Automated accounts: turn on the **Automated** label linked to Carlos's own account, say so in the
  bio, official API only, no identical posts, reply only when summoned. Captions come from fixed
  templates, not an LLM, so X's AI-content approval does not apply.
- OAuth 2.0 access tokens expire after 2 hours and refresh tokens rotate. X says OAuth 1.0a is being
  retired.
- Creator Revenue Sharing ended on Sep 7, 2026. Its replacement, Original Content Rewards, reportedly
  excludes content "created or posted using automated means", so X payouts are **not a money path**
  for this bot.
- Open: whether media uploads are billed; the minimum credit purchase; the OAuth 1.0a retirement date.

## Economics and launch

First month: metered X usage ≈ $0.60–3.25, and the cash out is the $5–10 prepay. Set a $10 spending
limit and leave auto-recharge off. GitHub Actions costs $0 (a private repo uses about 150–210 of its
2,000 free minutes). No Premium is needed. The dated, step-by-step plan is in `LAUNCH_CHECKLIST_P2.md`:
account, app, token, repository, one open-network dry run, 14 days of per-post approval, then a
standing approval renewed monthly.

**30 / 60 / 90** (from the decision sheet):
- **Day 30:** posted ≥ 27 of 30 days, 0 wrong-data posts, spend ≤ $10, and one of (a post ≥ 1,000
  impressions, ≥ 50 followers, ≥ 10 newsletter sign-ups).
- **Day 60:** ≥ 200 followers, median impressions ≥ 2× day 30, ≥ 25 subscribers.
- **Day 90:** ≥ 1 paid commitment, or ≥ 100 subscribers with ≥ 40% opens, or ≥ 3 qualified leads.
- **Stop at day 60:** median < 150 impressions, < 100 followers and no inbound.

Dry-run posts prove the pipeline, not demand.

Font: IBM Plex Sans Condensed and IBM Plex Mono (SIL Open Font License, `fonts/FONTS_LICENSE.txt`).
