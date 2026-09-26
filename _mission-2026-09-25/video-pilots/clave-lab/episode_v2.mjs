// Episode spec for Pilot A v2, "Where is the 1?" (one file drives audio, floor capture, captions).
// 150 BPM: one beat = 0.4 s, one 8-count measure = 3.2 s, 10 measures = 32.0 s exactly.
//
// Clock (the Count Lab model is the source of truth):
//   * The page renders slot i (eighth notes) at 0.1 s + i * 0.2 s. mix_v2.py trims that 0.1 s lead
//     (pageLead) so count 1 of measure 1 sits at t = 0 of the final file (audioOffset: 0).
//   * Frame f shows the pose and grid at t = (f + 0.5) / fps (frameTime 'center'), which centres the
//     one-frame quantisation (|error| <= 16.7 ms) instead of always drawing late.
//   * loop: true wraps the audio tail past 32.0 s onto the start, so a Short that replays keeps the
//     groove going (the bass note tied over the bar line is already sounding at t = 0).
// Captions: *word* is drawn in the measure's accent colour.
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
  id: 'clave-lab-01-where-is-the-1-v2',
  bpm: 150,
  fps: 30,
  pageLead: 0.1,      // the page's offline render starts slot 0 at 0.1 s; trimmed in mix_v2.py
  audioOffset: 0,     // count 1 of measure 1 in the FINAL audio and video
  frameTime: 'center',
  loop: true,
  seconds: 10 * 3.2,
  capture: { viewport: { width: 480, height: 900 }, dpr: 3, cam },
  measures: [
    { kind: 'hook', mix: all, lane: null,
      en: 'Half this band never plays it.', es: 'La mitad de esta banda nunca lo toca.' },
    { kind: 'lesson', mix: { bell: true }, lane: 'bell',
      en: `Start with the *bell*: big strokes on ${nb('1 · 3 · 5 · 7')}`, es: `Empieza con la *campana*: golpes fuertes en ${nb('1 · 3 · 5 · 7')}` },
    { kind: 'lesson', mix: { bell: true, conga: true }, lane: 'conga',
      en: '*Congas*: two open tones just before 5 and 1', es: '*Congas*: dos tonos abiertos justo antes del 5 y del 1' },
    { kind: 'lesson', mix: { bell: true, conga: true, bass: true }, lane: 'bass',
      en: `*Bass*: ${nb('2&, 4 … 6&, 8.')} It skips the 1.`, es: `*Bajo*: ${nb('2y, 4 … 6y, 8.')} Se salta el 1.` },
    { kind: 'lesson', mix: all, lane: 'clave',
      en: `*Clave* (2-3): ${nb('2 · 3 · 5 · 6& · 8.')} Not on the 1.`, es: `*Clave* (2-3): ${nb('2 · 3 · 5 · 6y · 8.')} No toca en el 1.` },
    { kind: 'aha', mix: all, lane: 'clave',
      en: '1 or 5? The *clave* tells you: silent on 1, it plays on 5.', es: '¿1 o 5? La *clave* te dice: calla en el 1, suena en el 5.' },
    { kind: 'feet', mix: all, lane: null,
      en: 'Now the feet (On1): the weight lands on the *1*', es: 'Ahora los pies (On1): el peso cae en el *1*' },
    { kind: 'feet', mix: all, lane: null,
      en: 'Break on *1* and 5. Hold on 4 and 8.', es: 'Break en el *1* y el 5. Pausa en 4 y 8.' },
    { kind: 'count', mix: all, lane: null,
      en: `Count it with me: ${nb('1, 2, 3 … 5, 6, 7 …')}`, es: `Cuenta conmigo: ${nb('1, 2, 3 … 5, 6, 7 …')}` },
    { kind: 'turn', mix: all, lane: null,
      en: 'Your turn: where is the *1*?', es: 'Te toca: ¿dónde está el *1*?' },
  ],
  hook: { en: 'WHERE IS THE 1?', es: '¿DÓNDE ESTÁ EL 1?' },
  cta: 'mysalsacoach.com',
};
