# LAUNCH_CHECKLIST_P2: the daily data-visual X account

For Carlos. Written 2026-09-26. Every step has a date, a time box and a "done when". Labels
(VERIFIED / REPORTED / INFERENCE / OPEN) and sources are in AUDIT_P2.md.

> **Read this first.** The 7-day sample and the 14-post replay prove that the **pipeline** works:
> fetch, check, chart, text, fact-check, queue, approval and duplicate guard. They say **nothing about
> demand**. Whether anyone wants these posts is only learned from real posts, measured against the
> day-30/60/90 thresholds at the end.

**What is ready.** The Colorado River posts, daily and weekly, are built end to end and were replayed
for 14 mornings with no fact-check failure or duplicate. The Arizona Grid chart (the lead concept)
now renders correctly from a real EIA-930 file, but its post text and fact-check are not built yet.
**Default plan (Track A):** start the 14 approval days with the river posts on **Thu Oct 1** and add
the grid once it is ready (step 9). **Track B:** start with the grid instead; every date from step 5
on moves about a week later (day 1 on Thu Oct 8 at the earliest).

---

## Step 1 · Decisions · Sun Sep 27 · 1 hour

Done when all three are written down.

1. **Account.** A new, dedicated X account. It never posts from, or imitates, Carlos or anyone else.
   - Pick a name and handle that fit the track: a river name for Track A (it can be renamed when the
     grid joins), or "Arizona Grid Daily"-style for Track B.
   - The profile gets the **Automated** label linked to Carlos's personal account (VERIFIED rule).
   - The bio says it is automated and who runs it (VERIFIED rule). The text is ready in
     `bot/config.py` (`BIO_EN` / `BIO_ES`); fill in the handle.
2. **Home repository.** Recommended: a **new private repository** under Carlos's GitHub account.
   The control room's "no new repo" rule makes this Carlos's call.
   - Why private: the approval flow commits each post *before* it is approved.
   - Cost: GitHub Free includes 2,000 Actions minutes a month for private repos (VERIFIED); the bot
     needs about 150–210 (INFERENCE).
   - The 60-day auto-disable applies to public repositories (VERIFIED wording).
   - Not the fieldproof-site repository: that is the public website.
3. **Track.** A (river first, day 1 = Oct 1) or B (grid first, day 1 ≥ Oct 8).

## Step 2 · Bot account · Mon Sep 28 · 45 min

Done when the profile shows the Automated label and the bio.

1. Create the account with its own email and turn on two-factor authentication. Do the same check
   on Carlos's personal account.
2. Fill in the name, a plain chart icon and the bio (EN/ES), plus the newsletter link *in the bio*.
   Posts never carry links: a post with a URL costs $0.20 instead of $0.015 (VERIFIED).
