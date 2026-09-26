// The count voice (phase three): a small formant synthesizer, written for this page, that says the
// counts "one ... eight" / "uno ... ocho" in the browser. No recordings and no third-party voice are
// used, so there is nothing to license. It sounds robotic on purpose: it is a placeholder until a
// recorded human voice (with a signed buy-out) replaces it; the timing path stays the same.
//
// Timing: every word carries an anchor, the moment its stressed vowel starts (close to where a
// listener hears the word "land"). The voice is scheduled on the band's audio clock so that the
// anchor falls exactly on the beat. Words are compressed to fit inside a beat at fast tempos.
//
// Synthesis: a Klatt-style cascade of resonators (F1-F5) driven by a smooth glottal pulse for voiced
// sounds, plus a parallel noise branch for s, sh, f/th and stop bursts, with aspiration noise in the
// cascade. Formants glide between segment targets; pitch falls across each word like a spoken count.

const SR = 22050;
const TAU = Math.PI * 2;

// Formant targets (Hz) F1-F3 for a male voice. EN vowels after Peterson & Barney / Hillenbrand;
// ES vowels after Quilis. Consonant values are loci and murmurs.
const PH = {
  // English
  AH: [640, 1190, 2390], UW: [340, 1250, 2250], UW2: [330, 980, 2250], IY: [280, 2250, 2950],
  AO: [570, 860, 2400], AA: [730, 1100, 2450], IH: [400, 1920, 2560], EH: [550, 1770, 2490],
  AX: [500, 1450, 2450], EY: [470, 1980, 2600],
  // Spanish
  u: [300, 760, 2300], o: [460, 880, 2450], a: [700, 1300, 2500], e: [450, 1900, 2600], i: [290, 2250, 2950],
  // consonants
  W: [300, 640, 2200], R: [380, 1150, 1600], J: [280, 2200, 2950], N: [260, 1700, 2600], NG: [260, 1900, 2350],
  V: [300, 1150, 2400], TAP: [350, 1500, 2300], ALV: [400, 1750, 2650], VEL: [350, 1900, 2300],
  LAB: [300, 900, 2300], DEN: [350, 1500, 2500],
};

// Segment: [kind, ms, formants, opts]. kinds: 'v' voiced (vowel, glide, liquid), 'n' nasal,
// 'f' fricative (noise only), 'vf' voiced fricative, 'c' closure (silence), 'b' burst, 'h' aspiration.
// opts: av [start, end] voicing, an noise level, noise shape (s, sh, f, t, k, d), tr transition ms.
const S = (kind, ms, F, o = {}) => ({ kind, ms, F: PH[F] || F, ...o });

