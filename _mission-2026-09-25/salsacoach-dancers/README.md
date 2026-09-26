# SalsaCoach Dancers (private prototype)

Two life-size dancers in closed hold dance the salsa basic to the Count Lab's synthesized band, stepping exactly on the count.

- Branch only: `claude/carlos-master-mission-10mcvm`.
- Not deployed anywhere, and not wired into the SalsaCoach app or website.
- See `HANDOFF.md` for the owners' version: measurements, integration points, performance budget, rights, instructor questions, and the filmed-route plan.

## How it works

1. `../salsacoach-count-lab/src/model.js` is the single step table, the same one the Count Lab uses.
2. `src/choreo.js` turns the table into life-size targets for both dancers. It keeps the Count Lab's timing:
   - a planted foot stays down until 0.6 of the beat;
   - the step travels with a smoothstep and lands on the count;
   - the weight changes on landing.

   It adds heel peel on the ball of the foot, back steps that land on the ball, a free back foot rolling onto its ball, hips over the standing leg, and the hands in closed hold.
3. `src/rig.js` poses the Rocketbox (3ds Max Biped) skeletons with analytic two-bone IK in avatar space:
   - legs and arms are solved analytically;
   - the pelvis gets roll and turn, and the chest counter-rotates;
   - the head looks toward the partner;
   - the toes stay flat while the ball is down;
   - the fingers curl.
4. `src/audio.js` is the Count Lab band and scheduler. The dancers are drawn from the heard audio time (`getOutputTimestamp`), never from the animation clock.
5. `src/stage.js` and `src/dancer.js` hold the renderer, lights, a wood floor drawn in code, the camera views, and the floor marks:
   - the weighted footprint glows;
   - an outline shows where a foot in the air will land;
   - a ring pulses on each landing.
6. `src/main.js` holds the controls:
   - play, tempo 60–220;
   - On1 or an On2 preview;
   - loop 1–8, 1–4 or 5–8;
   - both dancers, leader or follower;
   - four camera views, drag to orbit, mirror;
   - EN/ES, reduced motion;
   - step through the counts.

   It also has the deterministic `#render` / `#qa` hooks.

## Build and test

```sh
npm i three@0.170.0 esbuild@0.24.0                 # or symlink an existing node_modules
node build.mjs                                     # dist/index.html (demo) + dist/review.html (demo + review sections)
FONTCACHE=... AXE=.../axe.min.js node qa/qa.mjs    # 33 checks -> evidence/qa-results.json
node qa/proof.mjs && python3 tools/contact_proof.py .   # evidence/contact-proof.png
node qa/phone-video.mjs; node qa/clips.mjs         # frames + band audio for the videos (encoded with ffmpeg)
node tools/prep-avatars.mjs in.glb out.glb        # re-prepare an avatar (glTF-Transform + meshopt)
```

Playwright's Chromium runs WebGL in software here (SwiftShader), so the frame rates in this folder are not phone numbers.

## Status labels

- **On1:** matches the Count Lab step table. Timing is measured on the posed skeletons; see `evidence/`.
- **On2 (Torres count and 2-3-4 count):** preview only, until an instructor reviews them.
- **The body:** hips, arms and heads are a considered approximation, not motion capture.
- **Videos:** the rendered videos are private and are not in git. Only code, the avatar assets (MIT, with notice), the QA script, the QA results and the charts are committed.
