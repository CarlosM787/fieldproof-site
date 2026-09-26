# Review of both pilots, start to finish (Phase Two)

**Reviewed:**
- Pilot A v1, "Where is the 1?" (42.9 s, 9:16);
- Pilot B v1, "Three years of Lake Powell, turned into sound" (65.5 s, 16:9).

The v2 re-renders are measured the same way (§5).

**Date:** 2026-09-26. **Status:** private; nothing was uploaded.

**Labels:**
- **VERIFIED:** measured here, in this container, with the scripts named below.
- **INFERENCE:** my judgement. That includes every statement about real phones, real listeners and
  YouTube's app layout.
- **REPORTED:** taken from `YOUTUBE_RESEARCH.md`.

## 1. Verdict

**Neither v1 is engaging enough to keep as it is. Both are correct, and both are worth keeping as
formats.**

**Pilot A v1** teaches the right thing, and the model and captions agree. But as a Short it works
against itself:
- The hook is the thinnest, quietest part: the bell alone, about 8 LU under the rest.
- The teaching captions sit where YouTube draws its own title block.
- The dancers are hairlines on a phone.
- It ends on 4.4 s of static card.
- The audio clips and is dominated by a bass that phones can barely reproduce.

**Pilot B v1** is accurate to the last decimal, but it isn't a story yet:
- For 50 s a line creeps and a number ticks down.
- On a phone held upright only the big number is readable.
- The "hum = water above the power pool" idea is inaudible on a phone speaker (−34 dB against the
  rest of the mix).

**v2 fixes everything code can fix.** It adds a hook, pacing, safe zones, phone-safe audio, a
narrative without a voice and a loop (§5). What v2 can't supply, in order of impact (INFERENCE):

1. **A real voice: Carlos's.** Counting "one, two, three… five, six, seven" in Pilot A, and narrating
   Pilot B. This is the single biggest step up for both. The captions carry the lesson, but a human
   voice is what makes a viewer stay. For finance-adjacent topics it is also the policy-safe choice,
   because YouTube restricts AI personas (REPORTED).
2. **A better dancer model (Pilot A).** The stick figures show the feet correctly but not the hips,
   the body or the partnering, which is what dancers watch for. The coordinator's realistic 3D
   dancers plug straight into the new floor layer (`--floor-dir`, `PRODUCTION_P2.md` §3). A filmed
   performer, even Carlos's own feet, would be stronger still. It would also change the effort model
   and the no-footage approach, which is Carlos's call.
3. **Story (Pilot B): solved in v2 for a Short.** The 43 s vertical cut reads as a narrative without a
   voice: each spring added less, each drain took more. The 71 s 16:9 cut is an awkward length on its
   own: too long for a Short, too short for watch time. Its best use is as the cold open of a voiced
   6–8 minute explainer.
4. **The mix: fixed in v2, pending Carlos's ear.** v2 removes the clipping and makes the bass and
   conga survive on phones. It balances bell and bass, and the Lake Powell drone is now audible on
   phones. The levels are deliberate choices that Carlos should approve by ear. `mix_v2.py` has
   switches for an A/B comparison.

**Keep:** Pilot A v2 as the lead format for the recommended channel (`CHANNELS_P2.md`), after the ear
and instructor checks. Pilot B v2 as a Short, and the 16:9 as raw material for a voiced episode.

## 2. How the review was done

**Frames**
- Pilot A v1: the frame 0.25 s after each of the 13 measure changes, plus 43 frames at 1 fps.
- Pilot B v1: 66 frames at 1 fps, plus 4 full-resolution detail frames.
- All viewed at phone scale. A 1080-px-wide Short on a phone about 390 CSS px wide is shown at about
  0.36×; a 16:9 video in an upright phone at about 0.20×.
- Tool: `review/frames.py`.

**Text**
- Every caption string was read for typos.
- Every glyph was checked against its font with fontTools. None are missing, so no tofu boxes.

**Numbers**
- `review/verify_powell.py` recomputes every Pilot B number from the CSV in plain Python, using a
  different algorithm from the render scripts.

