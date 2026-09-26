// SalsaCoach Dancers: two life-size dancers driven by the Count Lab step table and audio clock.
import { TextureLoader, Clock, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PATTERNS, describe } from '../../salsacoach-count-lab/src/model.js';
import { Band, makeVoices, makeNoise, playSlot, LANE_LEVEL } from './audio.js';
import { REAL, STATES, beatState, dancerTargets, holdTargets, posFrom, slotOf, windowOff, windowLen, movingFoot, ownFoot } from './choreo.js';
import { loadDancer, STYLE } from './dancer.js';
import { makeRenderer, makeScene, CameraRig, FloorMarks } from './stage.js';

const $ = (id) => document.getElementById(id);
const mod = (a, n) => ((a % n) + n) % n;
const HOOK = /^#(render|qa)/.test(location.hash);
const store = {
  get(k) { try { return localStorage.getItem('dancers.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('dancers.' + k, v); } catch (e) { /* storage blocked */ } },
};

const I18N = {
  en: {
    tag: 'Dancers · private prototype', h1: 'Watch the step land on the count',
    lede: 'Two dancers in closed hold dance the salsa basic to a band synthesized in your browser. Their feet, weight and hips follow the Count Lab step table beat for beat, so what you see is what you count.',
    play: 'Play', pause: 'Pause', tempo: 'Tempo', pattern: 'Step pattern', loop: 'Loop', show: 'Show', view: 'Camera',
    both: 'Both', leader: 'Leader', follower: 'Follower', mirror: 'Mirror', reduced: 'Reduced motion',
    vLeader: 'Behind leader', vFollower: 'Behind follower', vSide: 'Side', vTop: 'Above',
    all: '1–8', first: '1–4', second: '5–8', prev: 'Previous count', next: 'Next count',
    names: { on1: 'On1', on2t: 'On2 · Torres count', on2c: 'On2 · 2-3-4 count' },
    review: 'Preview · instructor review pending', accurate: 'Matches the Count Lab step table',
    count: 'Count', hold: 'Hold', loading: 'Loading the dancers…', nogl: '3D is not available on this device or browser. Every count is in the step table below.',
    live: (k, l, f) => `Count ${k}. Leader: ${l}. Follower: ${f}.`,
    canvas: (k, name) => `Two dancers in closed hold dancing the ${name} basic, count ${k}.`,
    head: ['Count', 'Leader', 'Follower'], bpm: 'BPM', drag: 'Drag to turn the camera',
  },
  es: {
    tag: 'Bailarines · prototipo privado', h1: 'Mira el paso caer en el tiempo',
    lede: 'Dos bailarines en posición cerrada bailan el básico de salsa con una banda sintetizada en tu navegador. Sus pies, su peso y sus caderas siguen la tabla de pasos del Count Lab tiempo a tiempo: lo que ves es lo que cuentas.',
    play: 'Reproducir', pause: 'Pausa', tempo: 'Tempo', pattern: 'Patrón de pasos', loop: 'Repetir', show: 'Mostrar', view: 'Cámara',
    both: 'Ambos', leader: 'Líder', follower: 'Seguidor(a)', mirror: 'Espejo', reduced: 'Movimiento reducido',
    vLeader: 'Detrás del líder', vFollower: 'Detrás de quien sigue', vSide: 'De lado', vTop: 'Desde arriba',
    all: '1–8', first: '1–4', second: '5–8', prev: 'Tiempo anterior', next: 'Tiempo siguiente',
    names: { on1: 'On1', on2t: 'On2 · conteo Torres', on2c: 'On2 · conteo 2-3-4' },
    review: 'Vista previa · falta revisión de un instructor', accurate: 'Igual que la tabla de pasos del Count Lab',
    count: 'Tiempo', hold: 'Pausa', loading: 'Cargando a los bailarines…', nogl: 'El 3D no está disponible en este dispositivo o navegador. Cada tiempo está en la tabla de pasos de abajo.',
    live: (k, l, f) => `Tiempo ${k}. Líder: ${l}. Seguidor(a): ${f}.`,
    canvas: (k, name) => `Dos bailarines en posición cerrada bailando el básico ${name}, tiempo ${k}.`,
    head: ['Tiempo', 'Líder', 'Seguidor(a)'], bpm: 'BPM', drag: 'Arrastra para girar la cámara',
  },
};

const S = {
  lang: store.get('lang') || (/^es\b/i.test(navigator.language || '') ? 'es' : 'en'),
  pattern: 'on1', loop: 'all', role: 'both', view: 'leader', mirror: false, bpm: 150,
  reduced: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  playing: false, pos: 0,
};
const T = () => I18N[S.lang];
const COLORS = { leader: '#6fd3ff', follower: '#ff72b8' };

// ---------- 3D ----------
const canvas = $('stage');
const lite = /lite/.test(location.hash) || (!/full/.test(location.hash) && ((window.matchMedia && matchMedia('(max-width: 720px)').matches) || (navigator.deviceMemory && navigator.deviceMemory <= 4)));
let renderer = null, world = null, cam = null, marks = null, leader = null, follower = null;
const band = new Band();
const clock = new Clock();
let dirty = true, visible = true, lastCount = -1;
const metrics = { loadStart: performance.now(), loadMs: 0, frames: 0, cpuMs: [] };

function sizeTo() {
  if (!renderer) return;
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  cam.cam.aspect = Math.max(0.3, r.width / Math.max(1, r.height));
  cam.cam.updateProjectionMatrix();
  dirty = true;
}

async function init3d() {
  try {
    renderer = makeRenderer(canvas, { keep: HOOK });
  } catch (e) {
    $('poster').classList.add('fail'); $('posterText').textContent = T().nogl;
    return false;
  }
  world = makeScene(renderer, lite ? 'lite' : 'full');
  cam = new CameraRig(16 / 9, [0, 0.86, REAL.gap / 2]);
  marks = new FloorMarks(world.scene, COLORS);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const tl = new TextureLoader();
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  [leader, follower] = await Promise.all([
    loadDancer('leader', loader, tl, lite ? 'lite' : 'full', COLORS.leader, aniso),
    loadDancer('follower', loader, tl, lite ? 'lite' : 'full', COLORS.follower, aniso),
  ]);
  leader.place(0, 0, 0);
  follower.place(0, REAL.gap, Math.PI);
  world.scene.add(leader.group, follower.group);
  metrics.loadMs = Math.round(performance.now() - metrics.loadStart);
  cam.set(S.view, true);
  sizeTo();
  applyRole();
  pose(S.pos);
  render();
  // compile shaders before the first frame the viewer sees
  $('poster').classList.add('gone');
  return true;
}

const dims = () => ({
  leader: { shoulder: leader.rig.dims.shoulder, head: leader.rig.dims.head },
  follower: { shoulder: follower.rig.dims.shoulder, head: follower.rig.dims.head },
});

let lastBS = null, lastTL = null, lastTF = null;
function pose(p) {
  const bs = beatState(p, S.pattern, S.loop, S.reduced);
  const tl = dancerTargets('leader', bs), tf = dancerTargets('follower', bs);
  const D = dims();
  const hold = holdTargets(tl.body, tf.body, D);
  const lookL = new Vector3(tf.body.x, D.follower.head - 0.02, tf.body.z);
  const lookF = new Vector3(tl.body.x, D.leader.head - 0.02, tl.body.z);
  leader.apply(tl, hold.leader, lookL, STYLE.leader);
  follower.apply(tf, hold.follower, lookF, STYLE.follower);
  // landing pulse: the foot that landed (or took the weight) on this count, over 0.45 beat
  const landing = (role) => {
    const out = {};
    if (bs.travel || S.reduced) return out;
    const mv = movingFoot(bs.prev, bs.at);
    const lf = mv || (bs.prev.w !== bs.at.w ? bs.at.w : null);
    if (lf) out[ownFoot(role, lf)] = bs.frac / 0.45;
    return out;
  };
  marks.update('leader', tl, 1, S.role !== 'follower', landing('leader'));
  marks.update('follower', tf, -1, S.role !== 'leader', landing('follower'));
  lastBS = bs; lastTL = tl; lastTF = tf;
  return bs;
}

function render() {
  if (!renderer) return;
  const t0 = performance.now();
  renderer.render(world.scene, cam.cam);
  const dt = performance.now() - t0;
  metrics.frames++;
  if (metrics.cpuMs.length < 600) metrics.cpuMs.push(dt);
  dirty = false;
}

function currentPos() {
  if (!S.playing || !band.ctx) return S.pos;
  const b = band.heardBeats(performance.now());
  return b < 0 ? S.pos : posFrom(b, S.loop);
}

function frame() {
  if (HOOK) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, clock.getDelta());
  if (!renderer || !leader) return;
  const moving = cam.step(dt, S.reduced);
  if (!visible && !S.playing) return;
  if (S.playing) {
    const p = currentPos();
    const shown = S.reduced ? Math.floor(p) : p;
    pose(shown);
    showCount(Math.floor(p) % 8 + 1);
    dirty = true;
  }
  if ((dirty || moving) && visible) render();
}

// ---------- UI ----------
function i18n() {
  document.documentElement.lang = S.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const v = T()[el.dataset.i18n];
    if (typeof v === 'string') el.textContent = v;
  }
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', T()[el.dataset.i18nLabel]);
  const sel = $('pattern');
  for (const o of sel.options) o.textContent = T().names[o.value] + (o.value === 'on1' ? '' : ' ·  ' + (S.lang === 'es' ? 'vista previa' : 'preview'));
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang));
  $('playLabel').textContent = S.playing ? T().pause : T().play;
  badge(); table(); strip(); showCount(Math.floor(S.pos) % 8 + 1, true);
}

