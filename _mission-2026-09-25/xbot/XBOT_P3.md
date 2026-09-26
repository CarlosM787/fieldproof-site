# X bot, phase three: Arizona Grid Daily, the weekly river segment, and a sample approval queue

**Date:** 2026-09-26. **Status:** code and a private sample only. **No X account or app was created, no
credit was bought, nothing was posted.** Code: `xbot/` in this lane (a copy of
`_mission-2026-09-25/xbot` at mission branch `387b45c`, plus the files in §7).

Labels: **VERIFIED** = read or run here today, with the source; **REPORTED** = a search extract or a
third-party copy, named; **INFERENCE**; **OPEN**; **PROPOSED**. Search extracts are from 2026-09-26.

## 1. What X says today (checked 2026-09-26)

Primary source: `github.com/xdevplatform/docs`, the source of docs.x.com, cloned today at
`3ef050bd395f` (committed 2026-09-26 02:09 UTC; the same head phase two read, so nothing changed since).

| Question | Answer | Label and source |
|---|---|---|
| Pricing model | Pay-per-use credits bought in the Developer Console: "No contracts, subscriptions, or minimum spend." Spending limit per billing cycle; optional auto-recharge; the balance "can go slightly negative". | VERIFIED `x-api/getting-started/pricing.mdx` |
| Prices | Post create **$0.015**; with a URL **$0.200**; summoned reply $0.010; Media Metadata (alt text) **$0.005**; Post read $0.005; Owned Reads $0.001; 3M post reads a month cap | VERIFIED same file |
| Tiers? | The docs describe only pay-per-use (plus Enterprise). Search extracts say that as of September 2026 new sign-ups get no Free, Basic or Pro tier. | VERIFIED (docs); REPORTED (Blotato, Postproxy and others via search) |
| Is the media upload billed? Minimum purchase? Do credits expire? | Not in the price table | OPEN |
| Scopes to post | `POST /2/tweets` requires OAuth 2.0 scopes **`tweet.read`, `tweet.write`, `users.read`** (or an OAuth 1.0a user token); media upload and alt text need `media.write`; add `offline.access` for a refresh token. So yes: `tweet.read` is required alongside `tweet.write`. | VERIFIED `openapi.json` v2.168 (security of `createPosts`, `mediaUpload`, `createMediaMetadata`); REPORTED the same four scopes in search results |
| Automation rules | Turn on the **Automated** profile label; say in the bio that it is a bot and who runs it; link it to a human-managed account; official API only ("Non-API automation … results in permanent suspension"); scheduled informational posts are allowed; no unsolicited @mentions, no identical cross-posting; replies only if the user engaged first | VERIFIED `developer-guidelines.mdx`; REPORTED help.x.com "About Automated account labels" and "X's automation development rules" (search): the label connects the managing account (Settings → Your account → Account information → Automation → Managing account) |
| Rate limits | `POST /2/tweets` 10,000 per 24 h per app, 100 per 15 min per user; `POST /2/media/upload` and `/2/media/metadata` 50,000 per 24 h, 500 per 15 min. The bot needs 1–2 posts a day. | VERIFIED `x-api/fundamentals/rate-limits.mdx` |
| Creator payouts for automated posts | Original Content Rewards: content "created or posted using automated means" is ineligible; eligibility also needs Premium, 500 verified followers and 500,000 verified Home-timeline impressions in 90 days. **Not eligible, confirmed as far as search extracts go.** X payouts are not a money path for this bot. | REPORTED (help.x.com/en/using-x/original-content-rewards, @XCreators and coverage, via search; help.x.com is blocked here) |

## 2. Data rights

| Source | Terms | Label |
|---|---|---|
| EIA-930 (EIA) | "U.S. Government publications are in the public domain and are not subject to copyright protection. You may use and/or distribute any of our data…" EIA asks for an acknowledgment with the date (phase-two copy of the page). Credit used: "U.S. Energy Information Administration, EIA-930", plus "preliminary". | REPORTED: search extract of eia.gov/about/copyrights_reuse.php (the page is blocked here) |
| USGS (Lake Powell) | "USGS-authored or produced data and information are considered to be in the U.S. Public Domain"; USGS asks for credit; some images on USGS sites belong to others. | REPORTED: search extract of usgs.gov "Copyrights and Credits" |
| Reclamation (Lake Mead) | Reclamation's GitHub files are U.S. government works under 17 U.S.C. §105; terms specific to the hydrodata: OPEN. | VERIFIED phase two (usbr/READ-ME); OPEN for the data |
| The copies used here | Third-party GitHub copies with no licence file. Used only for this sandbox sample, with their true dates, and stamped on every image. Never a production source. | VERIFIED (phase two tree listings) |

