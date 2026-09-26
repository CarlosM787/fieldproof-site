# Two private YouTube pilots, made entirely in code

Built 2026-09-26. **Nothing has been uploaded.** No channel was chosen, created or touched. The
brief says a public upload needs Carlos to separately approve the channel and the pilot.

The rendered MP4s, stills and thumbnails are **private**. They are in Carlos's private mission
report, not in this public repository; `.gitignore` keeps them out.

| | Pilot A: Clave Lab | Pilot B: Desert Systems, Sonified |
|---|---|---|
| Episode | "Where is the 1?" (Short) | "Three years of Lake Powell, turned into sound" |
| Feeds | mysalsacoach.com | faroquant.com, the Substack |
| Format | 1080×1920, 30 fps, **42.9 s** | 1920×1080, 30 fps, **65.5 s** |
| File | H.264 CRF 22 + AAC 48 kHz, **4.2 MB** | H.264 CRF 20 + AAC 48 kHz, **3.1 MB** |
| Loudness (EBU R128, measured) | **−13.9 LUFS**, true peak −1.4 dBTP, LRA 8.9 LU | **−16.6 LUFS**, true peak −3.2 dBTP, LRA 4.3 LU |
| Pictures | The Count Lab page itself (same model, same renderer), captured frame by frame, laid out with Pillow | matplotlib, drawn frame by frame from the USGS series |
| Sound | The Count Lab's own Web Audio synth, rendered offline (bell, clave, congas, bass) | numpy: one mallet note per week (pitch = lake level), a drone whose loudness follows the water above 3,490 ft, a bell on each New Year's Day |
| Checked | Audio vs picture: 198 drum hits, median +5.5 ms, 95th percentile 14.5 ms, worst 20.5 ms. That is within one frame (33 ms) (`clave-lab/sync_check.py`) | Every number on screen is computed from the CSV. Annotations are real extremes of ≥ 4 ft, not calendar dates |

All measurements are VERIFIED, local, 2026-09-26.

## How to rebuild

Requirements: Python 3 with numpy, Pillow, matplotlib and imageio-ffmpeg; Node 22; Playwright
with Chromium.

```sh
# Pilot A. Fonts: Big Shoulders Display 800, Atkinson Hyperlegible 400/700, JetBrains Mono 500 (all OFL, Google Fonts)
node ../salsacoach-count-lab/build.mjs
OUT=/private/clave-lab node clave-lab/capture.mjs            # 1,287 floor frames + audio.wav
python clave-lab/compose.py /private/clave-lab <fonts> /private/clave-lab/where-is-the-1.mp4
python clave-lab/sync_check.py /private/clave-lab            # audio/picture sync report

# Pilot B (fonts: IBM Plex, bundled with the X bot)
python desert-systems/lake_powell.py ../xbot/sample/usgs_09379900_lake_elevation_ft.csv ../xbot/fonts /private/desert-systems/lake-powell-3-years.mp4

# Thumbnails, 1280×720
python thumbnails.py /private/clave-lab <fonts> ../xbot/sample/usgs_09379900_lake_elevation_ft.csv ../xbot/fonts /private/thumbnails
```

One episode spec drives Pilot A: `clave-lab/episode.mjs` sets the tempo, which instruments play in
each 8-count measure, and the English and Spanish captions. The steps and the band pattern come from
`salsacoach-count-lab/src/model.js`, the file the web prototype uses. The video and the product
can't drift apart.

## Pilot A: "Where is the 1?" (Short)

**Structure:** 13 measures of 8 counts at 150 BPM.
1. The bell alone.
2. Congas are added.
3. Bass is added.
4. The clave comes in, with the focus lane highlighted.
5. The On1 feet.
6. "Count it with me."
7. An end card.

The Spanish caption sits under every English one.

**Title**
- EN: Where is the 1? Build a salsa groove one instrument at a time
- ES: ¿Dónde está el 1? Arma el ritmo de salsa instrumento por instrumento

**Description**
- **EN:** The bell, the congas, the bass and the clave, added one at a time until you can hear where the 1 lives. Then the feet: On1, the leader's weight lands on the 1. Every sound in this video was made in code; no recordings. Practice the count at mysalsacoach.com.
- **ES:** La campana, las congas, el bajo y la clave, uno por uno, hasta que escuches dónde vive el 1. Luego los pies: en On1, el peso del líder cae en el 1. Todo el sonido de este video se hizo con código, sin grabaciones. Practica el conteo en mysalsacoach.com.

**Optional voice-over.** The captions already carry the lesson. Carlos records it in his own voice; no AI voice.

| Time | EN | ES |
|---|---|---|
| 0:00 | "Where's the 1? Listen to the bell: big strokes on 1, 3, 5 and 7." | "¿Dónde está el 1? Escucha la campana: golpes fuertes en 1, 3, 5 y 7." |
| 0:06 | "Congas: two open tones, right before the 5 and right before the 1." | "Congas: dos tonos abiertos, justo antes del 5 y justo antes del 1." |
| 0:13 | "The bass plays the 'and' of 2, then 4. It skips the 1." | "El bajo toca el «y» del 2, luego el 4. Se salta el 1." |
| 0:19 | "The clave, two-three: 2, 3… 5, 6-and, 8. It's silent on the 1." | "La clave, dos-tres: 2, 3… 5, 6-y, 8. Calla en el 1." |
| 0:26 | "Now the feet. On1, the weight lands on the 1." | "Ahora los pies. En On1, el peso cae en el 1." |
| 0:32 | "Count it with me: 1, 2, 3… 5, 6, 7…" | "Cuenta conmigo: 1, 2, 3… 5, 6, 7…" |

