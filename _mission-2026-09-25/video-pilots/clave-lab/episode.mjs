// Episode spec for Pilot A, "Where is the 1?" (one file drives audio, visuals and captions).
// 150 BPM: one beat = 0.4 s, one 8-count measure = 3.2 s.
const all = { bell: true, clave: true, conga: true, bass: true };
export const EPISODE = {
  id: 'clave-lab-01-where-is-the-1',
  bpm: 150,
  fps: 30,
  audioOffset: 0.1, // the offline renderer starts the first slot at 0.1 s
  seconds: 13 * 3.2 + 1.3,
  measures: [
    { mix: { bell: true }, lane: 'bell', en: 'The bell: big strokes on 1 · 3 · 5 · 7', es: 'La campana: golpes fuertes en 1 · 3 · 5 · 7' },
    { mix: { bell: true }, lane: 'bell', en: 'The bell: big strokes on 1 · 3 · 5 · 7', es: 'La campana: golpes fuertes en 1 · 3 · 5 · 7' },
    { mix: { bell: true, conga: true }, lane: 'conga', en: 'Congas: two open tones right before 5 and 1', es: 'Congas: dos tonos abiertos justo antes del 5 y del 1' },
    { mix: { bell: true, conga: true }, lane: 'conga', en: 'Congas: two open tones right before 5 and 1', es: 'Congas: dos tonos abiertos justo antes del 5 y del 1' },
    { mix: { bell: true, conga: true, bass: true }, lane: 'bass', en: 'Bass: the “and” of 2, then 4. It skips the 1.', es: 'Bajo: el «y» del 2, luego el 4. Se salta el 1.' },
    { mix: { bell: true, conga: true, bass: true }, lane: 'bass', en: 'Bass: the “and” of 2, then 4. It skips the 1.', es: 'Bajo: el «y» del 2, luego el 4. Se salta el 1.' },
    { mix: all, lane: 'clave', en: 'Clave (2-3): 2 · 3 · 5 · 6& · 8. Silent on the 1.', es: 'Clave (2-3): 2 · 3 · 5 · 6y · 8. Calla en el 1.' },
    { mix: all, lane: 'clave', en: 'Clave (2-3): 2 · 3 · 5 · 6& · 8. Silent on the 1.', es: 'Clave (2-3): 2 · 3 · 5 · 6y · 8. Calla en el 1.' },
    { mix: all, lane: null, en: 'Now the feet (On1): the weight lands on the 1', es: 'Ahora los pies (On1): el peso cae en el 1' },
    { mix: all, lane: null, en: 'Now the feet (On1): the weight lands on the 1', es: 'Ahora los pies (On1): el peso cae en el 1' },
    { mix: all, lane: null, en: 'Count it with me: 1, 2, 3 … 5, 6, 7 …', es: 'Cuenta conmigo: 1, 2, 3 … 5, 6, 7 …' },
    { mix: all, lane: null, en: 'Count it with me: 1, 2, 3 … 5, 6, 7 …', es: 'Cuenta conmigo: 1, 2, 3 … 5, 6, 7 …' },
    { mix: all, lane: null, end: true, en: 'Find the 1', es: 'Encuentra el uno' },
  ],
};