function badge() {
  const on1 = S.pattern === 'on1';
  const b = $('badge');
  b.textContent = T().names[S.pattern] + ' · ' + (on1 ? T().accurate : T().review);
  b.classList.toggle('warn', !on1);
}

function table() {
  const P = PATTERNS[S.pattern], t = T();
  const rows = [];
  for (let k = 1; k <= 8; k++) {
    const hold = P.holds.includes(k);
    rows.push(`<tr data-k="${k}"${hold ? ' class="hold"' : ''}><th scope="row">${k}</th><td>${describe(P, k, 'leader', S.lang)}</td><td>${describe(P, k, 'follower', S.lang)}</td></tr>`);
  }
  $('steps').innerHTML = `<caption>${t.names[S.pattern]}</caption><thead><tr>${t.head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>`;
}

function strip() {
  const P = PATTERNS[S.pattern];
  const el = $('strip');
  el.innerHTML = '';
  for (let k = 1; k <= 8; k++) {
    const st = P.steps[k], b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell' + (st ? '' : ' hold') + (st && st[2] === 'break' ? ' brk' : '');
    const inWin = S.loop === 'all' || (k > windowOff(S.loop) && k <= windowOff(S.loop) + 4);
    b.disabled = !inWin;
    const lf = st ? st[0] : null;
    b.innerHTML = `<b>${k}</b><span class="l">${lf ? lf : '·'}</span><span class="f">${lf ? (lf === 'L' ? 'R' : 'L') : '·'}</span>`;
    b.setAttribute('aria-label', `${T().count} ${k}: ${T().leader} ${describe(P, k, 'leader', S.lang)}; ${T().follower} ${describe(P, k, 'follower', S.lang)}`);
    b.addEventListener('click', () => jumpTo(k - 1));
    el.appendChild(b);
  }
}

