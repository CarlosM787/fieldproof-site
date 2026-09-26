# AUDIT_P2: daily data-visual X bot, phase-two audit

Audited 2026-09-26 (UTC) in the mission sandbox, branch `mission/p2-xbot`. Nothing was posted. No
account, app, credential or purchase was made. X was not scraped.

## How to read the labels

| Label | Meaning in this audit |
|---|---|
| **VERIFIED** | I read the publisher's own text in this session. The source is a URL or `repo@commit:path` with the commit date. X's docs were read from `github.com/xdevplatform/docs`, the source of docs.x.com. USGS text came from USGS's own GitHub organization (DOI-USGS). GitHub facts came from `github.com/github/docs`. |
| **REPORTED** | Someone else says it. That means a third-party copy or mirror, a search-engine extract of an official page I could not open, or prior knowledge (marked as such). |
| **INFERENCE** | My reasoning from the above. |
| **OPEN** | Not verified, or not verifiable from this sandbox. |

**Network.** Unchanged from phase one. The proxy refused x.com, help.x.com, docs.x.com, api.x.com,
eia.gov, usgs.gov (including waterservices.usgs.gov), usbr.gov and treasury.gov. github.com and
raw.githubusercontent.com worked. Web search answered 3 queries today. help.x.com stayed blocked for
direct reads.

---

## 1. What changed since phase one

The phase-one research is `research/xbot/XBOT_RESEARCH.md`, written against xdevplatform/docs @3ef050bd.

| # | Topic | Phase one | Now | Label | Done |
|---|---|---|---|---|---|
| 1 | **X token** | Store "an OAuth 2.0 user token" as the secret `X_USER_TOKEN`. | OAuth 2.0 access tokens "expire after **2 hours**". The refresh token is "valid for about 6 months and single-use; each refresh returns a new one". A stored access token would fail on the first scheduled run. | VERIFIED | `bot/xauth.py` refreshes the token and saves the rotated refresh token first. The workflows store it back with `gh secret set`, using a separate fine-grained token, because `GITHUB_TOKEN` cannot write secrets. |
| 2 | **Scopes** | `tweet.write users.read media.write offline.access` | `POST /2/tweets` requires `tweet.read tweet.write users.read`, and media upload requires `media.write`. | VERIFIED | Launch checklist uses the full set. |
| 3 | **OAuth 1.0a** | "don't expire; whether v2 media accepts it is OPEN" | v2 media upload and create-post accept it (`UserToken`). But since Sep 21, 2026 X says "OAuth 1.0a is being retired", with no date. | VERIFIED; date OPEN | Build on OAuth 2.0 only. |
| 4 | **USGS source** | Legacy NWIS `waterservices.usgs.gov` first. | USGS: "NWIS Water Services will be retired (scheduled late 2026, but uncertain)". That could fall inside the first 90 days. | VERIFIED | USGS Water Data API goes first (parser tested on a recorded USGS response), then NWIS, then Reclamation. The freshest non-empty source wins. |
| 5 | **EIA-930 adapter** | "written but untested against a real EIA file" | On a real 2026 balance file it added the as-reported, imputed and adjusted copies of every fuel column. Its totals were a median **2.0×** EIA's net generation, up to 8.3×. It dropped battery and unknown storage, and it read blank hours as **0**. The newest day in the file is blank, so it would have charted zero generation. | VERIFIED on the file; file provenance REPORTED | Adapter rewritten. The new totals match EIA's net generation within 8 MW in all 3,816 complete hours. A completeness gate refuses incomplete days. |
| 6 | **EIA-930 revisions** | "preliminary and may be revised" | In a third-party daily mirror, AZPS hourly demand changed for 33 of 221 hours seen twice. Some changed by 35–85% within a day of first appearing. | REPORTED | The grid plan now waits for a complete day and a second reading (§4). |
| 7 | **Duplicate posts** | A `posted_log.json` was planned, not built. | Without it, a source that had not moved on passed validation (age ≤ 2 days). Because the rotating fact is keyed on the data date, the bot would have posted the **same text** again. The mirror history has such a pair: its caches labelled (UTC) Aug 28 and Aug 29 both end on Aug 27. The second was taken at 06:23 UTC, before Aug 28 was published. | REPORTED + INFERENCE | `bot/ledger.py` plus a queue-level check. The Aug 27–30 replay now blocks the repeat. |
| 8 | **Alt text** | Cut at 1,000 characters in `publish.py`. No provisional note. | X's limit is 1,000 characters, and cutting could drop the Spanish half. USGS calls recent values "Provisional … subject to revision". | VERIFIED | Every alt text now carries the source and the provisional note in both languages. The fact-check refuses a missing note or more than 1,000 characters. Nothing is truncated. |
| 9 | **X payouts** | Original Content Rewards eligibility REPORTED; "OPEN whether Automated-label accounts can join". | Search extracts of X's program page list content that "was created or posted using automated means" as ineligible. | REPORTED | Plan: X payouts are **not a money path for this bot at all**, not merely "not within 90 days". |
| 10 | **Threshold wording** | "3,525 ft protection target (2019 drought agreement)" | The 2019 drought agreements run with the 2007 Interim Guidelines through the end of 2026 (prior knowledge). The label may be outdated from Jan 1, 2027, which is before day 90. | REPORTED | Validation refuses to post after 2026-12-31 until a human re-checks the wording and moves `THRESHOLD_LABELS_VALID_THROUGH`. |
| 11 | **Spend control** | "prepay $5–10, set a monthly cap"; minimum top-up OPEN | The console has a per-billing-cycle spending limit and an optional auto-recharge. The balance "can go slightly negative", and requests are blocked at the limit or at zero. Failed requests are not billed. The minimum purchase is still not stated. | VERIFIED; minimum OPEN | Checklist: spending limit on, auto-recharge off. |
| 12 | **X docs head** | 3ef050bd | Still 3ef050bd at 2026-09-26 06:20 UTC. There is nothing newer to diff, and the prices and rules are unchanged. | VERIFIED | none needed |

