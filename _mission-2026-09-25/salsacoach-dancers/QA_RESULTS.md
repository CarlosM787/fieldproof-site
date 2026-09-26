# QA results: SalsaCoach Dancers, phase three

Run: 2026-09-26 14:33:29 UTC, `node qa/qa.mjs` (headless Chromium 141, software WebGL through SwiftShader, 4 shared CPUs). **VERIFIED** in this lane; not on a phone.

**73 of 73 checks pass**: the 33 phase-two checks (33/33, unchanged code) and 40 new checks (40/40).

Run history today, for honesty:

- about 09:25 UTC, first run of the phase-two suite on the new build: 32/33. The audio-clock check failed (max lag 330 ms, allowed about 255 ms) while other lanes loaded the machine.
- 14:04 UTC: 71/73. The audio-clock check failed (277 ms vs 254 ms allowed). A new slow-motion check also failed on its own over-strict tolerance, since fixed to 0.002 beat (1.6 ms).
- 14:23 UTC: 72/73, all 33 phase-two checks passing. A new step-mode check failed because it did not allow the correct wrap from count 8 to count 1; the check was fixed, not the code.
- 14:26 UTC: 73/73.
- 14:31 UTC: 73/73 again after the download-size wording was corrected (this file).

The audio-clock check allows at most two median frames plus 5 ms, so one slow frame fails it. In software WebGL on a shared machine, frame pacing is set by the machine, not the page.
- A same-time A/B gave both builds a 299 ms median frame interval.
- Under load, the phase-two build itself failed this check in 2 of 3 runs (09:38 UTC).
- The load-independent version (each count drawn on the first frame after it is heard) passes at half speed.
- A real-phone test is the measurement that counts; it is on the human test card.

## Numbers

| What | Phase three | Phase two | Note |
|---|---|---|---|
| Phone first load, explore page (lite tier) | 1.17 MB (1174906 B, 9 files) | 1.14 MB | budget 1.2 MB; same method (local server bytes, fonts excluded) |
| Desktop first load (full tier) | 2.22 MB | 2.18 MB | |
| Practice page first load, before Start | 719.0 KB, 0 avatar or texture requests | – | 3D loads only on the visitor's tap (8 files after Start) |
| Pose, both dancers (qa.mjs bench) | 0.062 ms median, 0.148 ms p95 | 0.044 ms (phase-two record) | budget "well under 1 ms" |
| Pose, same-machine A/B, desktop | 0.104 ms | 0.054 ms | ratio 1.93× (qa/ab.mjs, interleaved) |
| Pose, same-machine A/B, phone emulation | 0.088 ms | 0.082 ms | ratio 1.07× |
| Frame (pose + render + GPU finish), desktop | 1.3 ms | 1.1 ms | ratio 1.18×; software WebGL, relative only |
| Frame, phone emulation (DPR 1.5 cap) | 1.4 ms | 1.9 ms | ratio 0.74× |
| Draw calls / triangles | 38 / 21950 | 24 / 21614 | +shadows, badges, weight dots |
| Audio clock: count drawn after it is heard | median 58 ms, max 139 ms (frame 154 ms) | median 67, max 191 (frame 123) | software WebGL frame rate; not a phone number |
| Half speed: band tempo, pose vs heard position | 75 BPM, max error 1.3e-4 beat | – | 7 counts; each drawn on its own first frame: true |
| Step by step: one press | 2 → 3, monotonic, lands with its cue | – | beat 0.40 s |
| Touchdown vs count, all patterns | -4 ms at 150 BPM (never late) | same | ball within 1 mm |
| Planted-foot drift | 0 mm | 0 mm | |
| Toe tip below floor / toe lift while ball down | 0 mm / 0 mm | not measured | max ankle roll 2.86°, 0° on the weighted foot |
| Count voice: word reaches full level vs beat | worst 41 ms (EN/ES × 100/150/200 BPM) | – | offline render; intelligibility unjudged |
| Find the 1 judge vs Count Lab code | 10000/10000 identical verdicts | – | code extracted from count-lab/src/app.js |
| Count engine fingerprint | sha256 8f1df7be3620… | same | 21 parts of src/choreo.js |

## Hero and banner

- Poster 720×720: WebP 22.6 KB, AVIF 14.0 KB (budget 60 KB).
- Loop: 3.2 s, 0 audio streams: WebM 222.4 KB, MP4 228.4 KB (budget 300 KB each).
- Component, gzipped: HTML 811 B, CSS 1044 B, JS 701 B. First paint needs the component plus one poster (WebP 22.6 KB or AVIF 14.0 KB); the loop comes later, only on screen.