function showCount(k, force) {
  if (k === lastCount && !force) return;
  lastCount = k;
  $('countBig').textContent = k;
  $('countBig').classList.toggle('hold', !PATTERNS[S.pattern].steps[k]);
  for (const c of $('strip').children) c.classList.toggle('now', +c.firstChild.textContent === k);
  for (const r of $('steps').querySelectorAll('tbody tr')) r.classList.toggle('now', +r.dataset.k === k);
  const P = PATTERNS[S.pattern];
  const l = describe(P, k, 'leader', S.lang), f = describe(P, k, 'follower', S.lang);
  $('nowLeader').textContent = l; $('nowFollower').textContent = f;
  canvas.setAttribute('aria-label', T().canvas(k, T().names[S.pattern]));
  if (!S.playing) $('live').textContent = T().live(k, l, f);
}

function applyRole() {
  if (!leader) return;
  leader.setGhost(S.role === 'follower');
  follower.setGhost(S.role === 'leader');
  dirty = true;
}

function jumpTo(p) {
  const wasPlaying = S.playing;
  if (wasPlaying) stop();
  const lo = windowOff(S.loop), n = windowLen(S.loop);
  S.pos = lo + mod(p - lo, n);
  if (leader) { pose(S.pos); dirty = true; }
  showCount(Math.floor(S.pos) % 8 + 1, true);
  if (wasPlaying) start();
}

