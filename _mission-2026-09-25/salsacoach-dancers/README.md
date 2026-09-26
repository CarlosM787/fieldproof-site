# SalsaCoach Dancers (private prototype, phase three)

Two life-size dancers in closed hold dance the salsa basic to the Count Lab's synthesized band. They step exactly on the count, and a five-step practice teaches the basic from listening to full speed.

- Not deployed anywhere, and not wired into the SalsaCoach app or website.
- **Not a release approval.** Nothing ships until Carlos and a salsa instructor rule; see `HUMAN_TEST_CARD.md`.
- For owners: `HANDOFF.md`. What changed: `CHANGES.md`. Measurements: `QA_RESULTS.md`. Routes compared: `COMPARISON.md`.

## How it works

1. **The step table.** `../salsacoach-count-lab/src/model.js` is the single step table, shared with the Count Lab.
2. **The count engine, `src/choreo.js`, is unchanged since phase two.** QA checks that its code is byte-identical (sha256).
   - A planted foot stays down until 0.6 of the beat.
   - The step travels with a smoothstep and lands on the count.
   - The weight changes on the landing.

   Phase three adds generated motion on top of it: a hip settle after the weight lands, an ankle roll, and relaxed hands. None of it moves a planted ball of the foot.
3. **`src/rig.js`:** analytic two-bone IK on the Rocketbox skeletons.
   - New: an ankle roll that pivots on the ball, and a toe-off that keeps the toe tip on the floor until the ball rises.
   - Also new: eyes that find the partner's eyes, and relaxed shoulders.
4. **`src/stage.js`:** the floor, lights and cameras, plus new soft contact shadows under each shoe.
5. **`src/overlays.js`:** count numbers at the landing spots and the centre-of-weight dot. `src/rhythm.js` holds the quick-quick-slow words.
6. **`src/voice.js`:** the count voice, a small formant synthesizer written for this page. There is no recording and no third-party voice. It is scheduled so each word's vowel lands on the beat.
7. **`src/practice.js`:** Listen → Find the 1 → Watch slowly → Step along → Speed up. `src/judge.js` is the Count Lab tap judge; QA shows identical verdicts on 10,000 taps.
8. **`src/main.js`:** the controls and the audio-clock loop.
   - New: overlays, half speed, step by step (the → key, Space, or a tap on the dancers), the count voice, lazy 3D, and the `#render` / `#qa` hooks.
9. **`src/banner/`:** the homepage banner for mysalsacoach.com, CSP-safe with no inline script.

## Build and test

```sh
npm i three@0.170.0 esbuild@0.24.0                  # or symlink an existing node_modules
MEDIA=../media node build.mjs                       # dist/: index, phone, desktop, practice, review(+artifact), site/
FONTCACHE=... AXE=.../axe.min.js node qa/qa.mjs     # 33 phase-two checks + phase-three checks -> evidence/qa-results.json
A=<phase-two dist> B=dist OUT=evidence/ab-timing.json node qa/ab.mjs   # same-machine A/B timing
CAM=1.2,0.1,4.1,0,0.9,0.21 OUT=../media/frames-hero node qa/hero.mjs  # banner loop frames (encode with ffmpeg)
node tools/poster.mjs ../media/frames-hero/f0000.png ../media      # poster WebP + AVIF, media.json
OUT=../media/frames-demo node qa/demo.mjs          # practice-flow demo frames + audio.wav (encode with ffmpeg)
DIST=<phase-two dist> OUT=evidence/changes/before node qa/compare.mjs; OUT=evidence/changes/after node qa/compare.mjs
python3 tools/pairs.py evidence/changes            # before/after pairs
```

Playwright's Chromium runs WebGL in software here (SwiftShader), so every frame time in this folder is a relative number, not a phone number.

## Status labels

- **On1** matches the Count Lab step table; its timing is measured on the posed skeletons.
- **On2 (Torres count and 2-3-4 count):** preview until an instructor reviews it.
- **The body is generated motion**, not motion capture. The count voice is a robot placeholder.
- **Media** (videos, frames) is private and not in git; it lives in `../media/`.
