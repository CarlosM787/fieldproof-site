# The video pipeline on Carlos's PC (Windows 11)

**For:** Carlos. **Date:** 2026-09-26. **Status:** built and tested in the cloud container; not yet run on
the PC. Nothing is uploaded, posted or bought by any script. Rendered media stays private and out of git.

The code is in `video-pilots/` (this lane's copy of `_mission-2026-09-25/video-pilots` at mission branch
`387b45c`, plus the phase-three changes listed in §12).

Labels: **VERIFIED** = measured or read here on 2026-09-26 (UTC), with the command named. **REPORTED** = from
a search result or record, named. **ESTIMATE** = my projection. **OPEN** = not known yet. **PROPOSED** = my
recommendation.

## 1. One-time setup (Windows 11, RTX 2070 Super 8 GB, 32 GB RAM)

| Step | Command (PowerShell) | Why |
|---|---|---|
| Python 3.11 or newer | `winget install Python.Python.3.12` | the renderers, checks and tests |
| Python packages | `py -m pip install numpy pillow imageio-ffmpeg fonttools matplotlib` | imageio-ffmpeg brings FFmpeg itself |
| Node 22 LTS (Pilot A only) | `winget install OpenJS.NodeJS.LTS` | drives the Count Lab page |
| Playwright + Chromium (Pilot A only) | in `video-pilots\`: `npm i playwright` then `npx playwright install chromium` | headless capture |
| NVIDIA driver | a current Game Ready or Studio driver from nvidia.com or the NVIDIA app | NVENC |
| Check the encoder | `py encode.py` | prints which encoder will be used, and why |
| Run the tests | `py -m unittest discover -s tests -t .` | 21 tests, about 20 s |

- **FFmpeg with NVENC comes with imageio-ffmpeg.** VERIFIED: the Windows FFmpeg 7.1 inside
  `imageio_ffmpeg-0.6.0-py3-none-win_amd64.whl` (binary sha256 `2ce797a0…71a3`) is built with
  `--enable-nvenc --enable-ffnvcodec --enable-cuda-llvm` and contains `h264_nvenc`. The Linux build in this
  container does not, so NVENC itself was **not** run here (OPEN until `py encode.py` on the PC).
  Minimum driver version for this FFmpeg: OPEN; if the driver is too old, the test encode fails and the
  pipeline falls back to x264 by itself (§3).
- **Another FFmpeg** (optional): set `FFMPEG=C:\path\ffmpeg.exe`; `encode.py` uses it.
- **Fonts:** nothing to install. Every font is loaded from files in the repo (all SIL OFL 1.1, §11).
- **Output folder:** keep renders out of OneDrive: `--out D:\render_cache\pilots` (or `C:\render_cache\pilots`).

## 2. One command per pilot

Run from `_mission-2026-09-25\video-pilots` (PowerShell). Every command writes `<out>\run-report.json`
(step times, sizes, measurements, the encoder chosen) and a timestamped copy per run.

| What | Command |
|---|---|
| Pilot A, "Where is the 1?" (1080×1920, 32.0 s) | `py run.py pilot-a --out D:\render_cache\pilots` |
| Pilot B, Lake Powell (16:9 70.8 s + Short 43.2 s) | `py run.py pilot-b --out D:\render_cache\pilots` |
| Captions for both (SRT + WebVTT, EN + ES) | `py run.py captions --out D:\render_cache\pilots` |
| Thumbnails from templates (1280×720) | `py run.py thumbs2 --out D:\render_cache\pilots` |
| Everything above, in order | `py run.py all --out D:\render_cache\pilots` |
| Re-run every check on what exists | `py run.py check --out D:\render_cache\pilots` |
| A new Clave Lab episode | `py new_episode.py new ep02-<name>`, edit, `py new_episode.py check clave-lab\ep02-<name>.mjs`, then `py run.py pilot-a --episode ep02-<name>.mjs --out ...` |

Options: `--encoder auto|nvenc|x264` (default `auto`), `--final` (drops the PRIVATE PILOT mark; only for an
upload Carlos approved), `--csv <file>` (Pilot B data, §10), `--only long|short` (Pilot B).

What `pilot-b` now checks, and fails on: B2 every number against the CSV (independent verifier); **B3 every
text box on every frame** (no text touches other text, the pen, its bracket or the curve; nothing outside
the safe area); B4 loudness, true peak and clipped samples of each MP4 and WAV.

## 3. GPU encode with CPU fallback (implemented, tested)

`encode.py` is shared by both pilots. With `--encoder auto` it tries, in order:
1. `h264_nvenc`, quality settings: `-preset p7 -tune hq -rc vbr -cq 18 -b:v 0 -spatial-aq 1 -rc-lookahead 32 -bf 3`;
2. `h264_nvenc`, basic settings (`-preset p5 -rc vbr -cq 18`), for an older driver or GPU;
3. `libx264 -preset slow -crf 16 -tune animation` (the phase-two setting).

A candidate is used only if FFmpeg lists it **and** a half-second test encode with exactly those settings
succeeds. The choice and every reason go to `run-report.json`. `--encoder nvenc` makes the GPU mandatory
(the run stops if it fails). CQ 18 for NVENC vs CRF 16 for x264 is an INFERENCE for similar quality on flat
graphics; compare one frame of each on the PC before relying on it.

Tested here (`tests/test_pipeline.py`, VERIFIED): this container falls back to x264 and says
"h264_nvenc is not in this FFmpeg's encoder list"; a fake FFmpeg that lists NVENC but fails its test
encode falls back to x264 with the error; one whose NVENC works gets the quality settings; forcing NVENC
where it fails stops the run.

**What NVENC will and won't save** (VERIFIED here, Pilot B 16:9): 143.9 s of the frame loop is Python
drawing, 26.6 s is waiting for x264. NVENC can remove most of the waiting, not the drawing. So expect a
modest gain (ESTIMATE: 10–20% on Pilot B), and slightly larger files at the same visual quality.

## 4. Captions (implemented, tested)

`captions.py` writes `NAME.en.srt`, `NAME.es.srt`, `NAME.en.vtt`, `NAME.es.vtt` and a check report, from
timing the pipeline already has; no speech recognition:
- **Pilot A:** one cue per 8-count measure (3.2 s at 150 BPM), from the episode spec, accent marks removed.
- **Pilot B:** cold open, rules card, one cue per story beat (its on-screen span from the render manifest),
  end card.
- **A voice-over:** `py captions.py script --script episodes\<slug>\vo_script.json --name <slug> --out ...`
  (start, end, EN, ES per line), so captions match what Carlos says.

Checked on the written files (errors fail the run): at most 42 characters per line and 2 lines per cue; at
least 1.0 s per cue; no overlaps; nothing after the video ends. Reading speed over 20 characters/s (EN) or
17 (ES) is a warning.

Result here (VERIFIED, 12 files): **0 errors**. Pilot A: 10 cues per language, 0 warnings. Lake Powell: 10
cues per language; the cold-open cues read at 21.5–30.0 characters/s. That is a finding about the video,
not the captions: the cold open is on screen for 2.6 s (Short) or 3.4 s (16:9). PROPOSED: if the captions
matter, lengthen the cold open by about 1 s in `lake_powell_v2.py` (`hook_s`).

YouTube accepts SRT and WebVTT uploads (REPORTED; not re-checked today).

## 5. Thumbnails from a template (implemented, one rendered per pilot)

`thumbnail.py` renders a JSON template (`templates\thumbnails\clave-lab.json`, `lake-powell.json`) at
1280×720 (`--scale 3` gives 3840×2160). Text comes from the data, not typed by hand: Pilot B's numbers come
from the render's facts JSON ("27.5 ft left", "+29.2 → +4.1 → +2.0 ft"); Pilot A's title and lines come
from the episode spec. The Lake Powell background is a new text-free chart plate that `lake_powell_v2.py`
now saves (`*-plate.png`), so no half-cropped labels appear.

Checks (the run fails on any): inside a 4% margin; nothing in the bottom-right corner where YouTube shows
the duration (INFERENCE); no two text boxes touching; contrast ≥ 3:1 on the pixels behind each box; JPG
under 2 MB.

Rendered here (VERIFIED): `where-is-the-1-v2-thumbnail.jpg` 90.6 KB, lowest contrast 11.3:1;
`lake-powell-v2-thumbnail.jpg` 83.7 KB, lowest contrast 8.3:1; 0 problems each. YouTube: 1280×720
minimum, 3840×2160 recommended, 2 MB limit from the mobile app and 50 MB from a computer, custom
thumbnails need a verified account (REPORTED, search extracts of support.google.com/youtube/answer/72431,
2026-09-26). Shorts mostly show a frame picked in the app.

## 6. Templates for new episodes

- `templates\clave-episode.template.mjs`: the v2 spec with every line to write marked TODO.
- `templates\metadata.template.md`: titles, descriptions, the UTM link and the upload gates (Carlos picks the
  channel and episode; Unlisted first; his ear check; an instructor's check of the feet).
- `templates\vo_script.template.json`: voice-over lines with times, for the caption files.
- `templates\thumbnails\*.json`: the two thumbnail templates.
- `py new_episode.py new <slug>` copies them; `py new_episode.py check clave-lab\<slug>.mjs` loads the spec with
  Node and uses the renderer's own fonts and wrap rules: 3.2 s per measure, known instruments, no TODO left,
  and each EN + ES caption fits the caption block. VERIFIED: v2 passes; the raw template reports 20 captions
  and titles to fill (plus its placeholder id); a caption too long for two lines is caught.

## 7. Carlos's own voice-over: record → prep → mix

No AI voice and no cloning (the policy-safe choice for YouTube, REPORTED in phase two).
1. **Record** (free): Audacity or Windows Sound Recorder, 48 kHz WAV, quiet room, 15–20 cm from the mic, one
   take per line or one take for the whole script. A phone recording works for a first test.
2. **Prep:** `py voice.py prep take1.wav voice.wav` → 80 Hz high-pass, silence trimmed to 0.15 s, levelled to
   −16 LUFS with a −2 dBTP ceiling.
3. **Mix:** `py voice.py mix D:\render_cache\pilots\clave-lab\where-is-the-1-v2.mp4 voice.wav out.mp4 --at 0.0`
   → the video's own soundtrack is ducked 8 dB under the voice (60 ms attack, 300 ms release), mastered to
   −14 LUFS with a −1.5 dBTP ceiling, and muxed with the **original video stream copied bit for bit**.
4. **Captions** from the same script times (§4).

VERIFIED here on the 43.2 s Lake Powell Short with a SYNTHETIC speech-band test signal (not a voice):
prep 5.1 s, mix 15.3 s; result −14.0 LUFS, −1.5 dBTP, 0 clipped samples, bed ducked −7.95 dB, video
stream identical (MD5 of the packets), duration 43.2 s in and out. The demo file is not for upload.

**The one optional purchase:** a USB microphone. PROPOSED only; the price is OPEN and nothing is bought
without Carlos's decision. The pipeline works with any recording, so try the phone first.

## 8. Runtimes: measured here, estimated on the PC

This container: 4 vCPUs (Intel Xeon @ 2.80 GHz), 15 GB RAM, no GPU; x264 (VERIFIED, `run-report*.json`).

| Step | Measured here | ESTIMATE on the PC (CPU model unknown) |
|---|---|---|
| Pilot A (capture 40.8 s, mix 24.4 s, compose 85.8 s, checks 4.1 s) | **155.2 s** | 1.5–3 min |
| Pilot B (render both 327.4 s, verify 0.2 s, layout 2.1 s, audio 2.5 s) | **332.1 s** | 3.5–5.5 min (x264); 3–5 min (NVENC) |
| Captions, all three videos | 0.1 s each | under 1 s |
| Template thumbnails, both | 0.2–0.3 s each | under 1 s |
| Voice prep / mix (43.2 s Short) | 5.1 s / 15.3 s | 5–15 s each |
| Tests (video 21 + X bot 56) | 18.7 s + 9 s | similar |
| `py run.py all` | about 8.2 min (sum of the above) | 5–9 min |

The estimate assumes a 6–8 core desktop CPU with faster single-core speed than a cloud vCPU (the frame
drawing is single-threaded Python). Measure once with `py run.py all` and read `run-report.json`.

## 9. Pilot B: the label overlap, fixed in code (VERIFIED)

- **Cause:** the chart-label placer tested the vertical gap as `y1 > b[1] + pad`, so a new label could sit up
  to 9 px inside the label below it. "−11.3" and "below 3,525 ft" collided in the last frames of both
  videos. A test re-creates the phase-two placement and confirms the collision (`tests/test_layout.py`).
- **Fix:** the gap test is applied on all four sides; every static text is reserved space; labels tied to a
  point (the 3,525 ft crossing, the record low) are placed first and may move only 30 px; segment labels
  search along their own stretch of curve. The pen's bracket now breaks around every label.
- **Safe areas:** 16:9 uses the 90% title-safe area; the Short uses nothing in the top 10%, bottom 25% or
  right 10% (REPORTED Google vertical-ad guidance via search extracts; the Shorts UI zones are otherwise
  INFERENCE) plus a 5% left margin. The Short's layout moved down and in to fit; the draft mark moved into
  the safe area.
- **Checks on the re-render** (`review/overlap_check.py`, run as step B3): 3,420 frames (2,124 + 1,296), 76,094
  text boxes, 867,899 text pairs: **0 overlaps, 0 off-safe-area, 0 text/pen, 0 text/curve**. Closest pair:
  7 px (16:9 source lines), 8 px (Short rules lines). Numbers: **17,996 checks, 0 failures**. Audio: 16:9
  −14.5 LUFS / −1.5 dBTP, Short −14.0 LUFS / −1.6 dBTP, **0 clipped samples** in each MP4 and WAV; the WAVs are
  bit-identical to phase two.
- **Evidence:** `media/evidence/lake-powell-last-second/`: all 30 frames of the last second of each video as
  JPG (decoded from the MP4s), a contact sheet each, the final frame with every recorded text box drawn
  over it, and a 2× zoom of the label area.

## 10. Before any Lake Powell upload: refresh the data (OPEN here)

USGS and Reclamation are blocked from this container (VERIFIED 2026-09-26 09:31 UTC: proxy 403 for
`api.waterdata.usgs.gov`, `waterservices.usgs.gov`, `www.usbr.gov`). On the PC:

```powershell
cd <repo>\_mission-2026-09-25\video-pilots
py desert-systems\refresh_powell_csv.py --out D:\render_cache\powell-usgs.csv
#   exit 0 = identical to the committed copy; 2 = values changed (re-render); 1 = fetch or validation failed
py run.py pilot-b --csv D:\render_cache\powell-usgs.csv --out D:\render_cache\pilots
#   B2 numbers, B3 layout and B4 audio must all pass
py desert-systems\refresh_powell_csv.py --out x.csv --print-urls     # the two URLs, to open in a browser
```

The script asks USGS directly for Sep 25, 2023 to Sep 24, 2026 (the window the videos show):
- Water Data API: `https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items?monitoring_location_id=USGS-09379900&parameter_code=62614&time=2023-09-25T00:00:00Z/2026-09-24T23:59:59Z&skipGeometry=true&limit=50000&f=json`
- Legacy NWIS (USGS says it retires in late 2026): `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=09379900&parameterCd=62614&startDT=2023-09-25&endDT=2026-09-24`
- By eye: `https://waterdata.usgs.gov/monitoring-location/USGS-09379900/`