function setPlayUI() {
  $('play').setAttribute('aria-pressed', String(S.playing));
  $('playLabel').textContent = S.playing ? T().pause : T().play;
  document.body.classList.toggle('playing', S.playing);
}

function start() {
  band.bpm = S.bpm;
  band.start(S.pos - windowOff(S.loop), (tick) => slotOf(tick, S.loop));
  S.playing = true;
  setPlayUI();
}

function stop() {
  if (!S.playing) return;
  S.pos = currentPos();
  band.stop();
  S.playing = false;
  S.pos = Math.floor(S.pos) % 8;
  setPlayUI();
  if (leader) { pose(S.pos); dirty = true; }
  showCount(Math.floor(S.pos) % 8 + 1, true);
}

function wire() {
  $('play').addEventListener('click', () => (S.playing ? stop() : start()));
  $('tempo').addEventListener('input', (e) => {
    S.bpm = +e.target.value; $('tempoOut').textContent = S.bpm;
    band.retime(S.bpm);
  });
  $('pattern').addEventListener('change', (e) => { S.pattern = e.target.value; badge(); table(); strip(); if (leader) pose(currentPos()); dirty = true; showCount(Math.floor(currentPos()) % 8 + 1, true); });
  for (const b of document.querySelectorAll('[data-loop]')) b.addEventListener('click', () => {
    S.loop = b.dataset.loop;
    for (const x of document.querySelectorAll('[data-loop]')) x.setAttribute('aria-pressed', String(x === b));
    strip(); jumpTo(windowOff(S.loop));
  });
  for (const b of document.querySelectorAll('[data-role]')) b.addEventListener('click', () => {
    S.role = b.dataset.role;
    for (const x of document.querySelectorAll('[data-role]')) x.setAttribute('aria-pressed', String(x === b));
    applyRole(); if (leader) pose(currentPos());
    if (S.role !== 'both') setView(S.role); else dirty = true;
  });
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
  $('mirror').addEventListener('change', (e) => { S.mirror = e.target.checked; canvas.classList.toggle('mirror', S.mirror); });
  $('reduced').addEventListener('change', (e) => { S.reduced = e.target.checked; if (leader) pose(Math.floor(currentPos())); dirty = true; });
  $('prev').addEventListener('click', () => jumpTo(Math.floor(S.pos) - 1));
  $('next').addEventListener('click', () => jumpTo(Math.floor(S.pos) + 1));
  for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => { S.lang = b.dataset.lang; store.set('lang', S.lang); i18n(); });
  // drag to orbit
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || !cam) return;
    const m = S.mirror ? -1 : 1;
    cam.nudge(-(e.clientX - drag.x) * 0.006 * m, (e.clientY - drag.y) * 0.004);
    drag = { x: e.clientX, y: e.clientY }; dirty = true;
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  window.addEventListener('resize', sizeTo);
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; dirty = true; }).observe(canvas);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); $('play').click(); }
    if (e.key === 'ArrowRight' && !S.playing) jumpTo(Math.floor(S.pos) + 1);
    if (e.key === 'ArrowLeft' && !S.playing) jumpTo(Math.floor(S.pos) - 1);
  });
}

function setView(v) {
  S.view = v;
  for (const x of document.querySelectorAll('[data-view]')) x.setAttribute('aria-pressed', String(x.dataset.view === v));
  if (cam) { cam.set(v, S.reduced); dirty = true; }
}

