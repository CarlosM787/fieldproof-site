// SalsaCoach Dancers: two life-size dancers driven by the Count Lab step table and audio clock.
// Phase three adds generated body motion, teaching overlays, slow motion, step-by-step, a count
// voice and the guided practice flow (practice.js). The count engine (choreo.js beatState) and the
// audio clock are unchanged: every pose is still drawn from the time the listener hears.
import { TextureLoader, Clock, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PATTERNS, describe } from '../../salsacoach-count-lab/src/model.js';
import { Band, makeVoices, makeNoise, playSlot, LANE_LEVEL } from './audio.js';
import { REAL, STATES, beatState, dancerTargets, holdTargets, posFrom, slotOf, windowOff, windowLen, movingFoot, ownFoot, lagPos } from './choreo.js';
import { loadDancer, STYLE } from './dancer.js';
import { makeRenderer, makeScene, CameraRig, FloorMarks, ContactShadows } from './stage.js';
import { CountBadges, WeightDots, nextCount } from './overlays.js';
import { rhythmWord, rhythmGroup, RHYTHM_WORDS } from './rhythm.js';
import { CountVoice, synthWord, fitScale } from './voice.js';
import { initPractice } from './practice.js';
/* global PRACTICE_FLOW */ // build-time flag: the practice code ships only in the practice bundle

