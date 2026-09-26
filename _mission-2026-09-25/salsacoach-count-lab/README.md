# SalsaCoach Count Lab (prototype)

A single-page, dependency-free prototype that teaches the salsa basic step against the count:
leader and follower on one shared floor, a synthesized band underneath, and a tap trainer for
hearing the 1. Built 2026-09-25 as an isolated prototype. **Not deployed, not linked from
mysalsacoach.com, not reviewed by an instructor.**

- Private preview (Carlos's account): https://claude.ai/artifact/46Sq2Lapybz8L5Pcia4PjX
- Source of truth for the steps and the band: [`src/model.js`](src/model.js)

## What it adds to the 9/25 footwork teacher

The footwork teacher (procedural SVG feet, `web/authority-v1` @ `183d937`, not pushed)
stays the exact reference for one dancer's feet. This prototype tests three things it does not do:

1. **Partner floor, any angle.** Both dancers on one floor, facing each other, drawn with a small
   hand-written perspective projection on Canvas 2D (no WebGL, no library). Drag to orbit; presets
   for behind the leader, behind the follower, side and above; mirror toggle. Legs and hips are a
   motion-capture-style skeleton computed from the feet (two-bone IK), and a plumb line from the
   hips shows which foot carries the weight. This is the cheap version of "selective 3D for angles
   and hips".
2. **Find the 1.** Tap on every 1 while the band plays. Each tap is timed against the heard audio
   (`AudioContext.getOutputTimestamp`), with an optional per-device calibration, a ±110 ms window,
   and a specific message when the tap lands on 5 instead of 1.
3. **Band X-ray.** Bell, clave, congas and bass shown as lanes on the same 16-slot grid as the
   count strip, each with a mute, so a learner can hear what marks the 1 and what does not.

## Conventions shown (see the page's "Open questions for an instructor")

| Pattern | Steps | Breaks | Source |
|---|---|---|---|
| On1 | 1-2-3, 5-6-7 | 1 (leader L forward), 5 | timing research 7.3 |
| On2 · Torres count | 1-2-3, 5-6-7; 1 and 5 are small prep steps | 2 (leader R back), 6 (leader L forward) | timing research 7.4, V1 |
| On2 · 2-3-4 count | 2-3-4, 6-7-8 | 2 (leader R back, as the app models it; sources disagree), 6 | timing research 6.13, §11 Q1 |

The follower mirrors the leader: her right foot moves with his left, in the same world direction.
Band patterns are traditional (2-3 son clave on 2, 3, 5, 6&, 8; bell mouth strokes on 1-3-5-7;
conga slap on 2 and 6 and open tones on 4-4& and 8-8&; bass on 2& and 4), arranged and synthesized
in the browser. No recordings are used.

## Measured (2026-09-26, headless Chromium 141.0.7390.37 in a cloud container; not a phone)

| Check | Result |
|---|---|
| QA suite (`qa/qa.mjs`) | 15/15 pass: layout at 1440 and 384 px, no horizontal scroll, EN/ES switch, no-JS tables (24 rows), reduced motion follows the OS, axe WCAG 2.1 A/AA 0 violations, sync, tap judge |
| Visual count flip after the beat is heard | Latest run (2026-09-26 03:24 UTC): 120 BPM median 5.0 ms · 180 BPM 11.0 ms · 220 BPM 9.4 ms (p95 ≤ 17.2 ms, never early; n = 16–17). Earlier runs landed in the same 0–17 ms band; the number moves with where the frame clock falls |
| Tap judge (synthetic taps) | three taps aimed at 1 scored "On the 1" (+8 ms); a tap on 5 scored "That was the 5" |
| Weight | whole page 21.4 KB gzipped (JS 14.3 KB, CSS 3.1 KB), about 150 KB transferred including fonts. The video-capture hooks are stripped from this build and live only in `dist/render.html` (noindex, never deployed) |
| Lighthouse 12.8.2, mobile (median of 3) | Performance 98 · LCP 1.81 s · CLS 0 · TBT 0 ms · Accessibility 100 |
| Lighthouse, desktop | Performance 100 · LCP 0.40 s · CLS 0 |

The first Lighthouse run measured CLS 0.108 (mobile) and 0.312 (desktop): web fonts swapping in
reflowed the headline. Fixed with `font-display: optional`, condensed system fallbacks and a
preload of the display font. Lighthouse cannot measure INP, and none of this proves sync on a real
phone or with Bluetooth audio; that needs Carlos's S25 check (below).

## Run it

```sh
node build.mjs                 # checks every pattern loops, writes count-lab.html + dist/index.html
AXE=path/to/axe.min.js node qa/qa.mjs   # needs Playwright + Chromium (PW_ROOT / CHROME env vars)
```

`count-lab.html` is the artifact body (no doctype; the artifact host adds it). `dist/index.html`
is a complete page (`noindex`).

## Before anyone outside sees it

1. An instructor answers the six questions on the page (Carlos chooses who; nobody is contacted
   for him).
2. Carlos's S25 check: phone speaker and Bluetooth, 150 and 180 BPM, "does the foot land when I
   hear the count?" and "does Find the 1 agree with my ear?".
3. Publishing goes through the mysalsacoach.com owner and a deploy batch (Netlify credits).