**Before publishing**, these gates come from the SalsaCoach plan:
- Carlos's ear check of the groove (feel, levels, bass pitch).
- A dancer checks that the On1 feet match how he teaches.

The On2 counts stay out of this episode until an instructor rules on them.

## Pilot B: "Three years of Lake Powell, turned into sound"

**Structure:**
- 0:00–0:04.5: title.
- 0:04.5–0:58.5: the chart draws left to right while the sound plays.
- 0:58.5–1:05.5: end card. Sep 25, 2023: 3,573.3 ft → Sep 24, 2026: 3,517.5 ft. That is −55.8 ft in three years, and 27.5 ft above the minimum power pool.

**On-screen notes** (all computed from the data):
- 2024 runoff: +29.2 ft (Apr 14 → Jul 8)
- 2025 runoff: +4.1 ft (May 4 → Jun 18)
- 2026 runoff: +2.0 ft (May 5 → May 31)
- The lowest point in this record: 3,516.4 ft (Sep 16, 2026)

**Title**
- EN: Three years of Lake Powell, turned into sound
- ES: Tres años del lago Powell, convertidos en sonido

**Description**
- **EN:** Every note is one week of Lake Powell's water level: higher water, higher note. The low drone is the water still above 3,490 ft, the minimum power pool at Glen Canyon Dam; it fades as the lake falls. Data: USGS site 09379900, daily lake elevation (provisional), Sep 25, 2023 to Sep 24, 2026. Chart and sound made in code. Not advice of any kind.
- **ES:** Cada nota es una semana del nivel del lago Powell: más agua, nota más alta. El zumbido grave es el agua que queda sobre los 3,490 pies, el nivel mínimo para generar energía en la presa Glen Canyon; se apaga a medida que el lago baja. Datos: USGS, sitio 09379900, elevación diaria del lago (provisional), del 25 de septiembre de 2023 al 24 de septiembre de 2026. Gráfica y sonido hechos con código.

**Voice-over** (Carlos's own voice, about 60 s). Each cue time is when that date is drawn on
screen: 0.049 s per day, computed from the script's timeline.

| Time | EN | ES |
|---|---|---|
| 0:05 | "This is Lake Powell, the reservoir behind Glen Canyon Dam, over the last three years." | "Este es el lago Powell, el embalse detrás de la presa Glen Canyon, en los últimos tres años." |
| 0:10 | "Each note is one week. Higher water, higher note." | "Cada nota es una semana. Más agua, nota más alta." |
| 0:14 | "Spring of 2024: the runoff lifts the lake twenty-nine feet." | "Primavera de 2024: el deshielo sube el lago veintinueve pies." |
| 0:21 | "The low hum is the water above 3,490 feet, the level the dam needs to make power." | "El zumbido grave es el agua sobre los 3,490 pies, el nivel que la presa necesita para generar energía." |
| 0:33 | "In 2025 the runoff adds four feet." | "En 2025 el deshielo suma cuatro pies." |
| 0:51 | "In 2026, about two." | "En 2026, unos dos." |
| 0:56 | "September 16th, 2026: 3,516.4 feet, the lowest in this record." | "16 de septiembre de 2026: 3,516.4 pies, el más bajo de este registro." |
| 0:59 | "Almost fifty-six feet lower in three years. Twenty-seven and a half feet above the minimum power pool." | "Casi cincuenta y seis pies menos en tres años. Veintisiete pies y medio sobre el nivel mínimo." |

**Before publishing:**
- Check both thresholds on usbr.gov. The 3,490 ft minimum power pool and the 3,525 ft protection target are REPORTED here: usbr.gov is blocked from this sandbox.
- Refresh the data to the latest USGS values. The series is provisional and can be revised.
- Keep the on-screen and voice-over numbers identical.

## Licences and disclosure

- **Pictures:** drawn in code. There is no stock footage, no AI-generated imagery and no one else's video.
- **Sound:** synthesized in code, in Web Audio for A and numpy for B. There are no samples, no recordings and no commercial music.
  - So there is nothing for Content ID to match (INFERENCE).
  - Don't register this audio with Content ID through a distributor; it could claim your own videos.
- **Fonts:** all under the SIL Open Font License 1.1:
  - Big Shoulders Display
  - Atkinson Hyperlegible
  - JetBrains Mono
  - IBM Plex Sans Condensed and IBM Plex Mono
- **Data:** USGS water data is a US-government work (public domain). The video names the source and says the data is provisional.
- **YouTube "altered or synthetic content":** No. It's animation, and the voice is Carlos's own.
  - Per YouTube's help pages (REPORTED), only realistic synthetic content needs the label.
  - If a cloned voice is ever used for the Spanish track, turn the label on.

## What Carlos decides

See the mission decision sheet. In short:
- **Which channel.** The research proposes two channels (dance; data and engineering), with Spanish as a second audio track rather than separate channels.
- **Whether to publish either pilot.** The first upload should be *Unlisted*, for a review on a phone.
- **Whether to record the voice-overs.**

Nothing here posts, uploads or spends.