const $ = (id) => document.getElementById(id);
const mod = (a, n) => ((a % n) + n) % n;
const HOOK = /^#(render|qa)/.test(location.hash);
const PRACTICE = document.body.dataset.mode === 'practice';
// The only thing this page stores: the last tempo (practice flow). Blocked storage is fine.
const store = {
  get(k) { try { return localStorage.getItem('salsacoach.dancers.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('salsacoach.dancers.' + k, v); } catch (e) { /* storage blocked */ } },
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
    overlays: 'Teaching overlays', ovCount: 'Count numbers', ovWeight: 'Weight', ovRhythm: 'Quick-quick-slow', ovPrints: 'Footprints',
    speed: 'Speed', slow: 'Slow motion ½×', stepMode: 'Step by step', stepNext: 'Next count',
    stepHint: 'Step by step: press → or Space, or tap the dancers, for the next count.',
    generated: 'Generated motion, not motion capture',
    eff: (b, e) => `${b} BPM × ½ = ${e} BPM`,
    weight: { L: 'Weight on the left foot', R: 'Weight on the right foot' },
    posterLazy: 'The dancers load when you start (about 0.5 MB more on a phone).', load3d: 'Load the dancers',
    voice: 'Count voice', voiceNote: 'Robot voice made in your browser; a recorded voice replaces it before release.',
    rhythmLabel: 'Rhythm', allControls: 'All controls',
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
    overlays: 'Ayudas visuales', ovCount: 'Números del conteo', ovWeight: 'Peso', ovRhythm: 'Rápido-rápido-lento', ovPrints: 'Huellas',
    speed: 'Velocidad', slow: 'Cámara lenta ½×', stepMode: 'Paso a paso', stepNext: 'Tiempo siguiente',
    stepHint: 'Paso a paso: pulsa → o Espacio, o toca a los bailarines, para el siguiente tiempo.',
    generated: 'Movimiento generado, no es captura de movimiento',
    eff: (b, e) => `${b} BPM × ½ = ${e} BPM`,
    weight: { L: 'Peso en el pie izquierdo', R: 'Peso en el pie derecho' },
    posterLazy: 'Los bailarines se cargan cuando empiezas (cerca de 0.5 MB más en un teléfono).', load3d: 'Cargar a los bailarines',
    voice: 'Voz que cuenta', voiceNote: 'Voz robótica hecha en tu navegador; una voz grabada la reemplaza antes del lanzamiento.',
    rhythmLabel: 'Ritmo', allControls: 'Todos los controles',
  },
};

const urlLang = (/[?&]lang=(en|es)\b/.exec(location.search) || [])[1];
const savedBpm = +store.get('tempo');
const S = {
  lang: urlLang || document.body.dataset.lang || (/^es\b/i.test(navigator.language || '') ? 'es' : 'en'),
  pattern: 'on1', loop: 'all', role: 'both', view: 'leader', mirror: false,
  bpm: PRACTICE && savedBpm >= 60 && savedBpm <= 220 ? savedBpm : 150,
  reduced: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  playing: false, pos: 0,
  // phase three
  slow: false, stepMode: false, voice: false,
  ov: { count: true, weight: true, rhythm: true, prints: true },
  noPeek: false,
};
const T = () => I18N[S.lang];
const COLORS = { leader: '#6fd3ff', follower: '#ff72b8' };
const rate = () => (S.slow ? 0.5 : 1);
const effBpm = () => Math.max(30, Math.round(S.bpm * rate()));

// ---------- 3D ----------
const canvas = $('stage');
const lite = /lite/.test(location.hash) || document.body.dataset.tier === 'lite' || (!/full/.test(location.hash) && document.body.dataset.tier !== 'full' && ((window.matchMedia && matchMedia('(max-width: 720px)').matches) || (navigator.deviceMemory && navigator.deviceMemory <= 4)));
let renderer = null, world = null, cam = null, marks = null, shadows = null, badges = null, dots = null, leader = null, follower = null;
const band = new Band();
const clock = new Clock();
let dirty = true, visible = true, lastCount = -1;
const metrics = { loadStart: 0, loadMs: 0, frames: 0, cpuMs: [], frameMs: [] };
let loading = null;

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

function posterFail() { $('poster').classList.add('fail'); $('posterText').textContent = T().nogl; const b = $('load3d'); if (b) b.hidden = true; }

async function init3d() {
  metrics.loadStart = performance.now();
  $('poster').classList.add('busy');
  $('posterText').textContent = T().loading;
  try {
    renderer = makeRenderer(canvas, { keep: HOOK });
  } catch (e) {
    posterFail();
    return false;
  }
  world = makeScene(renderer, lite ? 'lite' : 'full');
  cam = new CameraRig(16 / 9, [0, 0.86, REAL.gap / 2]);
  shadows = new ContactShadows(world.scene);
  marks = new FloorMarks(world.scene, COLORS);
  dots = new WeightDots(world.scene, COLORS);
  badges = new CountBadges(world.scene, COLORS);
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
  applyOverlays();
  // compile every material now (overlays included), so no shader compiles in the middle of a dance
  for (const g of [badges.group, dots.group, marks.group]) g.traverse((o) => { o.userData.v = o.visible; o.visible = true; });
  for (const d of [leader, follower]) { d.setGhost(true); renderer.compile(world.scene, cam.cam); d.setGhost(false); }
  renderer.compile(world.scene, cam.cam);
  for (const g of [badges.group, dots.group, marks.group]) g.traverse((o) => { o.visible = o.userData.v; });
  for (const k in badges.tex) renderer.initTexture(badges.tex[k]); // upload the digits now, not on first use
  applyRole();
  pose(S.pos);
  render();
  $('poster').classList.add('gone');
  if ($('load3d')) $('load3d').hidden = true;
  document.body.classList.add('has3d');
  return true;
}
// load the 3D once, on demand (the practice page waits for the viewer to ask)
function ensure3d() {
  if (!loading) loading = init3d().then((ok) => { if (ok) setView(S.view); return ok; }).catch((e) => { console.error(e); posterFail(); return false; });
  return loading;
}

const dims = () => ({
  leader: { shoulder: leader.rig.dims.shoulder, head: leader.rig.dims.head, eye: leader.rig.dims.eye },
  follower: { shoulder: follower.rig.dims.shoulder, head: follower.rig.dims.head, eye: follower.rig.dims.eye },
});

let lastBS = null, lastTL = null, lastTF = null;
function pose(p) {
  const bs = beatState(p, S.pattern, S.loop, S.reduced);
  const tl = dancerTargets('leader', bs), tf = dancerTargets('follower', bs);
  const D = dims();
  // relaxed arms: the joined hands follow the bodies a moment earlier (never with reduced motion)
  let lagL = null, lagF = null;
  if (!S.reduced) {
    const bl = beatState(lagPos(p, REAL.handLag, S.loop), S.pattern, S.loop, false);
    lagL = dancerTargets('leader', bl).body; lagF = dancerTargets('follower', bl).body;
  }
  const hold = holdTargets(tl.body, tf.body, D, lagL, lagF);
  const lookL = new Vector3(tf.body.x, D.follower.head - 0.02, tf.body.z);
  const lookF = new Vector3(tl.body.x, D.leader.head - 0.02, tl.body.z);
  // eye focus: each dancer's eyes find the partner's eyes (she faces -Z, he faces +Z)
  const eyeL = new Vector3(tf.body.x, D.follower.eye, tf.body.z - 0.09);
  const eyeF = new Vector3(tl.body.x, D.leader.eye, tl.body.z + 0.09);
  leader.apply(tl, hold.leader, lookL, STYLE.leader, eyeL);
  follower.apply(tf, hold.follower, lookF, STYLE.follower, eyeF);
  // landing pulse: the foot that landed (or took the weight) on this count, over 0.45 beat
  const landing = (role) => {
    const out = {};
    if (bs.travel || S.reduced) return out;
    const mv = movingFoot(bs.prev, bs.at);
    const lf = mv || (bs.prev.w !== bs.at.w ? bs.at.w : null);
    if (lf) out[ownFoot(role, lf)] = bs.frac / 0.45;
    return out;
  };
  const showL = S.role !== 'follower', showF = S.role !== 'leader';
  marks.update('leader', tl, 1, showL && S.ov.prints, landing('leader'));
  marks.update('follower', tf, -1, showF && S.ov.prints, landing('follower'));
  shadows.update('leader', leader, tl, !leader.ghost);
  shadows.update('follower', follower, tf, !follower.ghost);
  const holds = PATTERNS[S.pattern].holds;
  // the dancer farther from the camera shows its badges higher (no overlap when both are shown)
  const farF = cam.cam.position.distanceToSquared(follower.group.position) > cam.cam.position.distanceToSquared(leader.group.position);
  const both = showL && showF;
  badges.update('leader', bs, tl, 1, S.loop, holds, showL && S.ov.count, both && !farF);
  badges.update('follower', bs, tf, -1, S.loop, holds, showF && S.ov.count, both && farF);
  dots.update('leader', leader, showL && S.ov.weight);
  dots.update('follower', follower, showF && S.ov.weight);
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

// ---------- step by step: one count per press, on the audio clock ----------
const stepper = { anim: null };
function heardNow() { return band.heardTime(performance.now()); }
function stepOnce(dir = 1) {
  if (S.playing) stop();
  if (stepper.anim) { S.pos = stepper.anim.to; stepper.anim = null; }
  const lo = windowOff(S.loop), n = windowLen(S.loop);
  const from = lo + mod(Math.round(S.pos) - lo, n), to = lo + mod(from + dir - lo, n);
  const kTo = Math.floor(to) % 8 + 1;
  band.cueOut();
  const beat = 60 / effBpm();
  const tLand = band.ctx.currentTime + 0.06 + (S.reduced || dir < 0 ? 0 : beat);
  cueCount(kTo, tLand);
  if (S.reduced || dir < 0 || !leader) {
    S.pos = to;
    if (leader) { pose(S.pos); dirty = true; }
    showCount(kTo, true);
    return { from, to, tLand };
  }
  stepper.anim = { from, to, tStart: tLand - beat, dur: beat, tLand };
  return { from, to, tLand };
}
function stepFrame() {
  const a = stepper.anim;
  const u = (heardNow() - a.tStart) / a.dur;
  if (u >= 1) {
    S.pos = a.to; stepper.anim = null;
    pose(S.pos); showCount(Math.floor(S.pos) % 8 + 1, true);
  } else {
    const p = a.from + Math.max(0, u);
    pose(p); showCount(Math.floor(p) % 8 + 1);
  }
  dirty = true;
}

// ---------- count voice (and a plain click when the voice is off) ----------
let voice = null;
function ensureVoice() {
  const out = band.cueOut();
  if (!voice) voice = new CountVoice(band.ctx, out);
  voice.prepare(S.lang, 60 / effBpm());
  return voice;
}
function cueCount(k, t) {
  const P = PATTERNS[S.pattern], hold = !P.steps[k];
  if (S.voice) { ensureVoice().say(k, t, hold ? 0.4 : 1); return; }
  band.cueVoices.click(t, k === 1 || k === 5);
}
// while the band plays, the voice counts every beat; each word is scheduled one beat ahead
const spoken = new Set();
band.onTick = (tick, slot, t) => {
  if (!S.voice || slot % 2) return;
  const v = ensureVoice(), half = 30 / band.bpm;
  const P = PATTERNS[S.pattern];
  for (const [tk, tt] of [[tick, t], [tick + 2, t + 2 * half]]) {
    if (spoken.has(tk)) continue;
    spoken.add(tk);
    const k = slotOf(tk, S.loop) / 2 + 1;
    v.say(k, tt, P.steps[k] ? 1 : 0.4);
  }
  if (spoken.size > 64) for (const x of [...spoken].slice(0, 32)) spoken.delete(x);
};

function frame() {
  if (HOOK) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, clock.getDelta());
  if (S.playing && !renderer) { showCount(Math.floor(currentPos()) % 8 + 1); }
  if (!renderer || !leader) return;
  const moving = cam.step(dt, S.reduced);
  if (!visible && !S.playing && !stepper.anim) return;
  const f0 = performance.now();
  if (S.playing) {
    const p = currentPos();
    const shown = S.reduced ? Math.floor(p) : p;
    pose(shown);
    showCount(Math.floor(p) % 8 + 1);
    dirty = true;
  } else if (stepper.anim) stepFrame();
  if ((dirty || moving) && visible) render();
  if (metrics.frameMs.length < 600) metrics.frameMs.push(performance.now() - f0);
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
  setPlayUI();
  badge(); table(); strip(); tempoText(); showCount(Math.floor(S.pos) % 8 + 1, true);
  if (!renderer && !$('poster').classList.contains('busy') && $('load3d')) $('posterText').textContent = T().posterLazy;
  if (voice) voice.prepare(S.lang, 60 / effBpm());
  if (practice) practice.i18n();
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

// quick-quick-slow caption for the group of four counts around count k
function rhythm(k) {
  const el = $('rhythm');
  if (!el) return;
  el.hidden = !S.ov.rhythm;
  const P = PATTERNS[S.pattern], words = RHYTHM_WORDS[S.lang];
  const group = rhythmGroup(P, k);
  el.innerHTML = group.map((c) => {
    const w = rhythmWord(P, c);
    return `<span class="rw ${w}${c === k ? ' now' : ''}"><b>${c}</b>${words[w]}</span>`;
  }).join('');
  el.dataset.word = rhythmWord(P, k);
}

function weightText(k) {
  const st = STATES[S.pattern][k];
  const wl = $('wLeader'), wf = $('wFollower');
  if (wl) wl.textContent = T().weight[st.w];
  if (wf) wf.textContent = T().weight[st.w === 'L' ? 'R' : 'L'];
}

function showCount(k, force) {
  if (k === lastCount && !force) return;
  lastCount = k;
  $('countBig').textContent = k;
  $('countBig').classList.toggle('hold', !PATTERNS[S.pattern].steps[k]);
  if (!S.reduced && S.playing) { const cb = $('countBig'); cb.classList.remove('flash'); void cb.offsetWidth; cb.classList.add('flash'); }
  for (const c of $('strip').children) c.classList.toggle('now', +c.firstChild.textContent === k);
  for (const r of $('steps').querySelectorAll('tbody tr')) r.classList.toggle('now', +r.dataset.k === k);
  const P = PATTERNS[S.pattern];
  const l = describe(P, k, 'leader', S.lang), f = describe(P, k, 'follower', S.lang);
  $('nowLeader').textContent = l; $('nowFollower').textContent = f;
  rhythm(k); weightText(k);
  canvas.setAttribute('aria-label', T().canvas(k, T().names[S.pattern]));
  if (!S.playing && !S.noPeek) $('live').textContent = T().live(k, l, f);
  if (practice) practice.onCount(k);
}

function applyRole() {
  if (!leader) return;
  leader.setGhost(S.role === 'follower');
  follower.setGhost(S.role === 'leader');
  dirty = true;
}

function applyOverlays() {
  for (const k in S.ov) { const el = $('ov-' + k); if (el) el.checked = S.ov[k]; }
  const el = $('rhythm'); if (el) el.hidden = !S.ov.rhythm;
  if (leader) { pose(stepper.anim ? stepper.anim.from : currentPos()); dirty = true; }
}

function jumpTo(p) {
  const wasPlaying = S.playing;
  if (wasPlaying) stop();
  stepper.anim = null;
  const lo = windowOff(S.loop), n = windowLen(S.loop);
  S.pos = lo + mod(p - lo, n);
  if (leader) { pose(S.pos); dirty = true; }
  showCount(Math.floor(S.pos) % 8 + 1, true);
  if (wasPlaying) start();
}

function setPlayUI() {
  const step = S.stepMode && !S.playing;
  $('play').setAttribute('aria-pressed', String(S.playing));
  $('playLabel').textContent = step ? T().stepNext : S.playing ? T().pause : T().play;
  document.body.classList.toggle('playing', S.playing);
  document.body.classList.toggle('stepmode', S.stepMode);
}

function tempoText() {
  const o = $('tempoEff');
  if (o) o.textContent = S.slow ? T().eff(S.bpm, effBpm()) : '';
}

function start() {
  stepper.anim = null;
  if (!renderer && !PRACTICE) ensure3d();
  band.bpm = effBpm();
  spoken.clear();
  if (S.voice) ensureVoice();
  band.start(S.pos - windowOff(S.loop), (tick) => slotOf(tick, S.loop));
  S.playing = true;
  setPlayUI();
  if (practice) practice.onPlay(true);
}

function stop() {
  if (!S.playing) return;
  S.pos = currentPos();
  band.stop();
  if (voice) voice.hush();
  S.playing = false;
  S.pos = Math.floor(S.pos) % 8;
  setPlayUI();
  if (leader) { pose(S.pos); dirty = true; }
  showCount(Math.floor(S.pos) % 8 + 1, true);
  if (practice) practice.onPlay(false);
}

function setTempo(bpm) {
  S.bpm = Math.max(60, Math.min(220, Math.round(bpm)));
  $('tempo').value = S.bpm; $('tempoOut').textContent = S.bpm;
  band.retime(effBpm());
  if (voice) voice.prepare(S.lang, 60 / effBpm());
  tempoText();
}
function setSlow(on) {
  S.slow = !!on;
  $('slow').checked = S.slow;
  band.retime(effBpm());
  if (voice) voice.prepare(S.lang, 60 / effBpm());
  tempoText();
}
function setStepMode(on) {
  S.stepMode = !!on;
  $('stepMode').checked = S.stepMode;
  if (S.stepMode && S.playing) stop();
  $('stepHint').hidden = !S.stepMode;
  setPlayUI();
}

function wire() {
  $('play').addEventListener('click', () => (S.stepMode && !S.playing ? stepOnce(1) : S.playing ? stop() : start()));
  $('tempo').addEventListener('input', (e) => setTempo(+e.target.value));
  $('pattern').addEventListener('change', (e) => { S.pattern = e.target.value; badge(); table(); strip(); if (leader) pose(currentPos()); dirty = true; showCount(Math.floor(currentPos()) % 8 + 1, true); });
  for (const b of document.querySelectorAll('[data-loop]')) b.addEventListener('click', () => {
    S.loop = b.dataset.loop;
    for (const x of document.querySelectorAll('[data-loop]')) x.setAttribute('aria-pressed', String(x === b));
    strip(); jumpTo(windowOff(S.loop));
  });
  for (const b of document.querySelectorAll('[data-role]')) b.addEventListener('click', () => setRole(b.dataset.role));
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
  $('mirror').addEventListener('change', (e) => { S.mirror = e.target.checked; canvas.classList.toggle('mirror', S.mirror); });
  $('reduced').addEventListener('change', (e) => { S.reduced = e.target.checked; document.body.classList.toggle('calm', S.reduced); if (leader) pose(Math.floor(currentPos())); dirty = true; });
  $('slow').addEventListener('change', (e) => setSlow(e.target.checked));
  $('stepMode').addEventListener('change', (e) => setStepMode(e.target.checked));
  $('voice').addEventListener('change', (e) => { S.voice = e.target.checked; if (S.voice) ensureVoice(); });
  for (const k in S.ov) { const el = $('ov-' + k); if (el) el.addEventListener('change', (e) => { S.ov[k] = e.target.checked; applyOverlays(); showCount(Math.floor(S.pos) % 8 + 1, true); }); }
  $('prev').addEventListener('click', () => (S.stepMode ? stepOnce(-1) : jumpTo(Math.floor(S.pos) - 1)));
  $('next').addEventListener('click', () => (S.stepMode ? stepOnce(1) : jumpTo(Math.floor(S.pos) + 1)));
  const l3 = $('load3d'); if (l3) l3.addEventListener('click', () => { l3.hidden = true; ensure3d(); });
  for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => { S.lang = b.dataset.lang; i18n(); });
  // drag to orbit; a short tap on the dancers advances one count in step mode
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || !cam) return;
    const m = S.mirror ? -1 : 1;
    cam.nudge(-(e.clientX - drag.x) * 0.006 * m, (e.clientY - drag.y) * 0.004);
    drag.x = e.clientX; drag.y = e.clientY; dirty = true;
  });
  const end = (e) => {
    if (drag && e.type === 'pointerup' && S.stepMode && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8 && performance.now() - drag.t0 < 400) stepOnce(1);
    drag = null;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  window.addEventListener('resize', sizeTo);
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; dirty = true; }).observe(canvas);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea, #tap')) return;
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); $('play').click(); }
    if (e.key === 'ArrowRight' && !S.playing) { e.preventDefault(); S.stepMode ? stepOnce(1) : jumpTo(Math.floor(S.pos) + 1); }
    if (e.key === 'ArrowLeft' && !S.playing) { e.preventDefault(); S.stepMode ? stepOnce(-1) : jumpTo(Math.floor(S.pos) - 1); }
  });
}

