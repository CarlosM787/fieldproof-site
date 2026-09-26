# Clave Lab: a 90-day test (one channel, Shorts first)

**For:** Carlos. **Date:** 2026-09-26. **Status:** a plan (PROPOSED). No channel exists, nothing is uploaded,
nothing is bought. **No earnings are promised or projected: YouTube monetization is never guaranteed.**
The test is marketing for mysalsacoach.com, judged on visits and sign-ups, not on ad revenue.

Labels: VERIFIED (checked here today), REPORTED (search extracts or records, named), ESTIMATE, OPEN,
PROPOSED. Current baselines (sign-ups, Search Console) are REPORTED figures kept in
`private/ECONOMICS_BASELINE.md`.

## 1. The question

Do short bilingual salsa-timing lessons ("Where is the 1?") bring people to mysalsacoach.com who then
sign up? The channel is Clave Lab (recommended in `CHANNELS_P2.md`), Shorts first, English and Spanish on
screen, band and pictures made in code.

## 2. Gates before any upload (all of them are Carlos's)

1. **Carlos picks the channel and the pilot.** Recommended: Clave Lab, pilot "Where is the 1?" v2.
2. **The first upload is Unlisted**, watched on his own phone: the Shorts UI zones, the captions, the sound.
3. **His ear check** on the phone speaker and on headphones.
4. **An instructor checks the feet** (On1). On2 stays out until an instructor rules on it.
5. The call to action matches what mysalsacoach.com offers that day.
6. Render with `--final`; captions EN + ES with 0 errors; thumbnail checks pass; YouTube's "altered or
   synthetic content" answered No (animation; any voice is Carlos's own).

## 3. Cadence and hours

**Cadence (PROPOSED):** weeks 1–2: the pilot (Unlisted, then public after the gates) and one new episode;
weeks 3–12: two Shorts a week. About 20 Shorts by day 90. A longer lesson only after day 45, and only if
the Shorts hold viewers.

**Carlos's hours per week (ESTIMATE; machine time is measured, the rest is judgement):**

| Task | Per Short | Per week (2 Shorts) |
|---|---|---|
| Write the episode spec, EN and ES, from the template | 1.0 h | 2.0 h |
| Render and checks (machine about 3 min, VERIFIED here: 155 s for Pilot A) | 0.1 h | 0.2 h |
| Watch on the phone, ear check | 0.5 h | 1.0 h |
| Optional voice take, prep and mix | 0.5 h | 1.0 h |
| Upload, captions, cover or thumbnail, text, UTM link | 0.3 h | 0.6 h |
| Instructor check of the feet (coordination) | 0.25 h | 0.5 h |
| Weekly metrics review | | 0.25 h |
| **Total** | | **about 3.5–5.5 h** |

The first two or three episodes will take two to three times longer (ESTIMATE, as in phase two).

## 4. Tools: $0

Python, Node, Playwright and FFmpeg (all free, VERIFIED licences in `PIPELINE_WINDOWS.md` §11); the bundled
OFL fonts; YouTube Studio; the site's sign-up form; a spreadsheet. **The one optional purchase** is a USB
microphone for Carlos's voice: PROPOSED only, price OPEN, no purchase without his decision. Try the phone
first.

## 5. What to measure, and how

| Metric | Where | How |
|---|---|---|
| **Retention** | YouTube Studio, each Short: "viewed vs. swiped away", average view duration and percentage viewed (names REPORTED, prior knowledge; the Studio may word them differently) | log weekly per Short; the loop can push percentage viewed over 100% |
| **Shorts → site clicks** | the site's analytics, visits with `utm_source=youtube` | UTM links on every clickable surface (below) |
| **Sign-ups** | the sign-up records: the form already keeps `utm_source` (REPORTED: recent sign-ups carried `utm_source=chatgpt.com`) | count sign-ups with `utm_source=youtube` |
| Subscribers, views | YouTube Studio | context only, not the test |

