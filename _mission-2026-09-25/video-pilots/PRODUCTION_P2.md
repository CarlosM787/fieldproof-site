# Making the pilots again: one command each, what everything costs, and who owns what

**Scope:** the v2 pilots (Clave Lab "Where is the 1?" v2; Lake Powell v2, as a 16:9 story and a
9:16 Short).

**Status:** private renders only. Nothing is uploaded, nothing is bought, and no account is used.
Rendered media never goes into git.

Labels used here:
- **VERIFIED:** measured or read here, on 2026-09-26.
- **REPORTED:** taken from `YOUTUBE_RESEARCH.md`.
- **INFERENCE:** my estimate.
- **OPEN:** not checked.

## 1. One command per pilot

```sh
# Linux / macOS / WSL / Git Bash
./run.sh pilot-a            # Clave Lab v2 Short: capture, mix, compose, sync and loudness checks
./run.sh pilot-b            # Lake Powell v2: 16:9 story + 9:16 Short, then every number re-verified
./run.sh thumbs             # three 1280x720 thumbnails (needs pilot-a's capture)
./run.sh all --out D:/render_cache/pilots
./run.sh check              # re-measure what is already rendered

# Windows PowerShell (same thing)
py run.py all --out D:\render_cache\pilots
```

`run.py` writes `<out>/run-report.json`: each step's wall time, the output sizes and the measurements.

| Option | Meaning |
|---|---|
| `--out DIR` | Where the private media goes. The default is `./out`, which git ignores. On Windows, point it outside OneDrive or Dropbox. |
| `--final` | Drops the "PRIVATE PILOT v2 · NOT PUBLISHED" mark. Only for a render Carlos has approved for upload. |
| `--floor-dir DIR` | Pilot A: use another dancer renderer's frames (§3). The Count Lab capture then renders audio only. |
| `--only long\|short` | Pilot B: render one of the two formats. |

### One-time setup on Carlos's PC (Windows)

1. **Python 3.10 or newer**, then `py -m pip install numpy pillow imageio-ffmpeg fonttools`.
   - imageio-ffmpeg brings its own FFmpeg with libx264, so nothing else is needed for encoding.
   - Matplotlib is only needed to re-render the v1 Pilot B.
2. **Node 18 or newer**, then in `video-pilots/`: `npm i playwright` and `npx playwright install chromium`.
   - `capture.mjs` finds Playwright in the current folder.
   - Only Pilot A needs Node. It drives the Count Lab page for the synth and the dancer floor.
3. **Fonts.**
   - Pilot A's fonts are in `video-pilots/fonts/` (OFL, see §4).
   - Pilot B uses `../xbot/fonts/`.
4. **The Count Lab capture page.** `../salsacoach-count-lab/dist/render.html` is committed. Run
   `node build.mjs` there only after changing the Count Lab source.

### What each command runs

**Pilot A (`pilot-a`)**

1. `clave-lab/capture.mjs` opens the Count Lab page headless and renders its own synth offline:
   - the full mix, plus four one-lane stems, on the page's clock;
   - with 6 dB of export headroom, so the page's 16-bit export can't clip;
   - 960 floor frames, in the page's phone layout, on the camera path set in `episode_v2.mjs`.
2. `clave-lab/mix_v2.py` post-processes those renders in Python. The page itself is not modified.
   - It trims the page's 0.1 s lead.
   - It wraps the tail, so the Short loops.
   - It trims levels through the stems: bell +5 dB, bass −3 dB.
   - It adds phone-safe harmonic layers for the bass and the conga open tones.
   - It adds mono-safe stereo.
   - It levels quiet bars and masters to −14 LUFS with a true-peak limiter.
3. `clave-lab/compose_v2.py` draws the 1080×1920 frames around the floor layer and encodes H.264
   (CRF 16, BT.709) with AAC at 192 kbit/s.
4. Checks:
   - `sync_check.py`: audio clock vs model;
   - `review/av_sync.py`: picture vs sound, read from the MP4 itself;
   - `review/audio_check.py loudness`.

**Pilot B (`pilot-b`)**

1. `desert-systems/lake_powell_v2.py` does four things:
   - computes every fact from the CSV;
   - synthesizes the stems (mallets, chimes, drone, bells, gong);
   - masters the audio (−14.5 LUFS for 16:9, −14.0 for the Short);
   - draws and encodes both formats, writing a manifest of every number drawn.