// ---------- deterministic hooks for QA and the video renders ----------
function wav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  let s = ''; const u8 = new Uint8Array(out.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function hooks(ready) {
  window.__dance = {
    ready,
    set(o) {
      Object.assign(S, o);
      if (o.view && cam) cam.set(o.view, true);
      if (o.mirror !== undefined) canvas.classList.toggle('mirror', !!o.mirror);
      applyRole(); i18n();
      return true;
    },
    cam(yaw, pitch, dist, target) { Object.assign(cam.goal, { yaw, pitch, dist: dist || cam.goal.dist }); if (target) cam.target.set(...target); cam.step(0, true); return true; },
    frame(p) { S.pos = p; pose(S.reduced ? Math.floor(p) : p); showCount(Math.floor(p) % 8 + 1); cam.step(0, true); render(); return true; },
    probe(p) {
      const bs = pose(p);
      return {
        k: bs.k, frac: bs.frac, travel: bs.travel,
        leader: leader.probe(), follower: follower.probe(),
        err: { leader: { ...leader.rig.err }, follower: { ...follower.rig.err } },
        targets: { leader: lastTL, follower: lastTF },
        pitchUsed: { leader: { L: leader.lastT.feet.L.pitch, R: leader.lastT.feet.R.pitch }, follower: { L: follower.lastT.feet.L.pitch, R: follower.lastT.feet.R.pitch } },
      };
    },
    shot(type, q) { render(); return canvas.toDataURL(type || 'image/jpeg', q || 0.92); },
    // fixed canvas size for video renders (CSS pixels; the context's device scale sets the pixels)
    size(w, h) { Object.assign(canvas.style, { width: w + 'px', height: h + 'px', aspectRatio: 'auto', maxHeight: 'none' }); sizeTo(); cam.step(0, true); return true; },
    metrics() {
      const a = metrics.cpuMs.slice().sort((x, y) => x - y);
      const info = renderer.info;
      return { loadMs: metrics.loadMs, frames: metrics.frames, renderMsMedian: a[a.length >> 1], renderMsP95: a[Math.floor(a.length * 0.95)], calls: info.render.calls, triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries, lite, dpr: renderer.getPixelRatio() };
    },
    // the band rendered offline, same synth and patterns; `from` = beat at t = 0 (may be negative)
    async audio(beats, bpm, sr, loop, from) {
      from = from || 0;
      const len = Math.ceil((beats * 60 / bpm + 0.6) * sr);
      const oc = new OfflineAudioContext(2, len, sr);
      const comp = oc.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.15;
      const bus = oc.createGain(); bus.gain.value = 0.85; bus.connect(comp); comp.connect(oc.destination);
      const gains = {};
      for (const k of ['bell', 'clave', 'conga', 'bass', 'click']) { const g = oc.createGain(); g.gain.value = LANE_LEVEL[k]; g.connect(bus); gains[k] = g; }
      const voices = makeVoices(oc, gains, makeNoise(oc));
      const half = 30 / bpm;
      const t0 = Math.ceil(from * 2 - 1e-9);
      for (let tick = t0; tick < from * 2 + beats * 2; tick++) playSlot(voices, slotOf(tick, loop || 'all'), (tick - from * 2) * half + 1e-4, 60 / bpm, {});
      return wav(await oc.startRendering());
    },
    state: () => ({ ...S }),
    // CPU cost of solving both dancers (timer resolution is coarse, so time batches of 50 poses)
    bench(n) {
      const t = [];
      for (let r = 0; r < n / 50; r++) { const t0 = performance.now(); for (let i = 0; i < 50; i++) pose(((r * 50 + i) * 0.037) % 8); t.push((performance.now() - t0) / 50); }
      t.sort((a, b) => a - b);
      return { median: +t[t.length >> 1].toFixed(4), p95: +t[Math.floor(t.length * 0.95)].toFixed(4), unit: 'ms per frame, both dancers' };
    },
    // real-time playback log: each rendered frame's heard time and the count position it drew
    async playLog(seconds) {
      const log = [];
      S.pos = 0; start();
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          const now = performance.now();
          const b = band.heardBeats(now), p = currentPos();
          pose(p); render();
          log.push({ perf: now, heard: band.heardTime(now), beats: b, pos: p, ctx: band.ctx.currentTime, lat: band.ctx.outputLatency || 0, base: band.ctx.baseLatency || 0 });
          if (now - t0 < seconds * 1000) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
      const startTime = band.startTime, bpm = band.bpm;
      stop();
      return { log, startTime, bpm };
    },
    rest() {
      for (const d of [leader, follower]) for (const k in d.rig.j) { const J = d.rig.j[k]; J.bone.quaternion.copy(J.r0); if (!J.parent) J.bone.position.copy(J.p0); }
      render(); return true;
    },
  };
}

// ---------- boot ----------
function boot() {
  $('tempo').value = S.bpm; $('tempoOut').textContent = S.bpm;
  $('reduced').checked = S.reduced;
  wire(); i18n();
  document.body.classList.add('js');
  const ready = init3d().then((ok) => { if (ok) { setView(S.view); } return ok; }).catch((e) => {
    console.error(e);
    $('poster').classList.add('fail'); $('posterText').textContent = T().nogl;
    return false;
  });
  if (HOOK) hooks(ready);
  requestAnimationFrame(frame);
}
boot();
export { STATES };