Lighthouse 12.8.2, mobile default (simulated throttling), headless Chromium 141, 3 runs, medians. Lab numbers on a local build, not field data.

| Page | LCP | FCP | CLS | TBT | Perf | A11y | Bytes | Runs |
|---|---|---|---|---|---|---|---|---|
| Banner test page (system fonts) | 1.05 s | 0.76 s | 0 | 0 ms | 100 | 100 | 244.0 KB | 3 |
| Homepage copy, no banner | 1.72 s | 1.72 s | 0 | 0 ms | 97 | 96 | 132.7 KB | 3 |
| Homepage copy + banner | 1.86 s | 1.57 s | 0 | 0 ms | 97 | 96 | 152.9 KB | 3 |

The homepage copies come from `web/authority-v1` (`website/index.html`). In both, the Cloudflare beacon was removed. Google Fonts cannot load in this container, so both copies ran without web fonts; the comparison is relative.

LCP element in the first run: banner test page, the poster image; homepage copies, the page headline (h1) in both (the banner sits below the hero, so it never becomes the LCP element there).

CSP: under the live `_headers` policy the staged route's dancers fail (`script-src wasm-eval`); with `'wasm-unsafe-eval'` added to `script-src` they load with 0 violations.

## Demo video

- `media/practice-demo.mp4`: 18.8 s, 540×1080, 980.0 KB, H.264 + AAC. The band and robot voice are rendered offline with the page's own code, and the taps are synthetic, scored by the real judge. `media/practice-demo.jpg` is its poster.

## All checks

