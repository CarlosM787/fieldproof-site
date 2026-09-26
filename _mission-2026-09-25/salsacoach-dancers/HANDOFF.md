# SalsaCoach Dancers: handoff for the app and website owners

## Phase three (2026-09-26): what is new, and what it still is not

Status: a private prototype in the mission's phase-three lane. It is not on mysalsacoach.com or in the app, and no repository owned by another chat was edited. Each surface's owner decides whether and how it ships. **Nothing ships until Carlos and a salsa instructor rule** (`HUMAN_TEST_CARD.md`).

- **What changed:** `CHANGES.md`, with before/after images.
  - The count engine code is byte-identical to phase two, and all 33 phase-two checks still run.
  - Added: generated body motion (hip settle, counter-rotation, relaxed hold, eye focus), a clean foot plant (toe-off, ankle roll, contact shadows), teaching overlays (count numbers at landing spots, centre-of-weight dot, quick-quick-slow), half speed, step by step, and a robot count voice written for this page.
- **Practice flow** (`dist/practice.html`, staged as `dist/site/practice/`): Listen → Find the 1 (the Count Lab judge) → Watch slowly → Step along → Speed up. The 3D loads only when the visitor taps Start. The only thing stored is the last tempo.
- **Homepage banner** (`src/banner/`, `dist/site/banner/`): a poster and a 3.2 s silent loop rendered from the real scene. No 3D on the homepage. The CTA goes to `/practice/` (EN) or `/es/practica/` (ES).
- **CSP finding** (website owner): the avatars are meshopt-compressed, and the decoder is WebAssembly. The live policy (`script-src 'self' …`) refuses it.
  - Add `'wasm-unsafe-eval'` to `script-src` for `/practice/*` only. Nothing else is needed (QA check against the exact `_headers` line).
  - The banner itself needs no change: no inline script, same-origin media.
- **Measurements and results:** `QA_RESULTS.md`. The routes compared, with a recommendation: `COMPARISON.md`.
- **Still owed:** instructor rulings; Carlos's S25 ear test; a real-phone test (Bluetooth included); a human judgment of the robot voice; and a recorded voice before release.

---

# Phase two (2026-09-26), kept for the record


Status (2026-09-26): private prototype on the mission branch only. It is not on mysalsacoach.com or in the app, and this session did not edit either repository. Whoever owns each surface decides whether and how it ships.

## What it is

Two life-size, textured dancers in closed hold dance the salsa basic. They follow the Count Lab step table and audio clock:
- a foot leaves the floor at 0.6 of the beat and lands on the count;
- the weight changes on the landing;
- the band is synthesized in the browser.

On1 is the accurate mode. The two On2 counts are labelled previews until an instructor reviews them. Motion comes from inverse kinematics on the step table, not motion capture: the steps and timing are exact, while the hips, arms and heads are an approximation.

## Measured (headless Chromium 141, software WebGL, 2026-09-26)

| | Desktop (full tier) | Phone (lite tier) |
|---|---|---|
| Bytes on first load | 2.18 MB (13 files) | 1.14 MB (9 files) |
| Page with inlined JS, gzipped | 178 KB | 178 KB |
| Avatars (2 GLB, gzipped) | 81 + 114 KB | 81 + 114 KB |
| Textures | 10 WebP, 1024 px incl. normal maps, 1.26 MB | 6 WebP, 512 px, 214 KB |
| Draw calls / triangles | 24 / 21.6 k | 24 / 21.6 k |
| JS heap after load | 5.5 MB | 8.2 MB |
| Estimated GPU memory, textures + shadow map + lighting environment (computed from sizes, not measured) | about 81 MB: 10 × 5.3 MB avatar maps, 5.3 MB floor, 16 MB shadow map, about 6 MB environment | about 19 MB: 6 × 1.3 MB avatar maps, 1.3 MB floor, 4 MB shadow map, about 6 MB environment |
| Pose solve, both dancers (CPU) | 0.044 ms median, 0.15 ms p95 per frame | same code; expect 3 to 5 times slower on a mid-range phone |

Frame rate and load time under software WebGL are not phone numbers. The first real-phone run (S25 and a mid-range Android, with Bluetooth headphones) is still owed. The QA script (`qa/qa.mjs`) prints everything above.

Timing and contact proof, in `evidence/qa-results.json` and `evidence/contact-proof.png`:
- The posed skeletons were sampled 100 times per beat for On1 and both On2 counts.
- Every step lands on its count: the ball of the foot reaches its spot no earlier than 0.01 beat (4 ms at 150 BPM) before the count, and never after.
- Feet leave the floor only after 0.6 of the beat.
- A planted foot moves 0.0 mm.
- Legs reach every target with no stretch.
- On every count, both dancers' hips sit over the weighted foot.
- Knees always bend forward.
- The joined hands stay 10 cm apart.
- Reduced motion snaps poses to the count.
- axe reports no violations at desktop or phone width.
- With JavaScript off, the step table still shows.
- 33 of 33 checks pass.

