// The Count Lab's synthesized salsa band and look-ahead scheduler, packaged for the 3D dancers.
// Same voices, levels and 16-slot patterns as salsacoach-count-lab/src/app.js (a production build
// should import one shared module; this prototype keeps a copy so the Count Lab stays untouched).
import { BAND } from '../../salsacoach-count-lab/src/model.js';

export const LANE_LEVEL = { bell: 0.5, clave: 0.75, conga: 0.7, bass: 0.95, click: 0.6 };

export function makeVoices(ac, dest, noise) {
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(type, f, t, d, out, peak, a) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    env(g, t, a || 0.002, peak, d);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
  }
  function hiss(t, d, out, peak, type, f, q) {
    const s = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    env(g, t, 0.001, peak, d);
    s.connect(flt); flt.connect(g); g.connect(out); s.start(t); s.stop(t + d + 0.05);
  }
  return {
    clave(t) {
      tone('sine', 2480, t, 0.055, dest.clave, 0.9, 0.001);
      tone('triangle', 1240, t, 0.03, dest.clave, 0.2, 0.001);
    },
    bell(t, mouth) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = mouth ? 1500 : 2400; bp.Q.value = 2.5; bp.connect(dest.bell);
      const d = mouth ? 0.2 : 0.06, p = mouth ? 0.6 : 0.28;
      tone('square', mouth ? 562 : 842, t, d, bp, p, 0.001);
      tone('square', mouth ? 846 : 1268, t, d * 0.8, bp, p * 0.55, 0.001);
    },
    conga(t, k) {
      if (k === 'open') {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(262, t); o.frequency.exponentialRampToValueAtTime(206, t + 0.05);
        env(g, t, 0.002, 0.85, 0.26); o.connect(g); g.connect(dest.conga); o.start(t); o.stop(t + 0.32);
      } else if (k === 'slap') {
        hiss(t, 0.05, dest.conga, 0.75, 'bandpass', 1900, 1.1);
        tone('sine', 340, t, 0.05, dest.conga, 0.32, 0.001);
      } else if (k === 'heel') {
        tone('sine', 118, t, 0.06, dest.conga, 0.22, 0.003);
      } else {
        hiss(t, 0.02, dest.conga, 0.16, 'highpass', 2600, 0.7);
      }
    },
    bass(t, f, len) {
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), g2 = ac.createGain(), lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 480;
      o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2; g2.gain.value = 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.95, t + 0.008);
      g.gain.setValueAtTime(0.95, t + len * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(dest.bass);
      o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
    },
    click(t, hi) { tone('sine', hi ? 1760 : 1175, t, 0.035, dest.click, hi ? 0.7 : 0.35, 0.001); },
  };
}

export function makeNoise(ac) {
  const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0);
  let x = 12345;
  for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x3fffffff) - 1; }
  return b;
}

export function playSlot(voice, s, t, beatLen, lanes) {
  const on = (k) => !lanes || lanes[k] !== false;
  const bell = BAND.bell[s]; if (bell && on('bell')) voice.bell(t, bell === 'm');
  if (BAND.clave[s] && on('clave')) voice.clave(t);
  const cg = BAND.conga[s]; if (cg && on('conga')) voice.conga(t, cg);
  const bs = BAND.bass[s]; if (bs && on('bass')) voice.bass(t, bs[0], bs[1] * beatLen);
  if (s === 0 && lanes && lanes.click) voice.click(t, true);
}

// A band on the audio clock. `slotOf(tick)` maps a running eighth-note counter to a pattern slot,
// so loop windows (1-4, 5-8) stay musical. `heardBeats()` is the position the listener hears now,
// corrected for output latency: the dancers are drawn from this, never from the scheduler.
export class Band {
  constructor() { this.ctx = null; this.playing = false; this.bpm = 150; this.lanes = {}; }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.noise = makeNoise(this.ctx);
    return this.ctx;
  }
  build() {
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.85;
    this.bus.connect(comp); comp.connect(ctx.destination);
    this.gain = {};
    for (const k of ['bell', 'clave', 'conga', 'bass', 'click']) {
      const g = ctx.createGain(); g.gain.value = LANE_LEVEL[k]; g.connect(this.bus); this.gain[k] = g;
    }
    this.voices = makeVoices(ctx, this.gain, this.noise);
  }
  half() { return 30 / this.bpm; }
  // startBeat: absolute beat (0 = count 1) that should sound at the first scheduled tick
  start(startBeat, slotOf) {
    this.ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.build();
    this.slotOf = slotOf;
    const lead = 0.12;
    this.startTime = this.ctx.currentTime + lead - startBeat * 60 / this.bpm;
    this.nextTick = Math.ceil(startBeat * 2 - 1e-6);
    this.playing = true;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }
  schedule() {
    const until = this.ctx.currentTime + 0.12;
    while (this.startTime + this.nextTick * this.half() < until) {
      const t = this.startTime + this.nextTick * this.half();
      playSlot(this.voices, this.slotOf(this.nextTick), t, 60 / this.bpm, this.lanes);
      this.nextTick++;
    }
  }
  stop() {
    if (!this.playing) return;
    clearInterval(this.timer);
    this.playing = false;
    const old = this.bus; old.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    setTimeout(() => { try { old.disconnect(); } catch (e) { /* already gone */ } }, 300);
  }
  retime(bpm) {
    if (this.playing) {
      const tNext = this.startTime + this.nextTick * this.half();
      this.bpm = bpm;
      this.startTime = tNext - this.nextTick * this.half();
    } else this.bpm = bpm;
  }
  heardTime(perf) {
    const ctx = this.ctx;
    if (ctx.getOutputTimestamp) {
      const o = ctx.getOutputTimestamp();
      if (o && o.contextTime > 0 && o.performanceTime > 0) return o.contextTime + (perf - o.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || 0) - (performance.now() - perf) / 1000;
  }
  heardBeats(perf) { return (this.heardTime(perf) - this.startTime) * this.bpm / 60; }
}