3. Automated label: in the **bot** account, go to **Settings → Your account → Automation → link the
   managing account** (Carlos's personal handle). This is VERIFIED, from X's developer-apps page.
4. Do **not** buy Premium for the bot. Automated content is reported as ineligible for X's Original
   Content Rewards (REPORTED), so X payouts are not a money path here.

## Step 3 · Developer app on pay-per-use · Mon Sep 28 · 45 min

Done when the app has credit, a spending limit and OAuth 2.0 keys.

1. Sign in to **console.x.com as the bot account**, so that reading the bot's own posts is billed at
   the $0.001 "Owned Reads" rate. That rate needs the app owner to be the same user (VERIFIED
   pricing text; INFERENCE on the setup).
2. Create a project and app. App type: **Automated App / Bot**, a confidential client with a Client
   Secret (VERIFIED). Permissions: read and write. OAuth 2.0 on. Callback:
   `http://localhost:8080/callback`.
3. In **Apps → Manage apps**, move the app to the **Pay-per-use** package and the **Production**
   environment. X's own CLI documentation says calls fail otherwise (VERIFIED in xdevplatform/xurl).
4. Buy the smallest credit pack of **$5–10**. The minimum purchase is not documented (OPEN).
5. Set the **spending limit to $10 per billing cycle**; requests stop when it is reached (VERIFIED).
   Leave **auto-recharge off**.

## Step 4 · Repository, token and secrets · Tue Sep 29 · 1 hour

Done when the four secrets exist and no token is anywhere else.

1. Create the private repository and copy in `bot/`, `fonts/`, `tests/` and
   `sample/usgs_09379900_lake_elevation_ft.csv` (the tests read it).
   - Add a `.gitignore` containing only `__pycache__/` and `_cache/`. The bot repository **must**
     commit `runs/`, because that is the approval queue. Do not copy the mission folder's `.gitignore`.
   - Keep `workflow/` for step 6.
2. Authorize the bot account once, on Carlos's own computer, signed in to X as the **bot**. This asks
   only for `tweet.read tweet.write users.read media.write offline.access`:
   ```bash
   X_CLIENT_ID=... X_CLIENT_SECRET=... python3 -m bot.authorize --redirect-uri http://localhost:8080/callback --out ~/x_refresh_token
   gh secret set X_REFRESH_TOKEN --repo <owner>/<bot-repo> < ~/x_refresh_token && shred -u ~/x_refresh_token
   ```
   X's `xurl auth oauth2` also works, but it asks for about 25 scopes, including DMs.
3. Add the other GitHub Actions secrets in **Settings → Secrets and variables → Actions**:
   - `X_CLIENT_ID` and `X_CLIENT_SECRET`.
   - `GH_SECRETS_TOKEN`: a fine-grained personal access token for **this repository only**, with
     **Secrets: read and write** and an expiry of **Jan 31, 2027** (set a reminder).
     - Why it exists: X refresh tokens are single-use, so every post stores a new one. The built-in
       `GITHUB_TOKEN` cannot write secrets (VERIFIED).
   - Optional: `API_USGS_PAT`, a free key from api.waterdata.usgs.gov/signup.
4. Tokens never go in code, chat, email, notes or files in the repository.
   - **Why a stored access token won't work:** access tokens expire after 2 hours (VERIFIED).
   - **If a refresh ever fails midway**, repeat item 2.

## Step 5 · One end-to-end production dry run on an open network · Wed Sep 30 · 30 min

Done when both commands exit 0 and Carlos has checked the numbers by eye.

On Carlos's computer, in a clone of the bot repository. This never posts: `publish` without `--live`
does not ask for a token.
```bash
python3 -m pip install matplotlib==3.11.2 && python3 -m unittest discover -s tests -t . \
  && python3 -m bot.queue build --out runs --days 1 && python3 -m bot.queue publish --queue runs
```
Pass when all of these hold:
- the tests pass (45);
- `runs/APPROVAL_QUEUE.md` shows **1 ready** post;
- its source is the "USGS Water Data API". If the legacy NWIS source appears instead, `queue.json`
  says why the new API was passed over. Report that; the fallback keeps working in the meantime.
- the level equals yesterday's value on USGS's page for site 09379900;
- the image and the text look right.

Also run the EIA-930 check. It is required for Track B and optional for Track A:
- `python3 endpoint_smoketest.py`, from the private research folder;
- `python3 -m bot.grid --balance-file EIA930_BALANCE_2026_Jul_Dec.csv --date <yesterday> --out grid-check
  --stamp "OFFICIAL EIA-930 · DRY RUN · NOT POSTED" --source-note "Downloaded from eia.gov on <date>."`,
  using the file downloaded from eia.gov.

## Step 6 · Install the workflows (still dry) · Wed Sep 30 · 20 min

Done when a manual run has committed `runs/<today>/` and `runs/APPROVAL_QUEUE.md`.

1. Copy `workflow/daily.yml.template` to `.github/workflows/daily.yml`, and
   `workflow/approve.yml.template` to `.github/workflows/approve.yml`.
2. Leave the repository variable `LIVE` unset.
3. **Actions → daily-post → Run workflow.** Check that the commit appears.

## Step 7 · 14 days of per-post approval · Thu Oct 1 → Wed Oct 14 · about 5 min a day

Done when 14 mornings have each been approved or deliberately skipped.

Every morning around 08:20 MST the run commits the day's post to `runs/<date>/` and writes
`runs/APPROVAL_QUEUE.md`.
1. Open `runs/APPROVAL_QUEUE.md` on github.com. Check four things:
   - **date**: the data is for yesterday;
   - **number**: it matches USGS's page;
   - **buffer**: the "ft above" figure equals the level minus 3,490;
   - **clean**: no link, hashtag or @mention, and the alt text is present.
2. Approve by adding the post's line, for example `2026-10-01 3f2a9c1b7d4e`, to
   `runs/APPROVED_TO_POST` and committing on github.com. `approve.yml` then posts that day's post.
   - Missed the day? Approve the next day, then run **Actions → post-approved → Run workflow** with
     yesterday's date.
   - Anything older can't be posted: queue a fresh post.
3. On Oct 1, watch the first post appear and check the image, the alt text and the cost in the
   console.
4. If something is wrong, don't approve. Nothing posts without the line.
5. Keep a small log: impressions and follows at 24 hours, profile visits, bio clicks, and spend.
6. **Posted ≥ 27 of 30 days** counts approved posts, so a missed approval is a missed day.

## Step 8 · Standing approval · Thu Oct 15 · 10 min

Done when `LIVE=true` and a standing line is in place, or the per-post period is extended.

- **Condition:** the 14 days had 0 wrong-data posts, no unconfirmed attempts and the expected spend.
- **Then:** set the repository variable `LIVE=true` and add `standing 2026-10-15..2026-11-13` to
  `runs/APPROVED_TO_POST`. The daily run then posts on its own, still behind the fact-check, the
  posted log and the approval file.
- **Renew monthly:** a standing approval lasts at most 31 days by design. Renew on **Nov 13** and
  **Dec 13**.
- **Otherwise:** extend the per-post period.

## Step 9 · Grid concept · build by Wed Oct 14, start after a clean replay

Done when the grid post text and fact-check pass a 7-morning replay of **official** EIA-930 data.

- This is about one working day of build (INFERENCE).
- Rule from the audit: post only days with all 24 hours complete, and compare with a second reading,
  because EIA-930 hourly values move for about a day after first release (REPORTED).
- Then run grid daily plus the river weekly (`--cadence weekly --weekday fri`), as the phase-one plan
  intended. The phase-one switch rule decides which one leads.

## Standing dates

| Date | What |
|---|---|
| Fri Oct 30 | **Day 30** review |
| Fri Nov 13 | renew the standing approval |
| Sun Nov 29 | **Day 60** review and stop-rule check |
| Sun Dec 13 | renew the standing approval |
| Tue Dec 29 | **Day 90** review |
| by Thu Dec 31 | Re-check the 3,490 / 3,525 ft wording on usbr.gov (the 2019 drought agreements end with 2026, REPORTED). The bot refuses to post from Jan 1 until `THRESHOLD_LABELS_VALID_THROUGH` is moved. |
| any day | USGS may retire its legacy NWIS service (late 2026, VERIFIED notice). The bot already reads the new API first; an alert email means look at `runs/<date>/log.jsonl`. |

**Emergency stop:** delete the standing line and set `LIVE` to false (or disable both workflows).
If a wrong number went out, delete the post by hand and post a correction.

---

## First-month cost (Oct 1–30)

The basis is 30 river posts, plus up to 4 weekly and up to 16 grid posts if step 9 lands mid-month:
30–50 posts in all.

| Item | Basis | Cost | Label |
|---|---|---|---|
| Posts, no URL | 30–50 × $0.015 | $0.45–0.75 | VERIFIED price |
| Alt text (Media Metadata) | 30–50 × $0.005 | $0.15–0.25 | VERIFIED price |
| Media upload | 0–50 × $0.015, only *if* billed like a post | $0–0.75 | OPEN |
| Own-post metrics (Owned Reads, optional) | at most 50 posts × 30 days × $0.001 | ≤ $1.50 | VERIFIED price; INFERENCE usage |
| Failed or refused requests | "Only successful responses that return data are billed" | $0 | VERIFIED text; INFERENCE for writes |
| **Metered X total** | | **≈ $0.60–3.25** | INFERENCE |
| Credit prepay (cash out) | smallest pack of $5–10; month-one use is covered by it | **$5–10** | minimum and expiry OPEN |
| GitHub Actions, private repo | ≈ 60 daily runs + 14 approval runs, about 150–210 min of the 2,000 free | $0 | VERIFIED quota; INFERENCE usage |
| USGS / EIA API keys | free and optional | $0 | VERIFIED (USGS); REPORTED (EIA) |
| X Premium | not needed | $0 | REPORTED (payouts exclude automated content) |
| Newsletter | existing Substack | $0 | phase one |
| **Cash, month one** | the prepay | **$5–10** | INFERENCE |
| Carlos's time | setup about 4 h (Sep 27–30); 14 × 5–10 min approvals; then about 1 h a week | none | INFERENCE |

---

## Success thresholds and stop rules

These are from the decision sheet, unchanged. Day 1 = Thu Oct 1, 2026.

- **Day 30 (Fri Oct 30):** posted ≥27 of 30 days, 0 wrong-data posts, spend ≤$10, and one of (a post
  ≥1,000 impressions, ≥50 followers, ≥10 newsletter sign-ups).
- **Day 60 (Sun Nov 29):** ≥200 followers, median impressions ≥2× day 30, ≥25 subscribers.
- **Day 90 (Tue Dec 29):** ≥1 paid commitment, or ≥100 subscribers with ≥40% opens, or ≥3 qualified
  leads.
- **Stop at day 60:** median <150 impressions, <100 followers and no inbound.

Seven or fourteen dry-run posts prove the pipeline, not demand. The first real signal arrives with the
day-30 numbers.