## Integration points

- `src/choreo.js`: pure functions and no DOM.
  - `beatState(p, pattern, loop, reduced)` is the Count Lab's `poseAt`, parameterised.
  - `dancerTargets(role, beatState)` gives world-space foot, heel and hip targets.
  - `holdTargets()` places the hands for closed hold.
  - It reads `../salsacoach-count-lab/src/model.js`, the single step table. If the app keeps its own table, port this file and point it at that table.
- `src/audio.js` is the Count Lab band and look-ahead scheduler. `heardBeats()` drives the dancers from what the listener hears, corrected by `getOutputTimestamp`. Draw from this clock, never from `requestAnimationFrame` time.
- `src/rig.js` is analytic two-bone IK for any 3ds Max Biped skeleton, including the whole Rocketbox library. Swapping in other avatars means changing two URLs in `src/dancer.js`.
- `src/dancer.js` and `src/stage.js` hold loading, materials, lights, the wood floor, the camera views and the floor marks.
- Hooks: `#render` and `#qa` expose `window.__dance` for deterministic frames, probes and offline audio. Production builds can drop them.
- React Native / Expo app: the same modules run in a WebView. The other option is expo-gl with three.js, where the page's audio clock would have to be replaced by the app's existing audio clock.

## Performance budget proposed for a public page

- Nothing 3D before the viewer asks for it. The page shows a poster, and the 3D (about 1.1 MB on phones) loads on the first tap of Play.
- Phones use the 512 px textures with no normal maps, a pixel ratio capped at 1.5 and a 1024 shadow map.
- Budgets: JS no more than 180 KB gzipped (three.js is most of it), under 20 ms per frame on a mid-range phone, and no layout shift from the stage (it has a fixed aspect ratio).
- On a homepage, use the banner concept instead: a 3-second muted loop video and a poster, with no WebGL.

## Rights

See `assets/NOTICE.md`:
- The avatars are Microsoft Rocketbox under the MIT licence. Commercial use is allowed if the notice travels with the files.
- No recorded music is used.
- three.js is MIT.
- Get a legal read on avatar likeness before using them in paid advertising.

## Questions for an instructor (these block On2 and a public "correct technique" claim)

1. Is a 24 cm break and a 42 cm partner distance (ankle to ankle) right for a social basic? Should the slow-tempo teaching mode use larger steps?
2. Does the foot leave the floor at the right moment (0.6 of the beat)? Should the weight arrive on the count or slightly before it?
3. Heel use: here forward steps land flat, back steps land on the ball and then lower the heel, and a free back foot rolls onto its ball. Is that what you teach?
4. Hip action: here the pelvis shifts 4.5 cm over the standing leg with a small roll and turn, and the chest stays quiet. Too much, too little, or wrong in timing?
5. Hold: joined hands at about the follower's shoulder height, 45 cm out to the leader's left; the leader's right hand on her left shoulder blade; her left hand on his right shoulder. Should anything change for beginners?
6. On2, Torres count and 2-3-4 count: which should the site call On2? And does the leader break back or forward on 2 in the 2-3-4 count?
7. Should the default camera be behind the student's own role, or a mirror view?

## Route 1: filmed dancers (plan only, nothing captured)

- **Talent and rights:**
  - two real dancers (ideally the SalsaCoach instructor and a partner);
  - a paid session;
  - signed model releases covering web, app and advertising;
  - original music or the synthesized band.

  Never use other people's footage.
- **Capture:**
  - three phones on tripods recording at once (behind the leader, behind the follower, side), 4K at 60 fps, fixed exposure;
  - tape marks on the floor for home and break positions;
  - a clap slate at the start of each take;
  - the band played from a laptop at a fixed tempo, so every take shares a beat grid.
- **Takes:**
  - 3 conventions × 3 tempos (90, 150, 190 BPM) × 3 role variants (couple, leader alone, follower alone);
  - that makes 27 takes of about 30 s each, times 3 angles, plus spares;
  - about half a day of studio time.
- **What video can do:**
  - tempo within about ±25% (`playbackRate` with `preservesPitch`);
  - cuts between the filmed angles;
  - mirror with a CSS flip;
  - loop 1–4 and 5–8 by time ranges;
  - count overlays locked to frames with `requestVideoFrameCallback` and a beat map.
- **What video cannot do without more takes:**
  - any camera angle between the filmed ones;
  - the leader or follower alone;
  - another convention;
  - clean slow motion below about 0.75× (the stand-in shows the limits).
- **Bandwidth:** about 15 MB per 30 s 1080p take, so the library is about 1.2 GB. Each view streams a few MB, compared with 1.1 MB once for the 3D dancers.
- **A hybrid worth pricing:** markerless motion capture of the instructor, retargeted onto these avatars. It keeps every 3D control and adds real styling, but it needs a paid tool and Carlos's decision.
