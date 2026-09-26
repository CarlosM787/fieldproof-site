// Renders a <= 20 s demo of the practice flow, frame by frame, from the real practice page through
// the #render hooks (phone portrait), plus the synthesized band and count voice rendered offline with
// the same code the page uses. The taps in "Find the 1" are synthetic and scored by the real judge.
//   OUT=dir node qa/demo.mjs    (then ffmpeg: frames + audio.wav -> MP4)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, fonts, here } from './serve.mjs';
import { judgeTap } from '../src/judge.js';
const OUT = process.env.OUT || join(here, '..', 'media', 'frames-demo');
mkdirSync(OUT, { recursive: true });
const FPS = 30, SR = 48000;
// storyboard: step, tempo (as heard), counts, and what the band/voice does
const SEG = [
  { step: 0, bpm: 120, beats: 8, lanes: { click: true }, voice: null, label: 'listen' },
  { step: 1, bpm: 120, beats: 8, lanes: {}, voice: null, label: 'find', taps: [0.012, 4.0] },
  { step: 2, bpm: 75, beats: 4, lanes: {}, voice: null, label: 'watch' },
  { step: 3, bpm: 110, beats: 8, lanes: {}, voice: 'en', label: 'along' },
  { step: 4, bpm: 150, beats: 8, lanes: {}, voice: 'en', label: 'speed' },
];
let t = 0;
for (const s of SEG) { s.t0 = t; s.dur = s.beats * 60 / s.bpm; t += s.dur; }
const total = t;
const { server, url } = await serve();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await fonts(ctx);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto(url + 'practice.html#render-full');
await page.evaluate(() => window.__dance.ready);
await page.addStyleTag({ content: `
  .top, #prH, .notes, .board, .nowbox, details.more, .stephint, .nav, .cal, #levels, .stats { display: none !important; }
  body { padding: 8px 10px 0 !important; } .wrap { gap: 8px !important; }
  .card { padding: 10px 12px !important; gap: 6px !important; } .card > #prText { font-size: 13px; line-height: 1.35; }
  .card h2 { font-size: 24px !important; } .tap { min-height: 64px !important; font-size: 22px !important; }
  .actions button { min-height: 36px !important; } .steps button { min-height: 44px !important; }
  .stage canvas { aspect-ratio: auto !important; height: 330px !important; max-height: none !important; }
  .legend .hint { display: none; }` });