const WORDS = {
  en: {
    1: { seg: [S('v', 75, 'W', { av: [0.35, 0.8], tr: 20 }), S('v', 185, 'AH', { av: [0.95, 0.9], tr: 70 }), S('n', 130, 'N', { av: [0.55, 0.2], tr: 35 })], anchor: 60 },
    2: { seg: [S('c', 25, 'ALV'), S('b', 12, 'ALV', { db: -6, noise: 't' }), S('h', 50, 'ALV', { db: -17, noise: 'h' }), S('v', 245, [340, 1250, 2250], { av: [0.95, 0.35], tr: 45, to: 'UW2' })], anchor: 80 },
    3: { seg: [S('f', 95, 'DEN', { db: -24, noise: 'f' }), S('v', 65, 'R', { av: [0.5, 0.9], tr: 20 }), S('v', 210, 'IY', { av: [1, 0.35], tr: 65 })], anchor: 140 },
    4: { seg: [S('f', 100, 'LAB', { db: -21, noise: 'f' }), S('v', 175, 'AO', { av: [0.85, 1], tr: 40 }), S('v', 120, 'R', { av: [0.8, 0.25], tr: 90 })], anchor: 95 },
    5: { seg: [S('f', 100, 'LAB', { db: -21, noise: 'f' }), S('v', 125, 'AA', { av: [0.85, 1], tr: 40 }), S('v', 115, 'IH', { av: [0.95, 0.7], tr: 110 }), S('vf', 70, 'V', { av: [0.45, 0.1], db: -28, noise: 'f', tr: 30 })], anchor: 95 },
    6: { seg: [S('f', 120, 'ALV', { db: -7, noise: 's' }), S('v', 115, 'IH', { av: [0.9, 0.8], tr: 35 }), S('c', 55, 'VEL'), S('b', 14, 'VEL', { db: -9, noise: 'k' }), S('f', 115, 'ALV', { db: -9, noise: 's' })], anchor: 115 },
    7: { seg: [S('f', 110, 'ALV', { db: -7, noise: 's' }), S('v', 125, 'EH', { av: [0.9, 1], tr: 35 }), S('vf', 50, 'V', { av: [0.6, 0.45], db: -28, noise: 'f', tr: 25 }), S('v', 60, 'AX', { av: [0.7, 0.6], tr: 30 }), S('n', 110, 'N', { av: [0.5, 0.15], tr: 30 })], anchor: 105 },
    8: { seg: [S('v', 140, 'EY', { av: [0.6, 1], tr: 25 }), S('v', 110, 'IH', { av: [0.9, 0.6], tr: 110, to: 'IY' }), S('c', 45, 'ALV'), S('b', 16, 'ALV', { db: -10, noise: 't' })], anchor: 12 },
  },
  es: {
    1: { seg: [S('v', 120, 'u', { av: [0.6, 1], tr: 20 }), S('n', 70, 'N', { av: [0.65, 0.6], tr: 25 }), S('v', 175, 'o', { av: [0.9, 0.35], tr: 45 })], anchor: 12 },
    2: { seg: [S('b', 14, 'ALV', { db: -14, noise: 'd', av: [0.35, 0.35] }), S('v', 175, 'o', { av: [0.9, 0.9], tr: 45 }), S('f', 125, 'ALV', { db: -9, noise: 's' })], anchor: 14 },
    3: { seg: [S('c', 25, 'ALV'), S('b', 12, 'ALV', { db: -10, noise: 't' }), S('v', 28, 'TAP', { av: [0.35, 0.35], tr: 10 }), S('v', 155, 'e', { av: [0.95, 0.9], tr: 40 }), S('f', 120, 'ALV', { db: -9, noise: 's' })], anchor: 65 },
    4: { seg: [S('c', 25, 'VEL'), S('b', 15, 'VEL', { db: -9, noise: 'k' }), S('v', 50, 'W', { av: [0.5, 0.8], tr: 15 }), S('v', 130, 'a', { av: [1, 0.95], tr: 45 }), S('c', 35, 'ALV'), S('b', 10, 'ALV', { db: -11, noise: 't' }), S('v', 25, 'TAP', { av: [0.35, 0.35], tr: 10 }), S('v', 135, 'o', { av: [0.85, 0.3], tr: 35 })], anchor: 90 },
    5: { seg: [S('f', 110, 'ALV', { db: -7, noise: 's' }), S('v', 110, 'i', { av: [0.9, 0.9], tr: 35 }), S('n', 60, 'NG', { av: [0.6, 0.5], tr: 30 }), S('c', 40, 'VEL'), S('b', 12, 'VEL', { db: -10, noise: 'k' }), S('v', 140, 'o', { av: [0.85, 0.3], tr: 40 })], anchor: 110 },
    6: { seg: [S('f', 105, 'ALV', { db: -7, noise: 's' }), S('v', 115, 'e', { av: [0.9, 1], tr: 35 }), S('v', 90, 'i', { av: [0.9, 0.6], tr: 80 }), S('f', 115, 'ALV', { db: -9, noise: 's' })], anchor: 105 },
    7: { seg: [S('f', 100, 'ALV', { db: -7, noise: 's' }), S('v', 50, 'J', { av: [0.6, 0.85], tr: 20 }), S('v', 125, 'e', { av: [1, 0.95], tr: 40 }), S('c', 35, 'ALV'), S('b', 10, 'ALV', { db: -11, noise: 't' }), S('v', 115, 'e', { av: [0.75, 0.3], tr: 30 })], anchor: 150 },
    8: { seg: [S('v', 130, 'o', { av: [0.6, 1], tr: 20 }), S('c', 40, 'ALV'), S('f', 75, 'ALV', { db: -8, noise: 'sh' }), S('v', 140, 'o', { av: [0.85, 0.3], tr: 35 })], anchor: 12 },
  },
};

// noise shaping for the parallel branch: [centre Hz, bandwidth Hz, weight] resonators, each
// normalised to unit gain at its centre, summed. Levels are set per segment in dB (see synthWord).
const NOISE = {
  s: [[6200, 2000, 1.0], [8400, 2400, 0.8]],
  sh: [[2700, 700, 1.0], [4300, 1400, 0.5]],
  f: [[2500, 4000, 0.6], [6500, 5000, 0.6]],
  t: [[4200, 1800, 1.0], [2000, 1500, 0.3]],
  k: [[1900, 600, 1.0], [3200, 1200, 0.3]],
  d: [[3400, 1500, 0.8], [1700, 800, 0.3]],
  h: [[600, 300, 0.5], [1700, 400, 0.6], [2600, 500, 0.4]],
};