It validates (every day present, 3,300–3,711 ft, no jump over 1.5 ft/day), writes the same CSV format and
compares value by value. Tested offline here with saved responses (`tests/test_refresh.py`, 4 tests).

**Thresholds on usbr.gov** (3,490 ft minimum power pool; 3,525 ft protection target). A search limited to
usbr.gov (REPORTED, 2026-09-26) returned an excerpt stating both, with these pages to open:
- Drought Contingency Plans: `https://www.usbr.gov/ColoradoRiverBasin/dcp/index.html`
- The Drought Response Operations Agreement: `https://www.usbr.gov/dcp/docs/final/Attachment-A1-Drought-Response%20Operations-Agreement-Final.pdf`
- Glen Canyon Dam: `https://www.usbr.gov/uc/rm/crsp/gc/`

The same search listed a post-2026 Record of Decision and a "Plans for 2027-2028 Colorado River Operations"
release. The 3,525 ft wording may change from 2027 (OPEN): re-check it before any upload after Dec 31, 2026.

## 11. Rights ledger (original or licensed only)

- **Pictures:** drawn in code (Pillow, matplotlib). No stock footage, no AI imagery. Thumbnails use the
  videos' own frames and plates.
- **Sound:** synthesized in code (the Count Lab's Web Audio synth; numpy). The only planned outside sound is
  Carlos's own voice. No samples, recordings or commercial music.
- **Fonts:** SIL OFL 1.1 (Big Shoulders Display, Atkinson Hyperlegible, JetBrains Mono, IBM Plex Sans
  Condensed and Mono), licence files in `fonts/` and `../xbot/fonts/`.
- **Data:** USGS data are U.S. public domain; USGS asks for credit (REPORTED: usgs.gov "Copyrights and
  Credits", search extract 2026-09-26). The committed CSV is a third-party mirror copy: refresh it (§10).
- **FFmpeg:** GPL v3 builds (VERIFIED from their configuration); used as a program, not redistributed.

## 12. Files changed or added in `video-pilots/`

| File | What |
|---|---|
| `desert-systems/lake_powell_v2.py` | Placer fix, safe-area layout, every text box recorded per frame, `--layout-only`, `--plate-only`, `--encoder` |
| `review/overlap_check.py` | The per-frame overlap and safe-area checker (independent safe-area table) |
| `review/evidence_frames.py` | Last-second JPGs, contact sheet, box overlay, zoom |
| `review/audio_check.py` | `clip` command: loudness plus clipped samples |
| `desert-systems/refresh_powell_csv.py` | USGS refresh and comparison (§10) |
| `encode.py` | NVENC with tested fallback to x264 |
| `captions.py`, `thumbnail.py`, `voice.py`, `new_episode.py` | §4–§7 |
| `templates/` | episode, metadata, voice-over script, two thumbnail templates |
| `clave-lab/compose_v2.py`, `run.py` | encoder choice, `--episode`, `--csv`, `captions`, `thumbs2`, per-run reports |
| `tests/` | 21 tests: `py -m unittest discover -s tests -t .` |