function setView(v) {
  S.view = v;
  for (const x of document.querySelectorAll('[data-view]')) x.setAttribute('aria-pressed', String(x.dataset.view === v));
  if (cam) { cam.set(v, S.reduced); dirty = true; }
}
function setRole(r) {
  S.role = r;
  for (const x of document.querySelectorAll('[data-role]')) x.setAttribute('aria-pressed', String(x.dataset.role === r));
  applyRole(); if (leader) pose(currentPos());
  if (S.role !== 'both') setView(S.role); else dirty = true;
}

// ---------- the guided practice flow ----------
const app = {
  S, T, band, PATTERNS, describe,
  load3d: ensure3d, has3d: () => !!leader,
  start, stop, playing: () => S.playing, heardPos: currentPos,
  setTempo, setSlow, setStepMode, setView, setRole, stepOnce,
  setVoice(on) { S.voice = !!on; $('voice').checked = S.voice; if (on) ensureVoice(); },
  setOverlays(o) { Object.assign(S.ov, o); applyOverlays(); showCount(Math.floor(S.pos) % 8 + 1, true); },
  setLoop(l) { const b = document.querySelector(`[data-loop="${l}"]`); if (b) b.click(); },
  setPattern(p) { $('pattern').value = p; $('pattern').dispatchEvent(new Event('change')); },
  jumpTo,
  noPeek(on) { S.noPeek = !!on; document.body.classList.toggle('nopeek', S.noPeek); },
  saveTempo() { store.set('tempo', String(S.bpm)); },
  // heard position (0 = count 1) of an event with a performance.now() timestamp
  tapPos(ts) { if (!band.ctx || !S.playing) return null; const b = band.heardBeats(ts); return b < 0 ? null : posFrom(b, S.loop); },
  beatMs: () => 60000 / effBpm(),
  lanes(l) { band.lanes = l || {}; },
};
let practice = null;

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
      if (o.ov) S.ov = { ...S.ov, ...o.ov };
      if (o.view && cam) cam.set(o.view, true);
      if (o.mirror !== undefined) canvas.classList.toggle('mirror', !!o.mirror);
      if (o.slow !== undefined) setSlow(o.slow);
      if (o.stepMode !== undefined) setStepMode(o.stepMode);
      applyRole(); applyOverlays(); i18n();
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
        badges: Object.fromEntries(Object.entries(badges.sprites).map(([k, s]) => [k, { v: s.visible, n: s.material.map ? Object.keys(badges.tex).find((d) => badges.tex[d] === s.material.map) : null, o: +s.material.opacity.toFixed(3), x: +s.position.x.toFixed(4), z: +s.position.z.toFixed(4) }])),
        dots: Object.fromEntries(Object.entries(dots.items).map(([k, it]) => [k, { v: it.dot.visible, x: it.dot.position.x, z: it.dot.position.z }])),
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
    // the band rendered offline, same synth and patterns; `from` = beat at t = 0 (may be negative).
    // opts.voice: also render the count voice (lang) exactly as the page schedules it
    async audio(beats, bpm, sr, loop, from, opts) {
      from = from || 0; opts = opts || {};
      const len = Math.ceil((beats * 60 / bpm + 0.6) * sr);
      const oc = new OfflineAudioContext(2, len, sr);
      const comp = oc.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.15;
      const bus = oc.createGain(); bus.gain.value = opts.band === false ? 0 : 0.85; bus.connect(comp); comp.connect(oc.destination);
      const gains = {};
      for (const k of ['bell', 'clave', 'conga', 'bass', 'click']) { const g = oc.createGain(); g.gain.value = LANE_LEVEL[k]; g.connect(bus); gains[k] = g; }
      const voices = makeVoices(oc, gains, makeNoise(oc));
      const half = 30 / bpm;
      const t0 = Math.ceil(from * 2 - 1e-9);
      let cv = null;
      if (opts.voice) { const vg = oc.createGain(); vg.gain.value = opts.voiceGain || 0.9; vg.connect(oc.destination); cv = new CountVoice(oc, vg); cv.prepare(opts.voice, 60 / bpm); }
      const P = PATTERNS[opts.pattern || S.pattern];
      for (let tick = t0; tick < from * 2 + beats * 2; tick++) {
        const slot = slotOf(tick, loop || 'all'), t = (tick - from * 2) * half + 1e-4;
        playSlot(voices, slot, t, 60 / bpm, opts.lanes || {});
        if (cv && slot % 2 === 0 && t - 0.2 >= 0) { const k = slot / 2 + 1; cv.say(k, t, P.steps[k] ? 1 : 0.4); }
      }
      return wav(await oc.startRendering());
    },
    // count-voice words and anchors for a tempo (QA: the anchor is where the word lands)
    voiceWords(lang, bpm) { const sc = fitScale(lang, 60 / bpm); const o = {}; for (let k = 1; k <= 8; k++) { const w = synthWord(lang, k, sc); o[k] = { anchor: w.anchor, seconds: w.seconds }; } return { scale: sc, words: o }; },
    state: () => ({ ...S, ov: { ...S.ov }, stepAnim: stepper.anim ? { ...stepper.anim } : null, effBpm: effBpm(), has3d: !!leader }),
    // CPU cost of solving both dancers (timer resolution is coarse, so time batches of 50 poses)
    bench(n) {
      const t = [];
      for (let r = 0; r < n / 50; r++) { const t0 = performance.now(); for (let i = 0; i < 50; i++) pose(((r * 50 + i) * 0.037) % 8); t.push((performance.now() - t0) / 50); }
      t.sort((a, b) => a - b);
      return { median: +t[t.length >> 1].toFixed(4), p95: +t[Math.floor(t.length * 0.95)].toFixed(4), unit: 'ms per frame, both dancers' };
    },
    // CPU cost of one full frame: pose + render, timed individually
    frameBench(n) {
      const t = [];
      for (let i = 0; i < n; i++) { const t0 = performance.now(); pose((i * 0.113) % 8); renderer.render(world.scene, cam.cam); renderer.getContext().finish(); t.push(performance.now() - t0); }
      t.sort((a, b) => a - b);
      return { median: +t[t.length >> 1].toFixed(2), p95: +t[Math.floor(t.length * 0.95)].toFixed(2), unit: 'ms per frame (pose + render + GPU finish), software WebGL' };
    },
    // real-time playback log: each rendered frame's heard time and the count position it drew
    async playLog(seconds, opts) {
      opts = opts || {};
      if (opts.slow !== undefined) setSlow(opts.slow);
      const log = [];
      S.pos = 0; start();
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          const now = performance.now();
          const b = band.heardBeats(now), p = currentPos();
          const t1 = performance.now(); pose(p); const t2 = performance.now(); render(); const t3 = performance.now();
          const probe = opts.probe ? leader.probe() : null;
          log.push({ perf: now, heard: band.heardTime(now), beats: b, pos: p, ctx: band.ctx.currentTime, lat: band.ctx.outputLatency || 0, base: band.ctx.baseLatency || 0, ball: probe ? [probe.Lball.x, probe.Lball.y, probe.Lball.z] : null, poseMs: t2 - t1, renderMs: t3 - t2 });
          // opts.minCounts: stop early once that many counts have been drawn (busy machines render slowly)
          const counts = opts.minCounts ? log.filter((x, i) => i && Math.floor(x.pos) !== Math.floor(log[i - 1].pos) && x.beats > 0).length : 0;
          if (now - t0 < seconds * 1000 && !(opts.minCounts && counts >= opts.minCounts + 1)) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
      const startTime = band.startTime, bpm = band.bpm;
      stop();
      if (opts.slow !== undefined) setSlow(false);
      return { log, startTime, bpm };
    },
    // step mode: press once, then follow the animation on the audio clock until it lands
    async stepLog() {
      setStepMode(true);
      const r = stepOnce(1), log = [];
      await new Promise((res) => {
        const tick = () => {
          const h = heardNow();
          if (stepper.anim) stepFrame();
          log.push({ heard: h, pos: stepper.anim ? stepper.anim.from + Math.max(0, (h - stepper.anim.tStart) / stepper.anim.dur) : S.pos, done: !stepper.anim });
          if (stepper.anim || log.length < 3) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
      return { ...r, log, pos: S.pos, beat: 60 / effBpm() };
    },
    practice: () => practice && practice.state(),
    demo: (o) => practice.demo(o),
    // the page's own frame loop is off under the hooks; tests advance a step animation with this
    tick: () => { if (stepper.anim) stepFrame(); return !!stepper.anim; },
    practiceGo: (i) => { practice.go(i); return practice.state(); },
    // a tap at the moment beat b (0 = count 1 of the first 8-count) is heard, through the real judge
    practiceTapAt: (b) => practice.onTap({ timeStamp: tsForBeat(b), preventDefault() {} }),
    tsForBeat,
    band: () => ({ bpm: band.bpm, startTime: band.startTime, now: band.ctx ? band.ctx.currentTime : null, heard: band.ctx ? heardNow() : null, lanes: { ...band.lanes }, playing: S.playing }),
    i18nKeys: () => ({ en: Object.keys(I18N.en), es: Object.keys(I18N.es), practice: practice ? practice.keys() : null }),
    rhythmWord: () => { const el = $('rhythm'); return el ? { word: el.dataset.word, hidden: el.hidden, text: el.textContent } : null; },
    shadows: () => Object.fromEntries(Object.entries(shadows.items).map(([r, it]) => [r, { L: +it.L.material.opacity.toFixed(3), R: +it.R.material.opacity.toFixed(3), v: it.L.visible }])),
    rest() {
      for (const d of [leader, follower]) for (const k in d.rig.j) { const J = d.rig.j[k]; J.bone.quaternion.copy(J.r0); if (!J.parent) J.bone.position.copy(J.p0); }
      render(); return true;
    },
  };
}

// performance.now() timestamp at which beat b of the current playback is heard (inverse of heardTime)
function tsForBeat(b) {
  const tHeard = band.startTime + b * 60 / band.bpm;
  const o = band.ctx.getOutputTimestamp ? band.ctx.getOutputTimestamp() : null;
  if (o && o.contextTime > 0 && o.performanceTime > 0) return o.performanceTime + (tHeard - o.contextTime) * 1000;
  return performance.now() + (tHeard - (band.ctx.currentTime - (band.ctx.outputLatency || 0))) * 1000;
}

// ---------- boot ----------
function boot() {
  $('tempo').value = S.bpm; $('tempoOut').textContent = S.bpm;
  $('reduced').checked = S.reduced;
  document.body.classList.toggle('calm', S.reduced);
  wire();
  if (PRACTICE_FLOW && document.getElementById('practice')) practice = initPractice(app);
  i18n();
  document.body.classList.add('js');
  const ready = PRACTICE && !HOOK ? Promise.resolve(false) : ensure3d();
  if (PRACTICE && HOOK) ensure3d();
  if (HOOK) hooks(PRACTICE ? loading || ready : ready);
  requestAnimationFrame(frame);
}
boot();
export { STATES };