// Klatt resonator (two-pole). norm(): unit gain at the centre frequency instead of at DC.
class Res {
  constructor() { this.y1 = 0; this.y2 = 0; this.g = 1; this.set(500, 100); }
  set(f, bw) {
    const r = Math.exp(-Math.PI * bw / SR);
    this.C = -r * r; this.B = 2 * r * Math.cos(TAU * f / SR); this.A = 1 - this.B - this.C; this.f = f;
    return this;
  }
  norm() {
    const w = TAU * this.f / SR, re = 1 - this.B * Math.cos(w) - this.C * Math.cos(2 * w), im = this.B * Math.sin(w) + this.C * Math.sin(2 * w);
    this.g = Math.hypot(re, im) / Math.abs(this.A);
    return this;
  }
  run(x) { const y = this.A * x + this.B * this.y1 + this.C * this.y2; this.y2 = this.y1; this.y1 = y; return y * this.g; }
}

function lcg(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }
const rms = (a, i0, i1) => { let e = 0; for (let i = i0; i < i1; i++) e += a[i] * a[i]; return Math.sqrt(e / Math.max(1, i1 - i0)); };

// Synthesize one word at time scale `scale` (1 = natural). Two paths: voiced (glottal pulses through
// the formant cascade) and noise (shaped per segment). Each noise segment is set to its level in dB
// relative to the stressed vowel, so an "s" can never drown the vowel. Returns { data, anchor, seconds }.
export function synthWord(lang, k, scale = 1, voice = {}) {
  const W = WORDS[lang][k];
  const f0a = voice.f0 || 128, segs = W.seg;
  const total = segs.reduce((a, sg) => a + sg.ms, 0) * scale;
  const n = Math.ceil((total / 1000 + 0.03) * SR);
  const vo = new Float32Array(n), no = new Float32Array(n);
  const cas = [new Res(), new Res(), new Res(), new Res(), new Res()];
  const nasalPole = new Res().set(270, 110);
  const rnd = lcg(1000 + k * 17 + (lang === 'es' ? 5 : 0));
  const anchorAt = (W.anchor * scale) / 1000;
  let phase = 0, prevU = 0, lp = 0, t0 = 0, prevF = segs[0].F.slice(), nas = 0, prevVoiced = false;
  const spans = [];
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si], len = Math.round(sg.ms * scale / 1000 * SR);
    const target = sg.to ? PH[sg.to] : sg.F, start = sg.kind === 'c' || sg.kind === 'b' ? sg.F : prevF;
    const tr = Math.max(1, Math.round((sg.tr || 0) * scale / 1000 * SR));
    const av = sg.av || (sg.kind === 'v' || sg.kind === 'n' ? [1, 1] : [0, 0]);
    const bands = sg.noise ? NOISE[sg.noise].map(([f, bw, w]) => ({ r: new Res().set(Math.min(f, SR * 0.45), bw).norm(), w })) : null;
    for (let j = 0; j < len && t0 + j < n; j++) {
      const i = t0 + j, x = j / Math.max(1, len - 1);
      // formants glide from the previous values (or a locus) to this segment's target
      const g = sg.to ? x : Math.min(1, j / tr), e = g * g * (3 - 2 * g);
      if (j % 32 === 0) {
        const nasal = sg.kind === 'n';
        cas[0].set(start[0] + (target[0] - start[0]) * e, nasal ? 110 : 60 + start[0] * 0.05);
        cas[1].set(start[1] + (target[1] - start[1]) * e, 90);
        cas[2].set(start[2] + (target[2] - start[2]) * e, 150);
        cas[3].set(3400, 250); cas[4].set(4200, 300);
      }
      // pitch: a small rise into the stressed vowel, then a fall to the end of the word
      const tt = i / SR;
      const f0 = tt < anchorAt ? f0a * (1.02 + 0.06 * tt / Math.max(anchorAt, 1e-3)) : f0a * (1.08 - 0.3 * Math.min(1, (tt - anchorAt) / Math.max(0.05, total / 1000 - anchorAt)));
      phase += f0 / SR; if (phase >= 1) phase -= 1;
      // glottal flow (Rosenberg-style): slow opening (45% of the period), fast closing (12%) that ends
      // abruptly, then closed; the excitation is its derivative, which keeps the upper formants bright
      const u = phase < 0.45 ? 0.5 * (1 - Math.cos(Math.PI * phase / 0.45)) : phase < 0.57 ? Math.cos(0.5 * Math.PI * (phase - 0.45) / 0.12) : 0;
      const dU = (u - prevU) * 8; prevU = u;
      const voiced = sg.kind === 'v' || sg.kind === 'n' || sg.kind === 'vf';
      let amp = av[0] + (av[1] - av[0]) * x;
      // soft voicing onset only after silence or noise, and a soft offset at the end of the word
      if (voiced) amp *= (prevVoiced ? 1 : Math.min(1, j / (0.008 * SR))) * (si === segs.length - 1 ? Math.min(1, (len - j) / (0.02 * SR)) : 1);
      const nz = rnd();
      let y = dU * amp + (amp > 0 ? nz * 0.01 * amp : 0);
      for (const r of cas) y = r.run(y);
      // nasal murmur: the nasal pole always runs; its share glides in and out over ~10 ms (no clicks)
      nas += ((sg.kind === 'n' ? 1 : 0) - nas) * 0.005;
      const yn = nasalPole.run(y);
      y = y * (1 - nas) + yn * 0.45 * nas;
      lp += (y - lp) * 0.85;
      vo[i] = lp;
      if (bands) {
        let fr = 0;
        for (const b of bands) fr += b.r.run(nz) * b.w;
        const env = sg.kind === 'b' ? Math.exp(-x * 3) : Math.min(1, j / (0.015 * SR)) * Math.min(1, (len - j) / (0.012 * SR));
        no[i] = fr * env;
      }
    }
    spans.push([t0, Math.min(n, t0 + len)]);
    prevVoiced = (sg.kind === 'v' || sg.kind === 'n' || sg.kind === 'vf') && (sg.av ? sg.av[1] : 1) > 0.05;
    t0 += len;
    prevF = sg.kind === 'c' || sg.kind === 'b' ? sg.F : target;
  }
  // reference: the voiced level over the stressed vowel (the segment that starts at the anchor)
  let ref = 0;
  for (let si = 0; si < segs.length; si++) if ((segs[si].kind === 'v') && spans[si][1] > anchorAt * SR) { ref = rms(vo, spans[si][0], spans[si][1]); break; }
  if (!ref) ref = rms(vo, 0, n) || 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = vo[i];
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si];
    if (!sg.noise) continue;
    const [a, b] = spans[si], r = rms(no, a, b) || 1, gN = ref * Math.pow(10, (sg.db || -20) / 20) / r;
    for (let i = a; i < b; i++) out[i] += no[i] * gN;
  }
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gOut = 0.85 / peak;
  for (let i = 0; i < n; i++) out[i] *= gOut;
  return { data: out, anchor: anchorAt, seconds: n / SR };
}