| Result | Check |
|---|---|
| | **Phase two (33, unchanged)** |
| PASS | desktop: dancers load without script errors |
| PASS | on1: every step lands on its count (ball within 1 mm of its spot no earlier than 0.01 beat = 4 ms at 150 BPM before the count, never after) |
| PASS | on1: feet leave the floor only after 0.6 of the beat |
| PASS | on1: planted feet do not slide during [count, count + 0.6) (max movement < 0.1 mm) |
| PASS | on1: legs reach every target (no stretch error) |
| PASS | on1: hips over the weighted foot on every count, both dancers |
| PASS | on1: knees bend forward in every sample |
| PASS | on1: joined hands stay together (gap 5-16 cm) |
| PASS | on2t: every step lands on its count (ball within 1 mm of its spot no earlier than 0.01 beat = 4 ms at 150 BPM before the count, never after) |
| PASS | on2t: feet leave the floor only after 0.6 of the beat |
| PASS | on2t: planted feet do not slide during [count, count + 0.6) (max movement < 0.1 mm) |
| PASS | on2t: legs reach every target (no stretch error) |
| PASS | on2t: hips over the weighted foot on every count, both dancers |
| PASS | on2t: knees bend forward in every sample |
| PASS | on2t: joined hands stay together (gap 5-16 cm) |
| PASS | on2c: every step lands on its count (ball within 1 mm of its spot no earlier than 0.01 beat = 4 ms at 150 BPM before the count, never after) |
| PASS | on2c: feet leave the floor only after 0.6 of the beat |
| PASS | on2c: planted feet do not slide during [count, count + 0.6) (max movement < 0.1 mm) |
| PASS | on2c: legs reach every target (no stretch error) |
| PASS | on2c: hips over the weighted foot on every count, both dancers |
| PASS | on2c: knees bend forward in every sample |
| PASS | on2c: joined hands stay together (gap 5-16 cm) |
| PASS | reduced motion: poses snap to the count (no travel between counts) |
| PASS | pose solve (both dancers, CPU) under 2 ms median on this machine |
| PASS | desktop: loads, no errors |
| PASS | desktop: no horizontal scroll |
| PASS | desktop: axe finds no violations |
| PASS | phone: loads, no errors |
| PASS | phone: no horizontal scroll |
| PASS | phone ES: no horizontal scroll |
| PASS | phone: axe finds no violations |
| PASS | no JS: the step table is still there (8 counts) |
| PASS | audio clock: each new count is drawn within one frame after it is heard |
| | **Phase three (new)** |
| PASS | count engine unchanged: beatState and its timing helpers are byte-identical to phase two (sha256 over 21 parts) |
| PASS | Find the 1: the tap judge gives the Count Lab verdict on 10,000 random taps (code taken from count-lab/src/app.js) |
| PASS | foot plant: toe tips never go below the floor (all patterns, both dancers, 50 samples per beat) |
| PASS | foot plant: toes stay flat on the floor while the ball is down (toe-off only after the ball lifts) |
| PASS | ankle roll is subtle (at most 3°) and never on the weighted foot |
| PASS | hip settle: hips stay over the weighted foot through the whole planted part of every count |
| PASS | weight indicator: the centre-of-weight dot sits on the weighted side through every planted phase |
| PASS | count numbers: from lift-off the landing spot shows the count it lands on; after landing the foot shows its count |
| PASS | contact shadow: darkest under the weighted flat foot, faint under a foot in the air |
| PASS | teaching overlays toggle: count numbers, weight dot, quick-quick-slow and footprints switch off and back on |
| PASS | quick-quick-slow captions follow the step table (On1 QQSH QQSH; 2-3-4 count HQQS HQQS) |
| PASS | slow motion ½×: the band plays at half tempo (150 -> 75 BPM) and each drawn pose is the heard position within 0.002 beat (steps land on the count) |
| PASS | slow motion ½×: each new count is drawn on the first frame after it is heard |
| PASS | step by step: one press advances exactly one count, animated forward and finishing when its cue is heard |
| PASS | step by step: the → key and a tap on the dancers each advance one count |
| PASS | reduced motion: step by step snaps to the next count, no travelling badge, no count flash |
| PASS | phase-three page loads with no script errors (desktop) |
| PASS | count voice: every word (EN and ES, 100/150/200 BPM) reaches full level within 60 ms of its beat (offline render; a person must still judge the sound) |
| PASS | practice page: no 3D is downloaded until the viewer presses Start; then the dancers load |
| PASS | practice flow: five steps, progress shows "Step 1 of 5" then "Step 2 of 5", aria-current moves, focus goes to the step title |
| PASS | practice flow, Find the 1: the counts are hidden (listen by ear) and the tap pad is shown |
| PASS | practice flow, Find the 1: taps on the 1 score "On the 1" (Count Lab judge), a tap on the 5 scores "That was the 5", three in a row complete the step |
| PASS | practice flow, Watch slowly: half speed, overlays on; Step along: count voice on at full speed |
| PASS | practice flow, Speed up: tempo buttons work and the last tempo is the only thing stored (localStorage) |
| PASS | practice flow: the last tempo comes back after a reload (Speed up step) |
| PASS | EN/ES: every page string and every practice string exists in both languages |
| PASS | practice page loads with no script errors |
| PASS | storage blocked: the practice page still works (every storage call is wrapped in try/catch) |
| PASS | keyboard: Space on the tap pad starts the band and then taps; Enter on "Next step" moves on |
| PASS | practice page desktop EN: no horizontal scroll, lang="en", axe finds no violations |
| PASS | practice page desktop ES: no horizontal scroll, lang="es", axe finds no violations |
| PASS | practice page phone EN: no horizontal scroll, lang="en", axe finds no violations |
| PASS | practice page phone ES: no horizontal scroll, lang="es", axe finds no violations |
| PASS | phone first load at most 1.2 MB (explore page, phone tier, same method as phase two) |
| PASS | pose solve well under 1 ms (median under 0.25 ms, p95 under 0.5 ms, both dancers) |
| PASS | hero poster at most 60 KB (WebP and AVIF) |
| PASS | hero loop: silent, 3–4 s, at most 300 KB as WebM and as MP4 |
| PASS | banner EN: CTA "Try the practice" goes to /practice/; no 3D, no WebGL, no avatar download on the homepage |
| PASS | banner ES: CTA "Prueba la práctica" goes to /es/practica/; no 3D, no WebGL, no avatar download on the homepage |
| PASS | staged route under the live site's CSP: the dancers need 'wasm-unsafe-eval' (meshopt decoder) and nothing else; with it, no violations |

Screenshots in `evidence/`: `desktop-page.jpg`, `phone-page.jpg`, `phone-page-es.jpg`, `phone-nojs.jpg`, `desktop-canvas.jpg`, `phone-canvas.jpg`, and `practice-{phone,desktop}-{en,es}.jpg`. Before/after images are in `evidence/changes/`.

## Re-check by the mission session

- Re-run at 2026-09-26 14:41 UTC with `FONTCACHE` and `AXE` set, as `README.md` says: **73 of 73 pass**, including the 6 axe checks (0 violations). `evidence/qa-results.json` is that run.
- Without `AXE`, the two phase-two axe checks are skipped (71 checks run), and the four practice-page axe checks used to pass without running axe. `qa/qa3.mjs` now fails those four when `AXE` is not set, so a check that never ran cannot pass.