2. `review/verify_powell.py` recomputes everything from the CSV with a different algorithm. It checks
   every frame's numbers and every string. It exits with an error on any mismatch.

## 2. Measured on this machine, estimated on Carlos's PC

**This machine (VERIFIED):** a cloud container with 4 vCPUs (Intel Xeon @ 2.80 GHz), 15 GB RAM, no
GPU. The numbers below are from `run.py all` (see §6 for the report).

| Step | Wall time here |
|---|---|
| A1 capture: the Count Lab synth (mix and 4 stems) plus 960 floor frames | 38.0 s |
| A2 mix: layers, stereo, leveller, mastering | 23.9 s |
| A3 compose: 960 frames, x264 CRF 16 `slow` | 84.4 s |
| A4–A6 checks: loudness, audio clock, A/V in the MP4 | 3.8 s |
| **Pilot A, total** | **about 2.5 minutes** |
| B1: both formats (sound, 3,060 frames, two encodes, manifests) | 311.6 s (5.2 min) |
| B2: the number verifier, 17,996 checks | 0.1 s |
| T1: thumbnails | 1.0 s |
| **Everything (`run.py all`)** | **462.8 s (7.7 min)**, exit 0 |
| *Experimental:* the 3D Dancers floor (`capture_dancers.mjs`, SwiftShader software WebGL) | about 2 s per frame here, from 5 test frames. Roughly 30 minutes for 960 frames (INFERENCE); probably much faster with `GL=gpu` on the 2070 Super. |

**Carlos's PC** (RTX 2070 Super 8 GB, 32 GB RAM, Windows). The CPU model is not known.
- The pipeline is CPU-bound: Pillow drawing, x264 encoding, numpy audio, headless Chromium. The GPU
  is barely used.
- A typical desktop CPU of the 2070 Super's generation, with 6–8 cores, should run it at about the
  same speed or faster: roughly **5–10 minutes for all three videos** (INFERENCE).
- Measure it once with `py run.py all` and read `run-report.json`.
- NVENC hardware encoding could replace x264, but encoding is not the slow part, and x264 at CRF 16
  gives cleaner flat graphics. Not worth changing.

**Disk per episode** (VERIFIED sizes from this run):

| Item | Size |
|---|---|
| Pilot A floor frames (960 JPEG; intermediate) | 52 MB |
| Pilot A page mix and 4 stems (intermediate) | 31 MB |
| Pilot A final audio (WAV) | 5.9 MB |
| **Pilot A MP4** (32 s) | **7.3 MB** |
| Pilot B WAVs (16:9 and Short) | 13 MB and 8 MB |
| **Pilot B MP4s** (16:9 and Short) | **about 4.6 MB and 2.8 MB** |
| Thumbnails | 0.4 MB |
| One full run, all of the above | about 125 MB |

- The floor frames and stems are intermediates: delete them after the final render, or keep them
  for a re-mix.
- Keep `--out` outside cloud-synced folders. Only the kilobyte-sized specs and code live in git.

### Weekly effort (INFERENCE; the machine time above is the small part)

| Cadence | Carlos's hours per week | Mostly spent on |
|---|---|---|
| **Clave Lab, 2 Shorts a week** (recommended start) | **3–5 h** | A new episode spec with captions EN/ES (1 h each); watching on a phone plus an ear check (0.5 h each); optional voice take (0.5 h each); upload and metadata (0.3 h each) |
| Clave Lab, 2 Shorts plus 1 long lesson a month | 5–8 h | As above, plus the long lesson (research: 6–9 h each once templates exist) |
| Adding Desert Systems, 1 data Short every 2 weeks | +2–4 h | Data refresh and checks (the verifier automates the numbers); story beats; review |
| Adding a voiced 6–8 min data explainer every 2 weeks | +5–8 h | Research, script, voice, edit (research: 10–16 h per episode) |

The first new episodes will take two to three times longer, until the spec format feels routine
(INFERENCE, matching the research file).

### Cost

**Free now (VERIFIED licences, §4):** every tool, library, font and dataset in this pipeline. There
are no subscriptions and no per-render fees.

**Electricity (INFERENCE):** negligible.
- A full `run.py all` is a few minutes of CPU. At an **assumed** 0.3 kW draw, 10 minutes is about
  0.05 kWh.
- The research file **assumed** $0.15/kWh, which makes about $0.01. Check the actual Tucson Electric
  Power rate; it wasn't verified.