## 3. The balancing authorities (VERIFIED in the data)

In the cached third-party copy of EIA's `EIA930_BALANCE_2026_Jul_Dec.csv` (sha256 `f94cde6b…bf20`, data Jul 1
to Aug 23, 2026): **AZPS, SRP, TEPC and WALC** have 1,296 hourly rows each (54 days); **DEAA** has 1,272 and a
blank demand column in every hour (a generation-only authority); **HGMA, GRIF and GRMA are absent**. The adapter
and config post **AZPS + SRP + TEPC** (APS, SRP, TEP). WALC (WAPA Desert Southwest, which also spans Nevada and
California) and DEAA are named in the methods note instead of summed into "Arizona" (PROPOSED;
`config.GRID_BAS` is one line). Names and regions are REPORTED (a third-party list; EIA's reference table is
blocked here). OPEN: confirm the list against EIA's reference tables on the PC.

## 4. Arizona Grid Daily, refined (built and tested)

`bot/grid_post.py`:
- **Post:** English then Spanish, at most 280 X-weighted characters, no URL. The day's generation mix (top four
  sources), then one rotating fact keyed on the date so days don't repeat: peak demand and hour, solar peak and
  hour, net imports (or exports), or battery energy returned. Example (Sat Aug 22, 2026, third-party copy):
  > Arizona grid (APS+SRP+TEP), Sat Aug 22: gas 45%, nuclear 26%, coal 16%, solar 12% of generation. Net imports: 7,092 MWh.
  >
  > Red de Arizona (APS+SRP+TEP), sáb 22 ago: gas 45%, nuclear 26%, carbón 16%, solar 12% de la generación. Importación neta: 7,092 MWh.
- **Image (1600×900):** generation by source hour by hour, storage charging below zero, demand dashed; title =
  the mix; subtitle = date, peak demand and hour, net imports. **Source links:** the image's source line names
  EIA-930 and prints `https://www.eia.gov/electricity/gridmonitor/`; the approval page links it and the balance
  file. The post itself carries no link ($0.20 instead of $0.015); PROPOSED: the link goes in the bio and a
  pinned methods post.
- **Alt text (834 characters, EN + ES):** the chart described, the mix, the peak and its hour, the credit and
  "EIA-930 hourly data are preliminary and may be revised" in both languages.
- **Fact-check (blocks on any problem):** recomputes everything from the raw per-authority rows with its own
  loops; checks every "fuel N%" pair (a swapped fuel fails), the peak MW and its hour label, the date in both
  languages, no URL, length, alt text length, the preliminary note and the credit; any other number must trace.
- **Completeness gate:** 24 hours for every authority, fuels adding up to net generation (phase-two gate).
- **Second reading:** EIA-930 hours move for about a day (phase two, REPORTED). The post for day D is queued for
  the morning of D + 2 and should go out only if that reading agrees with the D + 1 reading
  (`revision_issues`: per hour, 50 MW or 2%; shares within 1 point). Tested. The sample has one snapshot, so each
  card says "second reading: not available".

## 5. Weekly river segment: Lake Powell + Lake Mead (built and tested)

`bot/river.py`: the seven days ending on the newest day both series have; per lake the level, the feet above its
minimum power pool (3,490 ft Powell; about 950 ft Mead, REPORTED from search extracts), and the week's change
(in the post when it fits, always in the alt text and image). Two-panel chart, one per lake, over the shaded water
above each pool. Mead is parsed from Reclamation's CSV (`sources.parse_usbr_csv`); in this sandbox a third-party
mirror held seven days (Aug 30–Sep 5, 2026), so the sample week is the week to Sep 5, posted Sun Sep 6.
Both thresholds must be confirmed on usbr.gov before the first post, and the wording re-checked after Dec 31, 2026.

## 6. The sample approval queue (private, not in git)