**Sound**
- `review/audio_check.py`:
  - integrated loudness, loudness range and true peak via ffmpeg's `ebur128` (BS.1770, 4×
    oversampled true peak);
  - stereo correlation, side level and mono fold-down;
  - two **phone-speaker models (INFERENCE, not measured devices):**
    - **phone:** mono sum, 4th-order high-pass at 280 Hz, low-pass at 10 kHz;
    - **phone-400:** the same with the high-pass at 400 Hz, for small or budget speakers.
- **Stems:**
  - Pilot A's stems come from the Count Lab page itself (`capture.mjs STEMS=1`, one lane on).
  - Pilot B's were made by re-running v1's synthesis one part at a time (`review/powell_v1_stems.py`).
    Summed, they reproduce the v1 WAV exactly (0 LSB difference).

**Sync**
- `clave-lab/sync_check.py` checks the audio clock against the model.
- The new `review/av_sync.py` measures the finished MP4:
  - the container audio offset;
  - the visible slot cursor against the audible attack, for every slot change that has a hit.

## 3. Pilot A v1: findings

### 3.1 Picture and captions

| # | Finding | Evidence |
|---|---|---|
| A1 | **Captions sit in the Shorts title zone.** The English and Spanish lines are drawn at y 1430–1600 of 1920. The Shorts app overlays the channel name, title and sound chip over roughly the bottom 20% (INFERENCE from the app's layout; confirm on a phone). | Frames at every measure change |
| A2 | **Count 8 and the last two lane slots sit under the right action rail.** Both reach x = 1040, and like/comment/share run down the right edge from about y 950 to 1700 (INFERENCE). | Layout constants in `compose.py` |
| A3 | **Line breaks orphan the key word.** In 4 of 6 English captions the "1" ends up alone on line 2: "…before 5 / and 1", "…It skips the / 1.", "…Silent on the / 1.", "…lands on / the 1". | Frames at 6.75, 13.15, 19.55 and 25.95 s |
| A4 | **The dancers are hairlines.** The page draws bones 2.2 CSS px wide on a 1,086 CSS-px canvas, which ends up about 2 px wide in a 1080-px frame and under 1 px on a phone. They read as a sketch, not as dancers. | Floor frames (2172×1222, scaled to 1040×588) |
| A5 | **A static header takes the top 18% for all 43 s.** "WHERE IS THE 1? / ¿DÓNDE ESTÁ EL 1?" never changes. The first second looks exactly like second 30. | 1 fps sheets |
| A6 | **Small text.** On a phone the lane labels are 9.4 CSS px and the footer 7.9 CSS px. The captions are fine: 18.1 px (EN) and 14.4 px (ES). | §6 table |
| A7 | **The ending loses viewers (INFERENCE).** 4.4 s of static end card over a 94%-dimmed lesson, and no loop back to the start. | Frames 38–42.9 s |
| A8 | **The end card makes claims that couldn't be checked.** "Free guides in English and Spanish", and the description line "Practice the count at mysalsacoach.com", couldn't be verified (the site is blocked from here). The Count Lab is not deployed. | Proxy log; Count Lab README |
| A9 | **Typos: none.** Minor points: trailing periods are inconsistent, and the title uses "1" while the end card says "uno". | Episode spec |
| A10 | **The upload master is thin and slightly off-colour.** CRF 22 gives about 0.63 Mbit/s of video, and YouTube re-encodes every upload (INFERENCE: give it more). The RGB→YUV conversion was untagged BT.601; on BT.709 playback the palette shifts by up to 16/255 per channel. For example, the conga mint (95, 227, 181) plays as (83, 211, 179). | ffprobe; encode/decode test |

### 3.2 Sound

**Clipping.** The page's bus compressor applies make-up gain, and the full band peaks at
**+2.0 dBFS**. The page's 16-bit export clamps that: **960 samples sit at full scale, in 48 events,
all from measure 5 (the bass entry) onward**. VERIFIED.
- The website's live synth runs the same mix bus, so it probably overshoots too (INFERENCE). This
  is worth a look in Carlos's S25 check of the Count Lab.

**Loudness.**

| | Source WAV | Final MP4 |
|---|---|---|
| Integrated | −9.0 LUFS | −13.9 LUFS |
| Loudness range | 14.1 LU | 8.9 LU |
| True peak | 0.0 dBTP | −1.4 dBTP |

The single-pass `loudnorm` ran in **dynamic mode**, acting as an automatic gain rider:

| End of measure | 1–2 (bell) | 3–4 (+congas) | 5 (+bass) | 7 | 10 | 13 |
|---|---|---|---|---|---|---|
| Source, short-term LUFS | −35.7 | −23.0 | −9.5 | −9.4 | −9.4 | −9.4 |
| MP4, short-term LUFS | −21.8 | −17.6 | −11.3 | −13.4 | −14.1 | −14.6 |

It lifted the bell intro by 13.9 LU, and let the full band drift down 3.3 LU over 25 s. The hook is
still the quietest part of the video.

**Balance on headphones (full band).**
- The bass holds **99% of the energy**. While it plays it is **+15.6 dB over everything else
  combined**.
- The bell sits **22.3 dB under the rest**, although the lesson opens with it.

**Phone-speaker simulation, per instrument.** Energy kept through the model, and the instrument's
level against the rest of the band while it plays:

| Instrument | Where its energy is | phone: kept | phone: vs rest | phone-400: kept | phone-400: vs rest |
|---|---|---|---|---|---|
| Bell (562–1500 Hz) | mid | −0.0 dB | −9.4 dB | −0.1 dB | −6.5 dB |
| Clave (2480 Hz) | high | −0.0 dB | +3.6 dB | −0.0 dB | +8.5 dB |
| Congas (open tones 262→206 Hz; slaps and tips high) | low-mid | −5.6 dB | −1.4 dB | −13.5 dB | −7.5 dB |
| **Bass tumbao (73–110 Hz)** | **low** | **−19.5 dB** (−18.0 LU) | **+0.4 dB** | **−26.2 dB** (−24.8 LU) | **−3.1 dB** |

**What is left of a bass note on a phone.** Harmonic levels of a sustained D2 (73.4 Hz), in dB
relative to the headphone fundamental:

| Harmonic | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th |
|---|---|---|---|---|---|---|---|
| Headphones | 0 | −11.5 | −17.7 | none | −26.8 | none | −33.1 |
| Phone model | −46.2 | −34.2 | −26.7 | none | −27.2 | none | −33.2 |

**Phone-bass verdict.** "Probably inaudible" is nearly right (INFERENCE from the model):
- On a typical phone the tumbao keeps about 1/90 of its energy.
- What survives is its odd harmonics only (3rd, 5th and 7th) at about −27 dB, around the level of
  the percussion. That reads as a faint, hollow "bup" of uncertain pitch, not as a bass line.
- On a small speaker it drops 3 dB under the rest of the band.

**The whole mix on a phone.** It drops **14.7 LU** through the phone model; Pilot B v1 drops 7.0.
YouTube normalizes playback on full-band loudness (REPORTED at about −14 LUFS). So on a phone,
Pilot A v1 plays about 15 LU quieter than its nominal level suggests.

**Headphones.**
- The mix is **exact dual mono**: L = R sample for sample, correlation 1.00.
- That makes it mono-safe by construction, but every instrument sits in the same point in the middle
  of the head. There is no separation to help the ear pick out the bell from the clave.

### 3.3 Sync

**Audio clock against the model** (`sync_check.py`): 198 hits; median +5.5 ms, 95th percentile
14.5 ms, worst 20.5 ms. Same as the v1 README.

**End to end in the MP4** (`av_sync.py`):
- Container audio offset: **0.0 ms**. The edit list is honoured.
- 183 slot changes that have a hit:
  - 116 show the picture about 6 ms before the audible attack. The attack ramps over a few
    milliseconds.
  - **About 30 show the picture one frame late (+27 to +28 ms).** The cause is float truncation:
    `int((t − 0.1) × 5)` with t = f/30 lands on 0.99999… at exact slot boundaries.
  - The rest are detector noise on quiet overlapping hits.
- Everything is inside broadcast tolerance, but the one-frame jitter is real. v2 fixes it.

## 4. Pilot B v1: findings

### 4.1 Every number, recomputed from the CSV (VERIFIED: 11 of 11 checks pass)

The CSV has 1,096 daily rows, from 2023-09-25 to 2026-09-24, with no gaps or duplicates. Every value
has one decimal place.

| On screen | Recomputed |
|---|---|
| 2024 runoff: +29.2 ft (Apr 14 → Jul 8) | 3,557.6 → 3,586.8. Both values also occur on Apr 15 and Jul 9–11; v1 shows the first day. |
| 2025 runoff: +4.1 ft (May 4 → Jun 18) | 3,557.3 → 3,561.4 |
| 2026 runoff: +2.0 ft (May 5 → May 31) | 3,525.7 → 3,527.7 |
| Lowest in this record: 3,516.4 ft (Sep 16, 2026) | A unique minimum |
| Sep 25, 2023: 3,573.3 ft → Sep 24, 2026: 3,517.5 ft | Yes |
| −55.8 ft in three years; 27.5 ft above the minimum power pool (and the Spanish line) | Yes |
| The running headline, date and "ft above" on every frame | Taken from the CSV row the frame shows |

### 4.2 Picture

| # | Finding |
|---|---|
| B1 | **The title card sits on the empty chart.** Grid lines, year lines and threshold labels run through the title text for the first 4.5 s. |
| B2 | **On an upright phone only the big number is readable** (INFERENCE: that's how most people meet a 16:9 video on a phone). Sizes in CSS px, upright / landscape full screen: annotations and legend 4.2 / 9.2; date line 5.4 / 11.6; source line 3.5 / 7.6. See §6. |
| B3 | **Bug: the last annotation never becomes readable.** It fades in over the next 25 days of data, but the lowest point is 8 days before the end, so its opacity peaks at 8/25 = **32%**. Computed from the code, and visible in the frames. |
| B4 | **The end card covers the chart.** For 7 s it hides the curve and the earlier annotations: the story is hidden at the moment it should land. |
| B5 | **No narrative arc without a voice.** From 5 s to 58 s the only changes are the line and the number. The story beats are 21-px labels. |
| B6 | **The title's "60 seconds of sound" is imprecise.** The data plays for 54.0 s and the file is 65.5 s long. The README gives a different title. |
| B7 | **Wording.** "2024 runoff: +29.2 ft" calls the lake's rise "runoff". The rise is the lake's response to runoff. Minor: the source line writes "Sep 25 2023" without the comma used elsewhere, and matplotlib fell back from SemiBold to Bold for the kicker (render log). |

### 4.3 Sound

**Loudness.**

| | Source WAV | Final MP4 |
|---|---|---|
| Integrated | −14.4 LUFS | −16.6 LUFS |
| Loudness range | 4.6 LU | 4.3 LU |
| True peak | −0.9 dBTP | −3.2 dBTP |

`loudnorm` targeted −16 LUFS. Its gain riding did **not** undo the drone's fade: −5.5 dB in the
source, −5.7 dB in the MP4.

**The drone is inaudible on phones.** It is the video's central idea ("hum = water above the minimum
power pool") and holds **89% of the energy**. Its partials sit at 55, 82 and 110 Hz. Through the
phone model it keeps **−43.8 dB** (−57.9 LUFS) and sits **33.6 dB under the rest**; on a small
speaker, 45 dB under.

**On headphones the balance is the other way round.**
- The drone is 9 dB over everything else.
- The data melody (the mallets) is 8.9 dB under.
- The fade the story relies on is only −5.6 dB over the whole video.

**The climax is the least audible moment on a phone.** The lowest lake levels play the lowest notes,
146.8 Hz. That is −22.5 dB on the phone model and −34.8 dB on a small speaker, so only each note's
short 3rd-harmonic click survives. The year-marker bells (880 Hz) are fine.

**Headphones and mono.** Correlation 0.95, side −15.8 dB, mono fold-down −0.2 LU: fine. The pan law
is linear rather than constant-power, a minor point.

### 4.4 Provenance

- The CSV is a third-party GitHub mirror of the USGS series (`ebootheee/powell`, cached 2026-09-25),
  and the values are provisional.
- The 3,490 ft and 3,525 ft thresholds are REPORTED.
- Before any upload: refresh the data from USGS and confirm the thresholds on usbr.gov
  (`PRODUCTION_P2.md` §5).

## 5. v2: what changed and how it measures

All v2 media is private, in the scratchpad (`private/video-v2/`), and is rebuilt with `run.py`.

### 5.1 Pilot A v2, "Where is the 1?" (1080×1920, 32.0 s)

**Structure: 10 bars at 150 BPM.**
1. **Hook.** The full groove plays from frame 0, under "WHERE IS THE 1? / Half this band never plays
   it." That's true of this arrangement: the clave and the bass never strike on 1. The counts show
   "?" and pulse together, so they don't give the answer away.
2. The bell, alone.
3. The congas join.
4. The bass joins.
5. The clave joins.
6. **The aha:** "1 or 5? The clave tells you: silent on 1, it plays on 5." Count cells 1 and 5 are
   outlined, and cell 5 flashes on the clave stroke.
7. The On1 feet, with the camera moving to a three-quarter side view.
8. The feet again.
9. **Count along:** a giant count numeral pops on each beat.
10. **"Your turn: where is the 1?"** This bar loops back into the hook. The audio tail wraps and the
    camera ends where it began.

**Picture.**
- Captions moved to a top block; nothing the lesson needs sits in the likely Shorts UI zones
  (INFERENCE).
- Balanced two-line wraps with a preference for breaking after punctuation. No orphaned "1".
- Rhythm patterns are never split across lines (they're bound with non-breaking spaces).
- The instrument named in each caption is drawn in its lane colour.
- Band lanes appear as each instrument enters.
- The floor is captured in the Count Lab's phone layout, so strokes are about 3× thicker relative to
  the frame. The camera is closer: 3.1–3.6 m, against 4.4 m in v1.
- The "hold · pausa" label sits clear of the feet.
- The "PRIVATE PILOT" mark sits at the very bottom, and `--final` removes it.
- Encoded at CRF 16, tagged BT.709. The palette error is 3/255 or less (v1: up to 16).

**Sound: a Python post-process of the page's own renders; the page is unchanged.**
1. The capture inserts 6 dB of headroom after the page's compressor.
   - The result is exactly the page's mix, 6 dB lower, within 1 LSB.
   - Clipped samples: 0.
2. Level trims through the stems: bell +5 dB, bass −3 dB.
   - Each stem matches its lane in the page's mix to within −31 dB.
3. **Phone-safe layers.** A soft asymmetric saturator applied to the page's bass stem makes a harmonic
   series of the same notes. A causal high-pass keeps only what lies above 180 Hz. The conga open
   tones get the same treatment, gated to the open-tone times from the model.
4. Mono-safe stereo from the stems: bell right, clave left, congas slightly left. The mono sum is
   exactly the mono mix.
5. A per-bar leveller for the sparse bars (the bell alone, the bell with congas), capped at +8 dB.
   The limiter takes at most 2.0 dB.
6. Mastered to −14 LUFS.

| Measure (VERIFIED) | v1 | v2 |
|---|---|---|
| Loudness, true peak, LRA (final MP4) | −13.9 LUFS, −1.4 dBTP, 8.9 LU | **−14.0 LUFS, −1.4 dBTP, 9.6 LU** |
| Clipped samples in the source | 960 | **0** |
| Whole mix: loudness drop on the phone model | 14.7 LU | **6.9 LU** |
| Bass: energy kept, phone / phone-400 | −19.5 / −26.2 dB | **−8.9 / −12.8 dB** |
| Bass vs the rest of the band while it plays, phone / phone-400 | +0.4 / −3.1 dB | **+6.7 / +4.0 dB** |
| Bass harmonics left on the phone model (D2 note) | 3rd, 5th and 7th at −27 to −33 dB | **3rd to 8th, all present, at −14 to −25 dB** (so the ear can infer the missing fundamental) |
| Congas (all strokes): energy kept on phone-400 | −13.5 dB | **−7.6 dB** |
| Bell vs the rest on headphones | −22.3 dB | **−13.7 dB** |
| Bass on headphones | fundamental alone | fundamental still ≥ 9 dB over any harmonic; the layer adds +0.9 LU to the bass |
| Stereo: correlation, mono fold-down | 1.00 (dual mono), 0.0 LU | **0.993, +0.1 LU** |
| A/V in the MP4: container offset, frames more than 20 ms late | 0.0 ms, about 30 of 183 | **0.0 ms, 0 of 123** (median −6.0 ms) |
| Audio clock against the model | median +5.5 ms, p95 14.5 ms | median +5.5 ms, p95 20.0 ms |
| Short-term loudness: hook bar vs bell bar vs full band | −21.8 / −21.8 / −14 LUFS (bell intro was the hook) | **−14.1 (hook) / −25.3 (bell solo) / −14.1** |

The loop and the swappable floor were tested: a stand-in 3D-style floor (transparent PNGs) was
composited, and a mismatched `floor.json` (bpm 160) was rejected. See `PRODUCTION_P2.md` §3.

### 5.2 Pilot B v2 (16:9, 70.8 s; Short 9:16, 43.2 s)

**Story without a voice.** The three years are cut into 7 data segments. Each one gets an on-screen
beat with a live counter, and its result stays on the chart as a label:

| Segment | Change |
|---|---|
| Fall and winter: the lake falls | −15.7 ft |
| Spring 2024: runoff refills it | +29.2 ft |
| Then it falls again | −29.5 ft |
| Spring 2025: a small refill | +4.1 ft |
| Down again, until May 2026 | −35.7 ft |
| Spring 2026: barely a bump | +2.0 ft |
| Summer 2026: the lowest in this record | −11.3 ft |

The final frame therefore reads as a staircase.
- **Opening:** a cold open ("27.5 ft of water left above the level Glen Canyon Dam needs to make
  power"), then "How did it get here?" with four rules for the sound.
- **End card:** "Each spring added less: +29.2 → +4.1 → +2.0 ft. Three years: −55.8 ft." It sits
  beside the chart, not over it.
- **Pacing:** the pen slows at the short springs, at the 3,525 ft crossing (Jul 7, 2026, a new beat
  found in the data) and at the low point. The shortest beat is on screen for 5.3 s in
  16:9 and 3.1 s in the Short. The x axis stays linear in time; only the pen's speed
  changes.

| Measure (VERIFIED) | v1 | v2 16:9 | v2 Short |
|---|---|---|---|
| Duration | 65.5 s | 70.8 s | 43.2 s |
| Loudness, true peak, LRA (final MP4) | −16.6 LUFS, −3.2 dBTP, 4.3 LU | **−14.5 LUFS, −1.5 dBTP, 9.7 LU** | **−14.0 LUFS, −1.6 dBTP, 10.6 LU** |
| Numbers checked by the independent verifier | 11 of 11 | all numbers on 1,920 frames plus 44 strings | all numbers on 1,140 frames plus 46 strings (both runs together: 17,996 checks, 0 fail) |
| Whole mix: loudness drop on the phone model | 7.0 LU | **1.5 LU** | **1.3 LU** |
| Drone ("water above 3,490 ft") vs the rest, phone | −33.6 dB | **−7.7 dB** | **−8.9 dB** |
| Mallets (the data) vs the rest, headphones | −8.9 dB | **−2.1 dB** | **−1.2 dB** |
| Chimes (weeks the lake rose) vs the rest, headphones | none | −8.2 dB (−4.1 dB on the phone) | −8.1 dB (−4.7 dB on the phone) |
| Lowest note (record low) and its phone loss | 146.8 Hz, −22.5 dB | 293.7 Hz, −2.3 dB | same |
| Drone fade over the video | −5.6 dB | −8.4 dB, with partials up to 880 Hz so a phone can play it | same |
| Stereo: correlation, mono fold-down | 0.95, −0.2 LU | 0.95, −0.2 LU | 0.94, −0.2 LU |
| Smallest text on screen, upright phone | 3.5 CSS px | 4.9 (source line); beats 11.0; counter 18.7 | 9.4 (threshold labels); beats 18.1; counter 30.3 |

**Other fixes:**
- No text is drawn over the chart during the intro.
- Every label is placed once, clear of the whole curve and of the other labels, and is fully opaque.
- The source line is complete ("Data: USGS 09379900, … provisional …").
- The pen's "water left" bracket breaks around the threshold label.
- Mallets pan left to right with the calendar, constant-power.

**Sync (Pilot B).** Every note is scheduled at the exact time the pen reaches its day, from one
timeline shared by picture and sound. Frames sample the middle of each frame.

## 6. Text size on a phone

Pixel sizes in the frame, and the size they appear on a phone, in CSS px:
- a Short full screen, about 0.36×;
- a 16:9 video in an upright phone, about 0.20×;
- a 16:9 video in landscape full screen, about 0.44×.

| | Size in the frame | On the phone |
|---|---|---|
| **A v1** EN caption / ES caption / lane labels / footer | 50 / 40 / 26 / 22 px | 18.1 / 14.4 / 9.4 / 7.9 |
| **A v2** hook title / EN caption / ES caption / count row / lane labels | 150 / 58 / 44 / 62 / 28 px | 54.1 / 20.9 / 15.9 / 22.4 / 10.1 |
| **B v1** headline / date line / annotations / source | 89 / 26 / 21 / 17 px | upright 18.0 / 5.4 / 4.2 / 3.5; landscape 39.1 / 11.6 / 9.2 / 7.6 |
| **B v2 16:9** headline / beat / counter / chart labels / source | 136 / 54 / 92 / 44 / 24 px | upright 27.6 / 11.0 / 18.7 / 8.9 / 4.9; landscape 59.8 / 23.8 / 40.5 / 19.4 / 10.6 |
| **B v2 Short** headline / beat / counter / chart labels / source | 120 / 50 / 84 / 38 / 28 px | 43.3 / 18.1 / 30.3 / 13.7 / 10.1 |

Rule of thumb used here (INFERENCE): about 12 CSS px or more reads comfortably on a phone. Everything
the v2 Shorts need to teach clears that bar, except the small threshold and lane labels.

## 7. Open items

1. **Carlos's ear check of both v2 mixes**, on the S25 speaker and on headphones. Compare with
   `mix_v2.py --no-layers` and the level switches.
2. **An instructor confirms the On1 feet** in Pilot A (the Count Lab gate).
3. **The Count Lab's live synth probably overshoots 0 dBFS** at full band, like the offline render
   (INFERENCE). Check it in the S25 pass. A fix belongs in the Count Lab lane: bus gain or a
   limiter, then an ear check.
4. **Shorts UI zones are inferred.** Confirm them with an Unlisted upload viewed on Carlos's phone.
5. **Before any Lake Powell upload:**
   - refresh the USGS data (the current copy is a third-party mirror, and provisional);
   - confirm 3,490 ft and 3,525 ft on usbr.gov;
   - re-run the verifier.
6. **The mysalsacoach.com call to action** must match what's live at upload time.
7. **Voice-overs** would lift both formats more than anything else. That's Carlos's decision.
8. **The 3D Dancers floor is experimental.** `clave-lab/capture_dancers.mjs` and
   `run.py pilot-a --dancers` were tested on 5 stills only. The full render (about 30 minutes in
   software WebGL here), a phone-scale review and the camera mapping are still open.