**Would cost money (prices OPEN; none are needed for these pilots):**
- A USB microphone for Carlos's voice-overs. This is the one purchase worth considering.
- DaVinci Resolve Studio, only if he wants its paid features. The free version edits and exports
  1080p.
- Paid AI voice, music or video tools. Not recommended (see `REVIEW_P2.md`).
- Remotion's company licence, only if Morales Labs grows to 4 or more people and adopts Remotion
  (REPORTED: $25 per seat per month). The current pipeline doesn't use Remotion.

## 3. The swappable floor (Pilot A): the contract for other dancer renderers

The dancers are one layer. The coordinator's realistic 3D dancers (or anything else) can replace the
Count Lab floor without touching the lesson, captions, band lanes or audio.

```sh
python clave-lab/compose_v2.py --write-clock clock.json            # the per-frame clock, for the renderer
# ... the renderer writes DIR/f00000.png ... DIR/f00959.png (+ optional DIR/floor.json)
python run.py pilot-a --floor-dir DIR                               # or compose_v2.py --floor-dir DIR
```

**Frames**
- There is one image per video frame: `f00000.png` (or `.jpg`) up to `f{N-1}`. N = seconds × fps
  = 960 for this episode.
- Frame f shows the dancers at t = (f + 0.5) / fps on the final audio clock. That is:
  - beat = (t − audioOffset) × bpm / 60;
  - count = floor(beat) mod 8 + 1;
  - the pose the Count Lab model gives for position beat mod 8.
- The model's rule for On1: the weight lands on the count, and the foot lifts in the last 40% of the
  beat.
- `clock.json` lists `t`, `beat`, `count`, `pos`, `measure`, `kind` and the Count Lab camera for
  every frame. A renderer reads it and never recomputes the clock.

**Any size**
- The image is fitted into the 1040×700 floor box with `--floor-fit cover` (fill and crop; the
  default) or `contain` (letterbox).
- RGBA PNGs are composited over the video background, so a transparent 3D render drops in cleanly.

**Safety checks**
- If `DIR/floor.json` exists, its `fps`, `frameTime`, `bpm` and `audioOffset` (and `frames` ≥ N)
  must match the episode, or the render stops. VERIFIED: a manifest with bpm 160 was rejected.
- Missing frames stop the render. Nothing is interpolated.

**Tested**
- A stand-in renderer (transparent 800×600 PNGs showing their own frame number and count) was
  composited with `--floor-fit contain`.
- Its frame counter agreed with the video's count row: f105 → count 1 at 3.5 s. VERIFIED.

The full contract is in the docstring at the top of `clave-lab/compose_v2.py`.

**Experimental: the 3D SalsaCoach Dancers as the floor.** `clave-lab/capture_dancers.mjs` drives
the Dancers page's own render hooks (`window.__dance`: `size`, `cam`, `frame`, `shot`). It renders
the life-size avatars on this episode's clock, following the episode's camera path adapted for
life-size figures, and writes a floor folder with its `floor.json`.
- One command: `py run.py pilot-a --dancers`. Build `../salsacoach-dancers` first with
  `npm i && node build.mjs`. The output is `where-is-the-1-v2-dancers.mp4`, next to the Count Lab
  version.
- **Status:** tested on 5 stills only. They show the two avatars in closed hold at 1040×700, the
  camera following the episode's path.
- The full 960-frame render was **not** run here: SwiftShader takes about 2 s per frame. That run,
  a phone-scale look at it, and the camera mapping are open items.

## 4. Asset and rights ledger

### Fonts: all under the SIL Open Font License 1.1 (VERIFIED from each file's name table)

| Font | Used in | Copyright (from the file) | Where it lives in the repo |
|---|---|---|---|
| Big Shoulders Display ExtraBold 2.002 | Pilot A | © 2019 The Big Shoulders Project Authors | `video-pilots/fonts/` with the full `OFL-1.1.txt` and `FONTS_LICENSE.txt` |
| Atkinson Hyperlegible Regular and Bold 1.006 | Pilot A | © 2020 Braille Institute of America, Inc. | `video-pilots/fonts/` |
| JetBrains Mono Medium 2.211 | Pilot A | © 2020 The JetBrains Mono Project Authors | `video-pilots/fonts/` |
| IBM Plex Sans Condensed 400/600/700, IBM Plex Mono 500 | Pilot B, thumbnails | © 2017/2019 IBM Corp. | `xbot/fonts/` (already committed, with its note) |