`media/xbot-queue-p3/index.html` (static page, 8 PNGs, `APPROVAL_QUEUE.md`, `queue.json`). Built with:
`python -m bot.sample_queue --eia-file <copy of EIA930_BALANCE_2026_Jul_Dec.csv> --grid-from 2026-08-16 --grid-to 2026-08-22 --powell-csv sample/usgs_09379900_lake_elevation_ft.csv --mead-mirror <mirror json> --river-as-of 2026-09-06 --out <dir> --eia-note "..."`
(13.5 s here). Every image is stamped THIRD-PARTY COPY / REPLAY · NOT POSTED. Result (VERIFIED): **8 of 8
ready, 0 fact-check failures, 0 identical texts**, 248–278 X-weighted characters, alt text 834–837 characters,
$0.16 metered if all eight were posted. The page has no horizontal scroll at 390 px (VERIFIED, Playwright).

| Morning | Post | Data | Chars | Second fact | Approval line (template) |
|---|---|---|---|---|---|
| Tue Aug 18 | grid | Aug 16 | 273 | peak demand | `2026-08-18 17655ba6676b` |
| Wed Aug 19 | grid | Aug 17 | 269 | solar peak | `2026-08-19 55f53383fe72` |
| Thu Aug 20 | grid | Aug 18 | 248 | net imports | `2026-08-20 b6c6342de768` |
| Fri Aug 21 | grid | Aug 19 | 269 | batteries | `2026-08-21 76fb333f14d4` |
| Sat Aug 22 | grid | Aug 20 | 273 | peak demand | `2026-08-22 312d3c205dab` |
| Sun Aug 23 | grid | Aug 21 | 268 | solar peak | `2026-08-23 85956444543b` |
| Mon Aug 24 | grid | Aug 22 | 254 | net imports | `2026-08-24 811a5d0f2df9` |
| Sun Sep 6 | river weekly | week to Sep 5 | 278 | – | `2026-09-06 4af2526f76ab` |

An approval line is the morning plus a 12-character hash of the exact text, alt text and image; it goes into
`APPROVED_TO_POST`. The guarded publisher (`python -m bot.queue publish --cadence grid|river-weekly`) accepts a
line only for today's or yesterday's morning, so these are templates, not approvals.

## 7. Code and tests

New: `bot/grid_post.py`, `bot/river.py`, `bot/sample_queue.py`, `tests/test_p3.py`, SYNTHETIC fixtures
(`tests/fixtures/eia930_balance_SYNTHETIC_full_day.csv` from `make_synthetic_grid_day.py`,
`tests/fixtures/usbr_mead_SYNTHETIC.csv`). Changed: `bot/config.py` (grid and river settings),
`bot/run_daily.py` (folder names per series), `bot/queue.py` (`publish --cadence grid|river-weekly`).

`python -m unittest discover -s tests -t .` (from `xbot/`) → **Ran 56 tests, OK (skipped=1)**, VERIFIED
09:40 UTC: the **45 existing tests pass unchanged**; 11 new (10 run; the real-file test is skipped unless
`XBOT_EIA930_FILE` points at an EIA-930 file, and passes on the cached copy). New tests cover hour labels, all
four rotations, the mix against an independent sum, tampering (fuel swap, peak, URL, date, alt note, hour), an
incomplete day, the second reading, the approval code, the river week (and tampered, stale and short weeks), the
sample page's approval lines, and a grid post publishing once only with its line (X calls mocked).

## 8. Cost (VERIFIED prices; volume INFERENCE)

One grid post a day plus one river post a week is about 34 posts a month: 34 × ($0.015 + $0.005) = **$0.68 a
month**, plus up to $0.51 if the media upload is billed like a post (OPEN). Cash out is the smallest credit
purchase (OPEN). No Premium: automated content is reported ineligible for payouts.

## 9. Open items and next actions

| Owner | Action |
|---|---|
| Carlos | Decide whether to run an X account at all. If yes: `LAUNCH_CHECKLIST_P2.md` steps 1–8; step 9 (grid text and fact-check) is now built |
| Carlos (PC, open network) | Download the official EIA file; run `python -m bot.sample_queue ... --official` for the last 7 complete days; re-run the next morning to exercise the second reading; confirm the balancing authorities in EIA's reference tables |
| Carlos | Confirm on usbr.gov: Powell 3,490 and 3,525 ft; Mead about 950 ft |
| Mission session | Merge `xbot/` changes into the mission branch if accepted (tests: 56, 1 skipped) |
