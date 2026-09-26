# Four ways to show the salsa basic: filmed, 3D, SVG feet, hybrid

Date: 2026-09-26. Labels: **VERIFIED** (measured in this lane, see `QA_RESULTS.md`), **REPORTED** (from a named record), **PROPOSED** (recommendation), **OPEN** (unknown).

Sources:
- 3D dancers: this folder (phase three), measured today in headless Chromium with software WebGL.
- Filmed route: the phase-two capture plan in `HANDOFF.md` (plan only, nothing filmed).
- SVG feet: the public-authority chat's footwork-teacher handoff, Drive file `SALSACOACH_FOOTWORK_TEACHER_HANDOFF_2026-09-25.md` (REPORTED, local-only commit `183d937`, not pushed or deployed).

## What each can and cannot teach

| | Filmed real dancers | Controllable 3D (this) | Procedural SVG feet | Hybrid |
|---|---|---|---|---|
| **Can teach** | Real styling, frame, connection, Cuban motion as a human does it | Exact timing (lift at 0.6 of the beat, weight lands on the count), weight transfer, any angle, any tempo, half speed, one count at a time, one role alone | Exact timing and weight of the feet, breaks, pauses, centre of weight | Timing from the SVG or 3D layer; the body from one filmed clip per style |
| **Cannot teach** | Tempos beyond about ±25% of each take; angles, roles or conventions that were not filmed; clean slow motion below about 0.75× | Real styling or musicality. Hips, chest, arms and eyes are **generated motion**, not captured. No lead and follow, no turns | Hips, frame, partner connection, 3D angles | Keeping two sources in step takes care |
| **Truth to the step table** | Only as good as the dancers on the day; needs frame-by-frame checking | Same table as the Count Lab; engine code byte-identical to phase two (VERIFIED, sha256) | Generated from the app's model; the build fails on any mismatch (REPORTED) | The timing layer is exact |

## Rights, cost, weight, cadence, access, sync

| | Filmed | 3D (this) | SVG feet | Hybrid |
|---|---|---|---|---|
| **Rights and releases** | Model releases (web, app, ads), location, music. Use the synthesized band during capture | Rocketbox avatars MIT with notice; three.js MIT; band and count voice are this project's own code. Get a legal read on avatar likeness before paid ads (REPORTED, phase two) | All original (REPORTED) | Releases for the clip only |
| **Cost to finish** | Two dancers, a paid half day, releases, editing: 27 takes × 3 angles in the plan (PROPOSED, phase two) | Built. Owed: instructor review, real-phone test, a recorded voice | Built. Owed: instructor rulings, phone test (REPORTED) | SVG cost + one short shoot after the rulings |
| **Weight** | About 15 MB per 30 s 1080p take; a library of about 1.2 GB; a few MB per view (PROPOSED estimate) | Phone first load 1.17 MB uncompressed for the explore page (VERIFIED; 0.19 MB of it is the page, gzipped). The practice page downloads **no** 3D until the visitor taps Start (VERIFIED) | About 13 KB gzipped (REPORTED) | 13 KB + one clip |
| **Update cadence** | Any change means a reshoot | A code change plus the QA run, same day | A code change plus 17 checks, same day | Timing same day; the clip only when styling changes |
| **Accessibility** | Needs captions and a text description; video autoplay rules | Step table without JavaScript, EN/ES, keyboard, screen-reader labels, reduced motion snaps to the count, axe 0 violations (VERIFIED). Needs WebGL for the figure; the table is the fallback | Filmstrip without JavaScript, EN/ES, keyboard, reduced motion (REPORTED) | Both layers' features |
| **Sync with the band** | Fixed tempo per take; a clap slate and a beat map; stretching the video changes the dancers too | Drawn from the heard audio clock (`getOutputTimestamp`); each count drawn on the first frame after it is heard, also at half speed (VERIFIED headless). Real phone and Bluetooth: OPEN | Visual count change 5–8 ms after the beat is audible, headless (REPORTED) | The timing layer runs on the clock |

## Recommendation (PROPOSED)

1. **Website /learn/ pages:** the SVG footwork teacher stays the default embedded tool. At 13 KB, with a crawlable filmstrip, it is the lightest exact tool. It waits for the instructor rulings.
2. **Homepage:** use the banner in this folder: a 14–23 KB poster and a 3.2 s silent loop (222–228 KB, loaded only on screen), with no 3D. Its button goes to a `/practice/` route, which loads the 3D only after the visitor taps Start.
   - Lighthouse mobile (lab, local build, median of 3): the banner test page scores LCP 1.05 s, CLS 0, performance 100, accessibility 100.
   - On a copy of today's homepage, adding the banner below the hero moved LCP from 1.72 s to 1.86 s (the LCP element stays the h1) and added 20 KB. The likely cause is the banner's separate stylesheet, which blocks rendering; folding `banner.css` into the site's `style.css` should remove most of that (PROPOSED, not measured).
   - The route needs `'wasm-unsafe-eval'` added to `script-src` for `/practice/*` only. The avatars are meshopt-compressed and the decoder is WebAssembly; under today's policy it is refused (VERIFIED with the live `_headers` policy).
3. **App:** whatever figure the app keeps, port the timing. Pose every frame from the transport clock, and let the weight land on the count. This is fix B in the footwork handoff (`dancer.tsx` eases the weight after the beat). `src/choreo.js` shows the exact rule.
4. **Filmed:** after the rulings, shoot one short reference clip per style with the instructor, signed releases, and the synthesized band played during capture. Use it as the human reference for the body, not as the timing engine.
5. **Motion-capture hybrid** (the instructor's motion retargeted onto these avatars): park it. It needs a paid tool and Carlos's decision.

## Limitations (stated plainly)

- No instructor has reviewed any of it.
  - Both On2 counts are previews.
  - The hip settle, counter-rotation, relaxed arms and eye focus are generated motion.
- No real phone has run it. Every frame-rate number here comes from software WebGL, so only relative numbers mean anything.
- The count voice is a robot voice made in the browser. No person has judged whether it is intelligible (see `HUMAN_TEST_CARD.md`).
- The Lighthouse numbers are lab numbers on a local build, not field data.
- Nothing in this folder is a release approval.
  - Nothing ships to the app or the website until Carlos and a salsa instructor rule.
  - Each surface's owner makes the change.