- The OFL allows use, embedding and redistribution with the licence text, but not selling the fonts
  on their own.
- Per its preamble, the licence "does not apply to any document created using the fonts". The
  videos carry no font obligation (INFERENCE, not legal advice).

### Data

**USGS NWIS site 09379900** (Lake Powell at Glen Canyon Dam), daily lake elevation, parameter 62614.
- US federal data, generally public domain; credit is requested (REPORTED).
- The committed copy came from a third-party GitHub mirror (`ebootheee/powell`, cached 2026-09-25),
  because this sandbox blocks usgs.gov.
- The values are **provisional**.
- **Before any upload:** refresh from USGS directly, then re-run `pilot-b`. The verifier re-checks
  every number.

**Thresholds:** 3,490 ft minimum power pool, and 3,525 ft protection target (2019 drought plan).
- Both are REPORTED Reclamation figures, not checked on usbr.gov.
- Confirm them there before any upload.

### Code and tools

Versions are the ones in this container.

| Component | Licence | Notes |
|---|---|---|
| The Count Lab (model, synth, floor renderer) and every script here | Carlos's own code | The synth voices are original code; the rhythm patterns are traditional (clave, tumbao, campana) |
| numpy 2.4.6 | BSD-3-Clause (plus bundled permissive licences) | VERIFIED from package metadata |
| Pillow 12.3.0 | MIT-CMU | VERIFIED |
| fontTools 4.66.0 | MIT | VERIFIED; used for the glyph checks |
| imageio-ffmpeg 0.6.0 | BSD-2-Clause | VERIFIED; the Python wrapper |
| FFmpeg 7.0.2 static build bundled by imageio-ffmpeg | **GPL v3** (built with `--enable-gpl --enable-version3`, includes libx264) | VERIFIED from `ffmpeg -version`. Used as a program. Running it doesn't put the videos under the GPL (INFERENCE). Don't redistribute the binary without its source offer. |
| matplotlib 3.11.2 | PSF-based matplotlib licence | v1 Pilot B only |
| Playwright 1.56.1 | Apache-2.0 | VERIFIED from package.json |
| Chromium 141 (Playwright build) | BSD-3-Clause plus third-party licences | Headless renderer for the capture |
| Node.js 22 | MIT | |

**H.264/AAC patent licensing:** OPEN, not re-checked.
- Last known: free-to-viewer internet video isn't charged.
- YouTube re-encodes every upload anyway.

### Sound and pictures

- **Sound:** every sound is synthesized in code: the Count Lab's Web Audio synth for Pilot A, numpy
  for Pilot B.
- **Pictures:** every picture is drawn in code.
- There are no samples, no recordings, no commercial music, no stock footage and no AI-generated
  media.
- **So there is nothing for Content ID to match (INFERENCE).**
- **Don't register this audio with Content ID through a distributor.** It could produce claims on
  Carlos's own videos (research §4.4).
- **YouTube's AI-disclosure setting:** answer "No". This is animation, and any voice will be
  Carlos's own. If a cloned voice is ever used, for a Spanish track for example, answer "Yes"
  (REPORTED, research §1.6).

## 5. Gates before any upload (Carlos's call; nothing here uploads)

1. **Carlos picks the channel and the pilot** (see `CHANNELS_P2.md`). The first upload is
   **Unlisted**, watched on his phone. That also checks the Shorts UI zones, which are INFERENCE here.
2. **Pilot A**
   - Carlos's ear check of the v2 mix. A/B it with `mix_v2.py --no-layers`, and adjust
     `--bell-db`, `--bass-db` and `--bass-layer-db` if needed.
   - An instructor confirms the On1 feet.
   - The call to action matches what mysalsacoach.com actually offers that day. v2 only says
     "mysalsacoach.com".
3. **Pilot B**
   - Refresh the USGS data.
   - Confirm both thresholds on usbr.gov.
   - Re-run `pilot-b`. The verifier must pass.
4. **Render with `--final`** only for the approved upload.

## 6. Reference: the run report from this container

`<out>/run-report.json` records the same fields for any run: step times, sizes, loudness, the
audio clock and A/V results, and the verifier's summary. The tables in §2 come from one `run.py all`
in this container on 2026-09-26 (7.7 min, exit 0). It reproduced the direct renders' loudness and
number checks exactly.