**Clickable surfaces (REPORTED, search extracts 2026-09-26):** links in Shorts descriptions and comments are
not clickable (since August 2023). What works: the channel's profile links (up to 14), and a Short's
"related video" link to one of his own videos, whose description can carry a clickable link. So:
- Channel link: `https://mysalsacoach.com/?utm_source=youtube&utm_medium=channel_link&utm_campaign=clave_lab`
- In a long video's description: `...?utm_source=youtube&utm_medium=video_description&utm_campaign=clave_lab&utm_content=<episode>`
- Say "link on the channel page" in the Short, not a URL to type.

OPEN: which analytics tool mysalsacoach.com runs, and whether it shows UTM sources. The website's owner (the
public-authority chat) should confirm before day 1.

## 6. Review points and stop rules (PROPOSED thresholds, not benchmarks)

YouTube publishes no retention benchmarks for this niche (OPEN), so these are decision rules to agree on
before day 1, not predictions.

| Day | Continue if | Otherwise |
|---|---|---|
| 30 (about 6 public Shorts) | the gates held (no teaching error, no claim or strike) and Carlos stayed under 6 h a week | fix the process first |
| 45 | median "viewed" share ≥ 50% on the last 6 Shorts, or one Short clearly above the rest to learn from | change the format (hook, length, voice) before making more |
| 60 | ≥ 10 site visits with `utm_source=youtube` and ≥ 1 sign-up from YouTube | **stop** the channel; keep the pipeline and the Shorts as site material |
| 90 | ≥ 5 sign-ups from YouTube, or visits from YouTube rising month on month | stop, or a smaller cadence; decide on a second channel only if Carlos has the hours |

**Stop at once** on: a Community Guidelines strike; a Content ID claim that cannot be cleared (the sound is
made in code, so none is expected: INFERENCE); an instructor finding a teaching error in a published
Short (unlist it, fix, re-upload); Carlos over 6 hours a week for three weeks in a row.

## 7. YouTube Partner Program thresholds (REPORTED, search extracts, 2026-09-26)

| Tier | Until Jan 31, 2027 | New applicants from Feb 1, 2027 |
|---|---|---|
| Fan funding (lower tier) | 500 subscribers, 3 public uploads in 90 days, and 3,000 public watch hours in 12 months **or** 3M public Shorts views in 90 days | unchanged in the extracts |
| Ad revenue (full) | 1,000 subscribers and 4,000 public watch hours in 12 months **or** 10M public Shorts views in 90 days | 1,000 subscribers and 8,000 watch hours in 365 days **or** 20M Shorts views in 90 days; existing partners unaffected |

Sources: the YouTube Blog post "New opportunities to earn and changes to the YouTube Partner Program"
(blog.youtube, as quoted in results), YouTube Help "YouTube Partner Program overview & eligibility"
(support.google.com/youtube/answer/72851), and coverage by AIR Media-Tech, vidIQ, Shacknews and The Next Web.
The pages themselves could not be opened here. Other requirements in the extracts: no active strikes,
2-Step Verification, a linked AdSense account, an eligible country.

INFERENCE: a new niche channel is unlikely to reach 10M Shorts views in 90 days, and nothing in this plan
assumes it. Shorts views in the Shorts feed do not count toward watch hours (REPORTED, phase two).

## 8. Money

- **Cash out:** $0. Electricity for renders is negligible (phase two estimate).
- **Revenue:** none planned or expected from YouTube in 90 days. The $0 revenue baseline stands.
- **What counts as success:** visitors and sign-ups for mysalsacoach.com, measured by UTM.

## 9. Next actions

| Owner | Action |
|---|---|
| Carlos | Pick the channel and the pilot; do the ear check; find an instructor for the feet; decide on the voice (and whether to buy a mic) |
| Carlos | Create the channel only after deciding; set the channel link with the UTM above; upload Unlisted first |
| Public-authority chat (mysalsacoach.com) | Confirm the site's analytics sees `utm_source=youtube` and the sign-up form keeps it; confirm the call to action for day 1 |
| Mission session | Carry these rules into the decision sheet |
