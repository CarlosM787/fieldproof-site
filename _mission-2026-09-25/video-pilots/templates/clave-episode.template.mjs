// TEMPLATE for a new Clave Lab episode. Copy with: python new_episode.py <slug> (it fills id and
// writes clave-lab/<slug>.mjs), then replace every TODO. One file drives the audio, the floor capture,
// the captions and the caption files. Rules the checker enforces (python new_episode.py check <file>):
//   * seconds = measures x 3.2 s at 150 BPM (8 counts per measure); each measure has kind, mix, en, es
//   * no TODO left; captions fit the caption block (<= 2 lines EN + 2 lines ES at the video's fonts)
//   * mix uses only bell, clave, conga, bass; lane (the highlighted instrument) is one of them or null
//   * On2 content waits for an instructor's ruling (open question in the SalsaCoach plan)
// The rhythm patterns come from the Count Lab model (salsacoach-count-lab/src/model.js), not from here.
const all = { bell: true, clave: true, conga: true, bass: true };
const nb = (s) => s.replace(/ /g, '\u00a0'); // keep a count pattern on one line
const smooth = (a, b, u) => a + (b - a) * (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// Camera keys (seconds, yaw, pitch, dist). The capture uses the page's phone layout (480 CSS px
// viewport, DPR 3): the page draws bones and shoes in CSS pixels, so a small canvas makes them about
// 3x thicker relative to the frame than v1's desktop canvas (v1 bones were ~2 px wide in a 1080-px
// frame, under 1 px on a phone). A three-quarter side view for the feet shows forward/back breaks.
// The first and last keys match, so the picture loops with the sound.
const KEYS = [
  [0.0, 0.75, 0.32, 3.6], [16.0, 1.05, 0.38, 3.6], [19.2, 1.25, 0.26, 3.1],
  [25.6, 1.35, 0.30, 3.25], [32.0, 0.75, 0.32, 3.6],
];
function cam(t) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [t0, y0, p0, d0] = KEYS[i], [t1, y1, p1, d1] = KEYS[i + 1];
    if (t <= t1 || i === KEYS.length - 2) {
      const u = (t - t0) / (t1 - t0);
      return { yaw: smooth(y0, y1, u), pitch: smooth(p0, p1, u), dist: smooth(d0, d1, u) };
    }
  }
  return { yaw: KEYS[0][1], pitch: KEYS[0][2], dist: KEYS[0][3] };
}

export const EPISODE = {
  id: 'clave-lab-TODO-slug',
  bpm: 150,
  fps: 30,
  pageLead: 0.1,
  audioOffset: 0,
  frameTime: 'center',
  loop: true,
  seconds: 10 * 3.2,
  capture: { viewport: { width: 480, height: 900 }, dpr: 3, cam },
  measures: [
    { kind: 'hook', mix: all, lane: null, en: 'TODO hook line (EN)', es: 'TODO hook line (ES)' },
    { kind: 'lesson', mix: { bell: true }, lane: 'bell', en: 'TODO *bell* lesson (EN)', es: 'TODO *campana* (ES)' },
    { kind: 'lesson', mix: { bell: true, conga: true }, lane: 'conga', en: 'TODO *congas* (EN)', es: 'TODO *congas* (ES)' },
    { kind: 'lesson', mix: { bell: true, conga: true, bass: true }, lane: 'bass', en: 'TODO *bass* (EN)', es: 'TODO *bajo* (ES)' },
    { kind: 'lesson', mix: all, lane: 'clave', en: 'TODO *clave* (EN)', es: 'TODO *clave* (ES)' },
    { kind: 'aha', mix: all, lane: 'clave', en: 'TODO the one idea (EN)', es: 'TODO la idea (ES)' },
    { kind: 'feet', mix: all, lane: null, en: 'TODO feet, On1 only (EN)', es: 'TODO pies, solo On1 (ES)' },
    { kind: 'feet', mix: all, lane: null, en: 'TODO feet again (EN)', es: 'TODO pies otra vez (ES)' },
    { kind: 'count', mix: all, lane: null, en: `Count it with me: ${nb('1, 2, 3 … 5, 6, 7 …')}`, es: `Cuenta conmigo: ${nb('1, 2, 3 … 5, 6, 7 …')}` },
    { kind: 'turn', mix: all, lane: null, en: 'TODO your turn (EN)', es: 'TODO te toca (ES)' },
  ],
  hook: { en: 'TODO TITLE?', es: '¿TODO TÍTULO?' },
  cta: 'mysalsacoach.com',
};