---

## 2. Evidence base

| Source | Commit (date) | What was used |
|---|---|---|
| github.com/xdevplatform/docs, the source of docs.x.com | `3ef050bd395fd7bfad74fb8f218edbb232726b8c` (2026-09-26 02:09 UTC). HEAD when re-read at 06:20 UTC. | pricing, usage and billing, rate limits, media, OAuth 2.0 pages, developer guidelines, developer policy and agreement, changelog, `openapi.json` v2.168 |
| github.com/DOI-USGS/dataRetrieval (USGS's R package) | `ad9deab6b548f778dd93fee46667964d85a6dd89` (2026-09-24) | NWIS retirement notice, data citation, provisional statement |
| github.com/DOI-USGS/dataretrieval-python (USGS) | `75e56ab67f1eff1dfdd1076d4cf5d54290dc9f32` (2026-09-14) | Water Data API client, `approval_status`, API-key advice, NWIS deprecation, LICENSE, recorded API response (test fixture) |
| github.com/github/docs | `18945a31a4f2d97beb6c5c1a7479102e23c25727` (2026-09-25) | schedule behaviour, 60-day disable, billing, `GITHUB_TOKEN` permissions and triggers |
| github.com/usbr/READ-ME (Reclamation) | `359e48e34c7754410d73d975ee6491c7b01dcd4d` (2024-06-06) | public-domain statement for Reclamation's GitHub files; the move to the DOI-BOR org |
| github.com/EIAgov/EIAgov (EIA) | `92bc5b3a619ff0f262e0cf2b9b3915198e672f27` (2025-02-05) | EIA's licence for code; no data terms there |
| github.com/ebootheee/powell, a **third-party** mirror of USGS 09379900 | `4a08dc2c0368dd5fd3339ea0a72e54a482a61c14` (2026-09-25 11:30 UTC) | 14-morning replay; 32 daily caches for the revision check |
| github.com/Masternode77/ai-news-portal, a **third-party** EIA-930 demand mirror | `893de2b3aeb120dc18ca0d9f3888c2de40fd90de` (2026-09-26 05:27 UTC) | history of `src/data/grid/demand.json` (12 snapshots) |
| github.com/shenyaoqiang45/power-infrastructure, a **third-party** copy of EIA's file | `cfccb162699f994d1422de2b2af235c63cc0b02f` (2026-08-24) | `EIA930_BALANCE_2026_Jul_Dec.csv` (sha256 `f94cde6b…bf20`) |
| github.com/datasets/oil-prices, a **third-party** copy of EIA's reuse text | `ec51547f9f18f439482312353a03486d5eddc801` | README quote |
| github.com/xdevplatform/xurl (X's own CLI) | `f70cf7d3233b2b1dd46941f58c87e4b5cc3b725c` (2026-09-24) | the scopes its OAuth 2.0 login requests (`auth/auth.go`); README note on the Pay-per-use package and Production environment |
| Web search, 3 queries, 2026-09-26 | none | extracts of help.x.com pages on Original Content Rewards and monetization standards |

None of the mirror data is committed. The replay caches, renders and the EIA file copy stay in the
private scratchpad.

---

## 3. Data rights and attribution

### USGS (Lake Powell, site 09379900)
- **VERIFIED** (DOI-USGS/dataretrieval-python@75e56ab:LICENSE.md): "this project is in the public
  domain in the United States because it contains materials that originally came from the United
  States Geological Survey … see the official USGS copyright policy at
  https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits". This is USGS's
  statement about its own software. It points to the data policy page, which is blocked here.
- **REPORTED** (prior knowledge; the page is blocked): USGS treats USGS-authored data as U.S. public
  domain and asks for credit.
- **VERIFIED** (DOI-USGS/dataRetrieval@ad9deab:vignettes/dataRetrieval.Rmd line 553, R/citations.R):
  USGS's own citation format is "U.S. Geological Survey, 2026, USGS Water Data for the Nation: U.S.
  Geological Survey National Water Information System database, accessed [date], at
  http://dx.doi.org/10.5066/F7P55KJN".
- **VERIFIED** (dataretrieval-python@75e56ab:dataretrieval/waterdata/time_series.py, `get_daily`
  docstring): "Provisional data are released on the condition that neither the USGS nor the United
  States Government may be held liable for any damages resulting from their use."
- **INFERENCE**: commercial reuse is fine. Credit in the image source line, in the alt text ("Data:
  USGS") and in the full citation on a pinned post or methods page. Keep "Not an official product"
  on the image. All of this is now in the code, except the pinned post, which is a checklist step.

### Bureau of Reclamation (Powell fallback; Mead later)
- **VERIFIED** (usbr/READ-ME@359e48e, 2024-06-06): "Unless otherwise specified, FILES as originally
  published constitutes works of the United States Government and are not subject to domestic
  copyright protection under 17 USC § 105." This covers Reclamation's GitHub files. The same notice
  says the organization moved to DOI-BOR in June 2024.
- **INFERENCE**: the same statute covers Reclamation's hydrodata. **OPEN**: I read no terms specific to
  the data (usbr.gov is blocked). When the Reclamation fallback is used, the alt text and source line
  now credit "U.S. Bureau of Reclamation".
- **REPORTED**: the thresholds are 3,490 ft (minimum power pool) and 3,525 ft (the protection target
  of the Drought Response Operations Agreement). Sources: the mirror's `scripts/cache-data.mjs`, and
  prior knowledge. Confirm them on usbr.gov before the first live post, as phase one also said.
  Re-check the wording at the end of 2026 (§1, item 10).

### EIA-930 (Arizona Grid Daily)
- **REPORTED** (a verbatim copy in datasets/oil-prices@ec51547, README, citing
  eia.gov/about/copyrights_reuse.cfm; the EIA page is blocked): "U.S. government publications are in
  the public domain and are not subject to copyright protection. You may use and/or distribute any
  of our data … you should use an acknowledgment, which includes the publication date, such as:
  'Source: U.S. Energy Information Administration (Oct 2008).'" Unchanged from phase one.
- **VERIFIED** (EIAgov/EIAgov@92bc5b3:README.md): "All EIA projects will be released under Apache
  2.0". This is about code. EIA's GitHub has no data-reuse text.
- **INFERENCE**: the credit line for grid images should read "Source: U.S. Energy Information
  Administration, EIA-930 (retrieved <date>), preliminary".

### The mirrors used in this sandbox
- **VERIFIED** (tree listings at the commits in §2): ebootheee/powell, Masternode77/ai-news-portal and
  shenyaoqiang45/power-infrastructure have **no licence file**. The values are U.S. government data
  (REPORTED public domain), but the repositories are someone else's, so nothing from them is committed.
  They are used for sandbox evidence only and never as a production source.

---

## 4. Update cadence and provisional-data revisions

| Series | Finding | Label |
|---|---|---|
| USGS daily values | Each value carries `approval_status`: "Approved" or "Provisional, meaning the data are subject to revision" (`get_daily` docstring). | VERIFIED |
| USGS, observed | Across 32 daily mirror caches (2026-08-23 to 09-25), 1,127 dates were seen more than once. **None changed** at 0.1-ft resolution. | REPORTED (mirror) |
| USGS, observed | All 14 September mornings had the previous day's value by the mirror's commit time, 03:23–05:25 MST (10:23–12:25 UTC). August caches taken around 23:15–02:18 MST sometimes lacked the newest day. | REPORTED (mirror) |
| USGS, inference | Provisional Powell values are stable for weeks; revisions come at approval, later. At 08:17 MST the previous day is normally present, but a late day happens. Posts keep saying "provisional". | INFERENCE |
| Reclamation | Cadence and CSV format are unverified. | OPEN |
| EIA-930, observed | 12 snapshots of AZPS hourly demand (Sep 23 12:08 UTC to Sep 26 05:27 UTC): 33 of 221 hours changed after first appearing. Examples: 16:00Z Sep 23 went 879 → 6,151 → 4,209 MW; 17:00Z went 6,965 → 4,395 MW; 11:00Z went 1,130 → 5,114 → 5,119 → 5,081 MW. Changes came within about 24 hours, none later in this window. | REPORTED (mirror) |
| EIA-930 six-month file, observed | A copy committed 2026-08-24 ("data through Aug 23") has Aug 23 rows with only `Demand Forecast (MW)` filled; every actual is blank. Each measure also has "(Imputed)" and "(Adjusted)" copies, and the headers contain typos ("Solar witho Integrated …", a doubled space). | REPORTED (file provenance); VERIFIED (contents as read) |
| EIA-930, inference | A morning post about "yesterday" may use numbers that later move a lot. Post only days with all 24 hours complete, and compare with a second reading (or post the day before yesterday) until the official revision pattern is measured in the first 14 days. | INFERENCE |
| EIA-930 official cadence | eia.gov is blocked; `endpoint_smoketest.py` has still not run on an open network. | OPEN |

---

## 5. Source reliability and fallbacks

- **VERIFIED** (DOI-USGS/dataRetrieval@ad9deab:vignettes/tutorial.Rmd lines 67 and 89–90):
  "NWIS Water Services will be retired (scheduled late 2026, but uncertain)", linking to
  waterdata.usgs.gov/blog/nwisweb-decommission-summary/. Also read_waterdata_functions.Rmd line 36:
  "The timeline for the NWIS servers being shut down is currently very uncertain. We'd recommend
  incorporating these new functions as soon as possible".
- **VERIFIED** (dataretrieval-python@75e56ab:NEWS.md, 05/06/2026): the Python client's `nwis` module
  warns on every call and "is scheduled for removal on or after 2027-05-06". README: "Legacy NWIS
  Services (Deprecated)"; "Users are strongly encouraged to obtain an API key for higher rate limits";
  the key goes in env `API_USGS_PAT`.
- **VERIFIED** (the same repo's recorded response, `tests/data/waterdata_ogc_fixtures.json`, key
  `daily`): the Water Data API returns GeoJSON features whose properties include `time`, string
  `value`, `statistic_id` and `approval_status`. The new parser is tested on that recorded response
  (copied into `tests/fixtures/`; CC0 / U.S. public domain).
- **OPEN**: that the exact query in `config.SOURCES["usgs_waterdata_powell"]` returns Powell's series.
  It follows the client's parameters but was not reachable from here. The first open-network dry run
  checks it (LAUNCH_CHECKLIST_P2.md, step 5).
- **Implemented**: sources are tried in the order Water Data API, legacy NWIS, Reclamation. An error or
  an empty answer moves on to the next. The first fresh series wins. If none is fresh, the freshest
  comes back and validation reports it as stale.
- **EIA-930**: I searched GitHub (code and repository search, then clones) for a daily fuel-mix mirror
  of AZPS, SRP and TEPC and found none. There is one daily **demand-only** mirror
  (Masternode77/ai-news-portal) and one **one-off copy** of the official Jul–Dec balance file
  (shenyaoqiang45/power-infrastructure, data through Aug 22 complete). Both are REPORTED. The copy
  was enough to test the adapter and render one labelled sample (§12). Production must read EIA
  directly: the keyless six-month file or the API with a free key, both REPORTED in phase one.

---

## 6. Stale-data handling

| Case | Phase one | Now | Exit code |
|---|---|---|---|
| Newest value more than 2 days old | skip | skip (unchanged) | 3 |
| Source answers but has not moved on since the last post (same data date) | **posted again, same text** | refused by the posted log | 3 |
| Source returns data older than the last post (e.g. an old fallback) | posted | refused | 3 |
| Second scheduled run after this morning's post | would post again | no-op | 0 |
| Primary source empty or stale, fallback fresh | stopped at the first source | fallback used | 0 |
| Morning after 2026-12-31 (threshold wording) | posted | refused until a human re-checks | 4 |
| Grid day with blank hours, fewer than 24 hours, or fuels that don't add up | charted as zeros | refused (`grid_day_issues`) | 4 |
| Queued post approved but more than a day old | not handled | refused; queue a fresh one | 6 |

---

## 7. Duplicate prevention

- **VERIFIED** (developer-terms/policy.mdx @3ef050bd): "Never post identical or substantially similar
  content across multiple accounts". Developer guidelines: "No identical cross-posting".
- **REPORTED** (phase-one search extracts of help.x.com): the automation rules prohibit "duplicative or
  substantially similar posts on one account or over multiple accounts". The copypasta policy lists
  "using automation or scripting to post duplicative content" as a possible cause of removal or
  suspension.
- **OPEN**: X's own rejection of an identical post is not documented in the docs repository. Prior
  knowledge says X refuses exact duplicates. The bot does not rely on that.
- **Implemented** (`bot/ledger.py`, `bot/queue.py`, the workflow templates):
  - An append-only posted log refuses a second post for the same data date in the same series, data
    older than the last post, and any text identical (ignoring case and spacing) to one posted in the
    last 30 days, in any series.
  - The log writes `attempt` just before `POST /2/tweets` and `posted` after it. A 4xx answer becomes
    `not-posted`. A timeout or 5xx leaves the attempt **unconfirmed**, which blocks every retry until
    Carlos checks the account (`python -m bot.ledger resolve …`).
  - The queue checks itself as a whole: the same text or the same data date twice blocks the later
    post.
  - Both workflows share one concurrency group, so two posting runs never overlap.
- **Evidence**: the 16 replayed posts (14 daily, 2 weekly) are pairwise distinct. The Aug 27–30 replay
  blocks Aug 29 as "identical text" and "same data date".
- **INFERENCE**: daily template posts on one account stay clear of "substantially similar" because
  every post carries a new date, new numbers, a rotating second fact and a new image. The weekly
  segment has its own wording.

---

## 8. Alt text

- **VERIFIED** (openapi.json v2.168, `CreateMediaMetadataMetadataAltText`): `text` has
  `"maxLength": 1000`. Media Metadata costs $0.005 per request (pricing page).
- **Implemented**: every alt text describes the chart and gives its numbers, the thresholds, the
  source credit and the provisional note in English and Spanish. The fact-check refuses a missing note
  or more than 1,000 characters, and `publish.py` no longer truncates. In the replay, alt texts run
  650–775 characters.
- The image source line now reads "Data: USGS site 09379900 daily values (provisional, subject to
  revision) … Not an official product." A mirror replay's image names the mirror.

---

## 9. X API: pricing, limits and authentication

All **VERIFIED** at xdevplatform/docs @3ef050bd unless marked.

| Item | Text or value | File (last change) |
|---|---|---|
| Model | "pay-per-usage pricing. No subscriptions"; "No contracts, subscriptions, or minimum spend"; credits are bought upfront. | x-api/getting-started/pricing.mdx (2026-08-13) |
| Writes | Post: Create **$0.015**; with URL **$0.200**; summoned **$0.010**; Media Metadata **$0.005** | same |
| Reads | Posts: Read $0.005 per resource; Owned Reads (own posts, followers) **$0.001** per resource; deduplicated per 24-hour UTC day; 3M post reads per month cap | same |
| Spend control | "Spending limit … maximum spend per billing cycle. When the limit is reached, API requests will be blocked until the next billing cycle." Auto-recharge is optional (one top-up per 5 minutes; paused at zero). The balance "can go slightly negative". | same |
| Failed requests | "Do failed requests count? No. Only successful responses that return data are billed." (billing FAQ; INFERENCE that a refused create costs nothing) | x-api/fundamentals/post-cap.mdx |
| Media upload billing | not in the price table | **OPEN** |
| Minimum credit purchase | not stated | **OPEN** |
| Rate limits | `POST /2/tweets` 10,000/24 h per app, 100/15 min per user; `POST /2/media/upload` and `/2/media/metadata` 50,000/24 h, 500/15 min; `GET /2/users/:id/tweets` 900/15 min per user | x-api/fundamentals/rate-limits.mdx (2026-07-24) |
| Media | image (`tweet_image`) up to 5 MB, PNG allowed, up to 4 photos per post; limits follow the posting user's Premium status. Replay images are 96–103 KB. | x-api/media/introduction.mdx (2026-09-01) |
| Request shapes | upload: multipart `media` + `media_category`, response `data.id`; alt text: `{id, metadata.alt_text.text}`; post: `{text, media.media_ids}`. These match `bot/publish.py`. | openapi.json v2.168 |
| Scopes | create-post needs `tweet.read tweet.write users.read`; media needs `media.write`; add `offline.access` for a refresh token | openapi.json; oauth-2-0/authorization-code.mdx |
| Least privilege | X's own CLI `xurl` always asks for about 25 scopes, including `dm.read`, `dm.write`, `follows.write` and `users.email` (VERIFIED, xdevplatform/xurl@f70cf7d:auth/auth.go `getOAuth2Scopes`). The bot needs five. | `bot/authorize.py` requests only those five |
| App enrollment | X's CLI documentation: when calls fail with `client-not-enrolled`, move the app to the **Pay-per-use** package and the **Production** environment (VERIFIED, xdevplatform/xurl@f70cf7d:README.md) | checklist step 3 |
| Token lifetime | "OAuth 2.0 access tokens expire after **2 hours**"; refresh token "valid for about 6 months and single-use; each refresh returns a new one" | fundamentals/authentication/oauth-2-0/oauth-1-0a-token-exchange.mdx (2026-09-23) |
| Refresh request | `POST https://api.x.com/2/oauth2/token`, form `grant_type=refresh_token`, `refresh_token`; a confidential client uses Basic auth with the client ID and secret | oauth-2-0/user-access-token.mdx |
| Client type | "Automated App / Bot: Confidential" (it gets a Client Secret) | fundamentals/developer-apps.mdx (2026-07-24) |
| OAuth 1.0a | still accepted by v2 media and posts (`UserToken`), but "OAuth 1.0a is being retired" | changelog Sep 21, 2026; token-exchange page. Retirement date **OPEN**. |
| New post fields | `made_with_ai` ("Disclose that the tweet contains AI-generated media"): not applicable, because the charts are drawn by deterministic code (INFERENCE). `paid_partnership` must be `true` on any sponsor post (changelog Jun 3, 2026). | openapi.json; changelog |

---

## 10. Automation rules

| Rule | Text | Label | For this bot |
|---|---|---|---|
| Automated label | bot account **Settings → Your account → Automation → Link your managing account** | VERIFIED (fundamentals/developer-apps.mdx) | checklist step 2 |
| Bio disclosure | "Disclose in bio. State clearly that it's a bot and who operates it." Policy: "you must clearly indicate what the account is and who is responsible for it" | VERIFIED (developer-guidelines.mdx; developer-terms/policy.mdx 2026-09-17) | `config.BIO_EN` / `BIO_ES` |
| Human link | "your bot must be associated with a human-managed account" | VERIFIED | Carlos's personal account |
| Scheduled posts | "Automated account posts scheduled content (news, weather, quotes)": allowed; "Informational, no unsolicited mentions" | VERIFIED | fits |
| Official API only | "Non-API automation (scraping, browser automation) results in permanent suspension." | VERIFIED | fits |
| Summoned replies | Since Feb 23, 2026, "Programmatic replies via `POST /2/tweets` are now only permitted when the original Post's author has 'summoned' the replier"; summoned replies cost $0.010 | VERIFIED (changelog) | the bot never replies |
| AI content | "AI-Generated Content & Replies: **Requires prior approval from X** before deployment"; "Deploying AI-generated replies without approval is a violation". A help.x.com extract adds "the deployment or operation of any AI reply bot requires prior written and explicit approval from X". | VERIFIED; the extract REPORTED | Captions are fixed templates filled from data, with no LLM, so the approval path is not triggered (INFERENCE). Keep it that way. |
| Opt-out | "If a user says 'stop,' stop." | VERIFIED | the bot never mentions, replies or DMs; Carlos honours requests by hand |
| Trends | "App posts to trending topics to gain visibility": not allowed | VERIFIED | no hashtags |
| Commercial use | "Commercial Use" includes use "as part of a product or service that is monetized (e.g., … sponsorships)" | VERIFIED (developer-terms/agreement.mdx, "Last Updated: April 27, 2026") | pay-per-use covers one account (INFERENCE); sponsor posts use `paid_partnership` |

---

## 11. Monetization on X

- **REPORTED** (search extracts, 2026-09-26, of help.x.com/en/using-x/original-content-rewards and
  news coverage): Creator Revenue Sharing earned through **Sep 7, 2026**. From **Sep 8, 2026** members
  could apply to **Original Content Rewards**. Eligibility: 500 verified followers, 500,000 qualified
  Home Timeline impressions in 90 days, and X's originality standard, plus Premium (phase one). This
  is unchanged from phase one.
- **REPORTED, new** (the same page's extract): content is ineligible if it "was created or posted
  using automated means".
- **INFERENCE**: this automated account will not earn X payouts at any horizon. The money paths stay
  off X: the newsletter, sponsor slots (marked `paid_partnership`), consulting, and data or alert
  products. Premium ($8/month) is not needed for the bot.
- **OPEN**: the full text of the program page and of Creator Subscriptions (help.x.com is blocked).

---

## 12. Grid concept: one real-data sample

- Rendered from the third-party copy of EIA's `EIA930_BALANCE_2026_Jul_Dec.csv` (REPORTED provenance)
  through the fixed adapter. The day is **Sat Aug 22, 2026**, APS + SRP + TEP (AZPS + SRP + TEPC),
  the last complete day in the copy. Headline: solar made 12% of generation; peak demand 19,825 MW in
  the hour to 5 p.m.; net imports 7,092 MWh. The image is stamped "THIRD-PARTY COPY OF EIA-930 · NOT
  OFFICIAL · NOT POSTED" and names the source repository and commit. It is kept private and not
  committed.
- Aug 23 in the same file is refused as incomplete (every actual is blank).
- The phase-one synthetic design mock stays labelled SYNTHETIC. Nothing mirrored or synthetic is
  presented as official.

---

## 13. GitHub Actions facts the launch plan relies on

All **VERIFIED** at github/docs @18945a31 (2026-09-25).

- "The `schedule` event can be delayed during periods of high loads … High load times include the
  start of every hour. If the load is sufficiently high enough, some queued jobs may be dropped."
  (data/reusables/actions/schedule-delay.md). The templates use 08:17 and 09:47 MST.
- "In a public repository, scheduled workflows are automatically disabled when no repository
  activity has occurred in 60 days." (events-that-trigger-workflows.md)
- Actions usage "is **free** … for **public repositories** that use standard GitHub-hosted runners"
  (billing/concepts/product-billing/github-actions.md). GitHub Free includes **2,000** minutes a month
  for private repositories (billing/reference/product-usage-included.md).
- The `GITHUB_TOKEN` permission list has no `secrets` entry
  (data/reusables/actions/github-token-available-permissions.md). **INFERENCE**: rotating
  `X_REFRESH_TOKEN` needs a separate fine-grained token limited to the bot repository.
- "events triggered by the `GITHUB_TOKEN` will not create a new workflow run"
  (data/reusables/actions/actions-do-not-trigger-workflows.md). The bot's own commits cannot trigger
  `approve.yml`; only Carlos's edit to `APPROVED_TO_POST` can.

---

## 14. Gaps found and what was changed

| Gap | Fix | Tests (tests/test_hardening.py) |
|---|---|---|
| No posted log; the same data could post twice | `bot/ledger.py`; used by `run_daily`, `queue` and `publish` | `PostedLog.*`, `DailyRunAndPostedLog.*`, `Queue.test_approved_post_goes_out_once`, `…timeout_stays_unconfirmed` |
| No per-post review | `python -m bot.queue build` writes `APPROVAL_QUEUE.md`, `index.html` and `queue.json`. `publish --live` needs a per-date approval line with the post's approval code, a morning no older than yesterday, and unchanged files. | `Queue.*`, `ApprovalFile.test_parsing` |
| Provisional status not in the alt text | provisional note in English and Spanish, enforced by the fact-check; source credit named | `ProvisionalNote.*` |
| River concept daily only | `--cadence weekly --weekday fri` with its own metrics, compose and independent fact-check | `Weekly.*` |
| Access token would expire in 2 h | `bot/xauth.py` refresh plus rotation; workflow step to store the rotated token | `XAuth.*` |
| The only ready-made login tool asks for DM and follow scopes | `bot/authorize.py`: one-time PKCE login with five scopes; the refresh token goes to a mode-600 file, never the screen | `Authorize.*` |
| Alt text silently truncated | refuse more than 1,000 characters instead | `ProvisionalNote.test_factcheck_blocks_overlong_alt_text`, `Queue.test_approved_post_goes_out_once` |
| NWIS retirement | Water Data API first; fallback to the freshest source | `Sources.*` |
| EIA-930 adapter wrong on real data | rewritten; `grid_day_issues`; `bot/grid.py` | `Eia930.*` |
| 3,525 ft wording may expire with 2026 | `THRESHOLD_LABELS_VALID_THROUGH` guard | `Sources.test_threshold_wording_expires` |
| Font weights (SemiBold drew Bold; Mono asked for a missing weight) | fixed family names | covered by the render tests (no warnings) |

Test result: **45 tests, all passing** (`python -m unittest discover -s tests -t .`), with no network.

---

## 15. Could not verify (OPEN)

1. That the USGS Water Data API query returns Powell's series. The Reclamation CSV layout. EIA-930's
   official freshness and revision window. All need the open-network dry run.
2. Whether X bills the media upload itself, the minimum credit purchase, and whether unused credits expire.
3. The OAuth 1.0a retirement date.
4. The full text of help.x.com: the automation rules, Original Content Rewards and Creator
   Subscriptions (extracts only).
5. X's own duplicate-post rejection (undocumented in the docs repository).
6. The operating-threshold wording from 2027 on, and the thresholds themselves on usbr.gov.
7. The text of EIA's reuse page today (read through a third-party copy).
8. Account-level daily post caps (not relevant at 1–2 posts a day).