await page.evaluate(() => window.__dance.set({ pattern: 'on1', loop: 'all', view: 'leader', role: 'both', lang: 'en' }));
// audio: each segment rendered offline with one beat of pre-roll (so the first count's word is whole)
const wavs = [];
for (const s of SEG) {
  const b64 = await page.evaluate(({ s }) => window.__dance.audio(s.beats + 1, s.bpm, 48000, 'all', -1, { lanes: s.lanes, voice: s.voice, pattern: 'on1' }), { s });
  wavs.push(Buffer.from(b64, 'base64'));
}
// stitch: drop the pre-roll beat, keep exactly the segment; add a soft tick at each synthetic tap
const n = Math.round(total * SR), mix = new Float32Array(n * 2);
SEG.forEach((s, i) => {
  const w = wavs[i], frames = (w.length - 44) / 4, skip = Math.round(60 / s.bpm * SR), len = Math.round(s.dur * SR), o = Math.round(s.t0 * SR);
  for (let j = 0; j < len && skip + j < frames && o + j < n; j++) for (let c = 0; c < 2; c++) mix[(o + j) * 2 + c] = w.readInt16LE(44 + (skip + j) * 4 + c * 2) / 32768;
  for (const tp of s.taps || []) {
    const at = o + Math.round(tp * 60 / s.bpm * SR);
    for (let j = 0; j < 0.02 * SR && at + j < n; j++) { const v = Math.sin(2 * Math.PI * 2600 * j / SR) * Math.exp(-j / (0.004 * SR)) * 0.35; mix[(at + j) * 2] += v; mix[(at + j) * 2 + 1] += v; }
  }
});
const out = Buffer.alloc(44 + n * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n * 2; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[i])) * 32767), 44 + i * 2);
writeFileSync(join(OUT, 'audio.wav'), out);
// frames
const F = Math.round(total * FPS);
let seg = -1;
const tapsDone = new Set();
const SAMPLE = process.env.SAMPLE ? process.env.SAMPLE.split(',').map((x) => Math.round(+x * FPS)) : null;
for (let f = 0; f < F; f++) {
  if (SAMPLE && !SAMPLE.some((x) => Math.abs(x - f) < 1) && !SAMPLE.some((x) => f < x && f >= x - 1)) { if (SAMPLE.every((x) => f > x)) break; }
  const tt = f / FPS;
  const si = SEG.findIndex((s) => tt >= s.t0 && tt < s.t0 + s.dur + 1e-9);
  const s = SEG[si < 0 ? SEG.length - 1 : si];
  const beat = (tt - s.t0) * s.bpm / 60;
  const o = {};
  if (si !== seg) {
    seg = si;
    o.step = s.step;
    if (s.step > 0) o.done = [...Array(s.step).keys()];
    if (s.label === 'speed') o.bpm = s.bpm;
    await page.evaluate(({ s }) => {
      const d = window.__dance;
      d.set({ slow: s.label === 'watch', voice: !!s.voice, bpm: s.label === 'watch' ? 150 : s.bpm });
    }, { s });
  }
  const k = Math.floor(beat) % 8 + 1;
  if (s.label === 'listen') { o.go = 'Stop'; o.cue = `${Math.min(16, Math.floor(beat) + 1)} of 16 counts heard.`; }
  if (s.label === 'find') {
    o.go = 'Stop';
    for (const tp of s.taps) if (beat >= tp && !tapsDone.has(tp)) { tapsDone.add(tp); o.tap = { p: tp % 8, beatMs: 60000 / s.bpm }; o.hit = true; }
    if (!o.tap) o.hit = s.taps.some((tp) => beat >= tp && beat < tp + 0.18);
  }
  if (s.label === 'watch') { o.go = 'Pause'; o.cue = `${Math.min(8, Math.floor(beat) + 1)} of 8 counts watched.`; }
  if (s.label === 'along' || s.label === 'speed') {
    o.go = 'Stop';
    const P = { 1: 'Left foot forward · break', 2: 'Right foot in place, weight change', 3: 'Left foot closes beside the other foot', 5: 'Right foot back · break', 6: 'Left foot in place, weight change', 7: 'Right foot closes beside the other foot' };
    o.cue = P[k] ? `${k} · ${P[k]}` : `${k} · hold`; o.cueHold = !P[k];
    if (s.label === 'speed') o.fb = 'Tempo 150 BPM · your last tempo is kept on this device only';
  }
  const draw = !SAMPLE || SAMPLE.includes(f); // sample mode: keep the UI state, render only captured frames
  await page.evaluate(({ o, p, draw }) => { window.__dance.demo(o); if (draw) window.__dance.frame(p); }, { o, p: beat % 8, draw });
  if (!SAMPLE || SAMPLE.includes(f)) await page.screenshot({ path: join(OUT, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 88 });
  if (f % 60 === 0) console.log('frame', f, '/', F, s.label);
}
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ fps: FPS, frames: F, seconds: total, segments: SEG.map(({ step, bpm, beats, label, t0, dur, voice }) => ({ step, bpm, beats, label, t0: +t0.toFixed(3), dur: +dur.toFixed(3), voice })), taps: 'synthetic, scored by the real judge', note: 'rendered from practice.html through the #render hooks; not a screen recording of a person' }, null, 2));
console.log('done', F, 'frames', total.toFixed(2), 's');
await browser.close(); server.close();