// Natural length of a word (ms) and the scale needed to fit it in `fit` seconds
const wordMs = (lang, k) => WORDS[lang][k].seg.reduce((a, s) => a + s.ms, 0);
export function fitScale(lang, beatSec) {
  let longest = 0;
  for (let k = 1; k <= 8; k++) longest = Math.max(longest, wordMs(lang, k));
  return Math.max(0.55, Math.min(1, (beatSec * 0.92 * 1000) / longest));
}

// The count voice on an AudioContext: prepare(lang, beatSec) renders the eight words for a tempo;
// say(k, t, gain) schedules word k so that its anchor lands at context time t.
export class CountVoice {
  constructor(ctx, dest) { this.ctx = ctx; this.dest = dest; this.key = ''; this.bufs = {}; this.live = new Set(); }
  prepare(lang, beatSec) {
    const scale = fitScale(lang, beatSec), key = lang + ':' + scale.toFixed(2);
    if (key === this.key) return scale;
    for (let k = 1; k <= 8; k++) {
      const w = synthWord(lang, k, scale);
      const b = this.ctx.createBuffer(1, w.data.length, SR);
      b.getChannelData(0).set(w.data);
      this.bufs[k] = { buf: b, anchor: w.anchor };
    }
    this.key = key; this.lang = lang; this.scale = scale;
    return scale;
  }
  say(k, t, gain = 1) {
    const w = this.bufs[k];
    if (!w) return null;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = w.buf; g.gain.value = gain;
    src.connect(g); g.connect(this.dest);
    const at = t - w.anchor;
    src.start(Math.max(this.ctx.currentTime, at), Math.max(0, this.ctx.currentTime - at));
    this.live.add(src);
    src.onended = () => this.live.delete(src);
    return at;
  }
  hush() { for (const s of this.live) { try { s.stop(); } catch (e) { /* already stopped */ } } this.live.clear(); }
}
export const VOICE_SR = SR;
export const VOICE_WORDS = WORDS;
