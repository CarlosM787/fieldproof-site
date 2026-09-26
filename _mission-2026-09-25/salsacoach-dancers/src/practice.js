// The guided practice flow (phase three): Listen -> Find the 1 -> Watch slowly -> Step along ->
// Speed up. No accounts and nothing sent anywhere; the only thing stored is the last tempo.
// Find the 1 uses the Count Lab's tap judge (judge.js), its verdict words and its windows.
import { judgeTap, calTap, median, fmtMs } from './judge.js';

const STEPS = ['listen', 'find', 'watch', 'along', 'speed'];
const TXT = {
  en: {
    title: 'Practice the basic in five steps',
    progress: (n) => `Step ${n} of 5`, done: 'done', stepsLabel: 'Practice steps',
    names: { listen: 'Listen', find: 'Find the 1', watch: 'Watch slowly', along: 'Step along', speed: 'Speed up' },
    intro: {
      listen: 'Press Start and listen for two 8-counts. A soft click marks every 1. The clave never plays on the 1; the bass and the low conga lead you to it. The dancers load while you listen.',
      find: 'Tap on every 1. The counts are hidden, so your ears do the work. Three taps on the 1 in a row finish this step. Switch to "Band only" when the click gets easy.',
      watch: 'The dancers dance the basic at half speed. Each number appears on the floor where a foot lands; the dot shows where the weight is. Use Step by step to go one count per tap.',
      along: 'Stand up and step with the dancers. The voice counts and the big number flashes on every count. Hold still on the pause.',
      speed: 'Add speed in small jumps. Stay on each tempo until the step lands without thinking. Your last tempo is remembered on this device only.',
    },
    start: 'Start the band', stop: 'Stop', startStep: 'Start stepping', playSlow: 'Play at half speed', pause: 'Pause',
    stepByStep: 'Step by step', nextCount: 'Next count', iDance: 'I dance', both: 'Both', leader: 'Leader', follower: 'Follower',
    back: 'Back', next: 'Next step', finish: 'Start again',
    heard: (n) => `${n} of 16 counts heard.`, watched: (n) => `${n} of 8 counts watched.`, stepped: (n) => `${n} of 32 counts stepped.`,
    listened: 'Good. You heard two full 8-counts. Next: find the 1 yourself.',
    found: 'Three on the 1 in a row. Next: watch the basic slowly.',
    watchedAll: 'You watched a full 8-count. Next: step along.',
    steppedAll: 'Four 8-counts stepped. Next: speed it up.',
    sped: (b) => `You played the basic at ${b} BPM. Keep going, or start again.`,
    levels: { guided: 'Click on the 1', band: 'Band only' },
    tap: 'Tap on the 1', calibrate: 'Calibrate', calibrating: 'Tap on every click · ', calDone: 'Calibration: ', calNone: 'Not calibrated',
    v: { good: 'On the 1', early: 'Early', late: 'Late', five: 'That was the 5', far: 'Keep listening', start: 'Band on. Tap on the next 1.' },
    stats: (n, med, on, streak) => n + ' taps · median ' + med + ' · ' + on + ' on the 1 · best streak ' + streak,
    streak: (n) => `Streak: ${n} of 3`,
    cueStep: (k, what) => `${k} · ${what}`, cueHold: (k) => `${k} · hold`,
    tempoNow: (b) => `${b} BPM`, voiceOn: 'Count voice',
    peek: 'Eyes closed: find the 1 by ear',
    announce: (n, name) => `Step ${n} of 5: ${name}`,
    loading: 'Loading the dancers…',
  },
  es: {
    title: 'Practica el básico en cinco pasos',
    progress: (n) => `Paso ${n} de 5`, done: 'hecho', stepsLabel: 'Pasos de la práctica',
    names: { listen: 'Escucha', find: 'Encuentra el 1', watch: 'Mira despacio', along: 'Baila junto', speed: 'Sube el tempo' },
    intro: {
      listen: 'Pulsa Empezar y escucha dos ciclos de 8. Un clic suave marca cada 1. La clave nunca suena en el 1; el bajo y la conga grave te llevan a él. Los bailarines se cargan mientras escuchas.',
      find: 'Toca en cada 1. Los números están ocultos, así que tu oído hace el trabajo. Tres toques seguidos en el 1 terminan este paso. Cambia a "Solo la banda" cuando el clic te resulte fácil.',
      watch: 'Los bailarines bailan el básico a la mitad de velocidad. Cada número aparece en el piso donde cae un pie; el punto muestra dónde está el peso. Usa Paso a paso para avanzar un tiempo por toque.',
      along: 'Ponte de pie y da los pasos con los bailarines. La voz cuenta y el número grande se ilumina en cada tiempo. Quédate quieto en la pausa.',
      speed: 'Sube la velocidad poco a poco. Quédate en cada tempo hasta que el paso caiga sin pensarlo. Tu último tempo se guarda solo en este dispositivo.',
    },
    start: 'Empezar la banda', stop: 'Parar', startStep: 'Empezar a bailar', playSlow: 'Reproducir a mitad de velocidad', pause: 'Pausa',
    stepByStep: 'Paso a paso', nextCount: 'Tiempo siguiente', iDance: 'Yo bailo', both: 'Ambos', leader: 'Líder', follower: 'Seguidor(a)',
    back: 'Atrás', next: 'Paso siguiente', finish: 'Empezar de nuevo',
    heard: (n) => `${n} de 16 tiempos escuchados.`, watched: (n) => `${n} de 8 tiempos vistos.`, stepped: (n) => `${n} de 32 tiempos bailados.`,
    listened: 'Bien. Escuchaste dos ciclos completos de 8. Ahora: encuentra el 1 tú.',
    found: 'Tres seguidos en el 1. Ahora: mira el básico despacio.',
    watchedAll: 'Viste un ciclo completo de 8. Ahora: baila junto.',
    steppedAll: 'Bailaste cuatro ciclos de 8. Ahora: sube el tempo.',
    sped: (b) => `Bailaste el básico a ${b} BPM. Sigue, o empieza de nuevo.`,
    levels: { guided: 'Clic en el 1', band: 'Solo la banda' },
    tap: 'Toca en el 1', calibrate: 'Calibrar', calibrating: 'Toca en cada clic · ', calDone: 'Calibración: ', calNone: 'Sin calibrar',
    v: { good: 'En el uno', early: 'Antes', late: 'Tarde', five: 'Ese fue el 5', far: 'Sigue escuchando', start: 'La banda ya suena. Toca en el próximo uno.' },
    stats: (n, med, on, streak) => n + ' toques · mediana ' + med + ' · ' + on + ' en el uno · mejor racha ' + streak,
    streak: (n) => `Racha: ${n} de 3`,
    cueStep: (k, what) => `${k} · ${what}`, cueHold: (k) => `${k} · pausa`,
    tempoNow: (b) => `${b} BPM`, voiceOn: 'Voz que cuenta',
    peek: 'Ojos cerrados: encuentra el 1 de oído',
    announce: (n, name) => `Paso ${n} de 5: ${name}`,
    loading: 'Cargando a los bailarines…',
  },
};

const deepKeys = (o, pre = '') => Object.keys(o).flatMap((k) => (o[k] && typeof o[k] === 'object' ? deepKeys(o[k], pre + k + '.') : [pre + k])).sort();

export function initPractice(app) {
  const $ = (id) => document.getElementById(id);
  const S = app.S;
  const L = () => TXT[S.lang];
  const P = {
    step: 0, done: [false, false, false, false, false],
    heard: 0, watched: 0, stepped: 0, speedBeats: 0, sawCount: -1,
    role: 'leader', level: 'guided', taps: [], streak: 0, best: 0, offset: 0, cal: false, calTaps: [],
    practiceBpm: 120, alongBpm: 110,
  };
  const el = {
    steps: $('prSteps'), bar: $('prBar'), prog: $('prProg'), title: $('prTitle'), text: $('prText'), actions: $('prActions'),
    tapZone: $('tapZone'), cue: $('prCue'), fb: $('prFeedback'), back: $('prBack'), next: $('prNext'), announce: $('prAnnounce'),
  };

  function btn(label, onClick, cls, extra) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
    if (extra) for (const k in extra) b.setAttribute(k, extra[k]);
    b.addEventListener('click', onClick);
    return b;
  }

  function markDone(i, msg) {
    if (!P.done[i]) { P.done[i] = true; progress(); }
    if (msg) el.fb.textContent = msg;
  }

  function progress() {
    const lis = el.steps.querySelectorAll('li');
    lis.forEach((li, i) => {
      const b = li.querySelector('button');
      li.classList.toggle('done', P.done[i]); li.classList.toggle('now', i === P.step);
      if (i === P.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.querySelector('span').textContent = L().names[STEPS[i]];
      b.querySelector('.sr').textContent = P.done[i] ? ' (' + L().done + ')' : '';
    });
    const n = P.done.filter(Boolean).length;
    el.bar.style.width = (n / 5 * 100) + '%';
    el.bar.parentElement.setAttribute('aria-valuenow', String(n));
    el.prog.textContent = L().progress(P.step + 1);
  }

  // what each step sets up and shows
  function render(focus) {
    const t = L(), id = STEPS[P.step];
    el.title.textContent = t.names[id];
    el.text.textContent = t.intro[id];
    el.actions.innerHTML = '';
    el.cue.textContent = '';
    el.tapZone.hidden = id !== 'find';
    app.noPeek(id === 'find');
    el.back.disabled = P.step === 0;
    el.next.textContent = P.step === 4 ? t.finish : t.next;
    const playing = app.playing();
    if (id === 'listen') {
      el.actions.append(btn(playing ? t.stop : t.start, () => toggle('listen'), 'primary', { id: 'prGo', 'aria-pressed': String(playing) }));
    } else if (id === 'find') {
      el.actions.append(btn(playing ? t.stop : t.start, () => toggle('find'), '', { id: 'prGo', 'aria-pressed': String(playing) }));
      tapTexts();
    } else if (id === 'watch') {
      el.actions.append(btn(playing ? t.pause : t.playSlow, () => toggle('watch'), 'primary', { id: 'prGo', 'aria-pressed': String(playing) }));
      const sbs = btn(S.stepMode ? t.nextCount : t.stepByStep, () => { if (!S.stepMode) { app.setStepMode(true); render(); } else app.stepOnce(1); }, '', { id: 'prStep' });
      el.actions.append(sbs);
      el.actions.append(roleSeg());
    } else if (id === 'along') {
      el.actions.append(btn(playing ? t.stop : t.startStep, () => toggle('along'), 'primary', { id: 'prGo', 'aria-pressed': String(playing) }));
      el.actions.append(roleSeg());
    } else if (id === 'speed') {
      const box = document.createElement('div'); box.className = 'tempo-row';
      box.append(btn('−10', () => bump(-10), '', { 'aria-label': '−10 BPM' }));
      const out = document.createElement('output'); out.id = 'prTempo'; out.textContent = t.tempoNow(S.bpm); box.append(out);
      box.append(btn('+10', () => bump(10), '', { 'aria-label': '+10 BPM' }));
      el.actions.append(box);
      const pre = document.createElement('div'); pre.className = 'seg'; pre.setAttribute('role', 'group'); pre.setAttribute('aria-label', 'BPM');
      for (const b of [110, 130, 150, 170, 190]) pre.append(btn(String(b), () => setBpm(b), '', { 'aria-pressed': String(S.bpm === b), 'data-bpm': String(b) }));
      el.actions.append(pre);
      el.actions.append(btn(playing ? t.stop : t.start, () => toggle('speed'), 'primary', { id: 'prGo', 'aria-pressed': String(playing) }));
    }
    progress();
    if (focus) { el.title.focus({ preventScroll: S.reduced }); el.announce.textContent = t.announce(P.step + 1, t.names[id]); }
  }

  function roleSeg() {
    const t = L(), wrap = document.createElement('div');
    wrap.className = 'seg'; wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', t.iDance);
    for (const r of ['leader', 'follower', 'both']) wrap.append(btn(t[r], () => { P.role = r; app.setRole(r); render(); }, '', { 'aria-pressed': String(P.role === r), 'data-prole': r }));
    return wrap;
  }

  function setBpm(b) {
    app.setTempo(b); app.saveTempo();
    const o = $('prTempo'); if (o) o.textContent = L().tempoNow(S.bpm);
    for (const x of el.actions.querySelectorAll('[data-bpm]')) x.setAttribute('aria-pressed', String(+x.dataset.bpm === S.bpm));
  }
  const bump = (d) => setBpm(S.bpm + d);

  // enter a step: stop whatever played, set the page up for it
  function go(i, focus = true) {
    if (app.playing()) app.stop();
    if (S.stepMode) app.setStepMode(false);
    P.step = Math.max(0, Math.min(4, i));
    const id = STEPS[P.step];
    app.lanes({});
    el.fb.textContent = '';
    if (id === 'listen' || id === 'find') { app.setSlow(false); app.setTempo(P.practiceBpm); app.setVoice(false); app.setLoop('all'); }
    if (id === 'watch') { app.load3d(); app.setSlow(true); app.setTempo(150); app.setVoice(false); app.setOverlays({ count: true, weight: true, rhythm: true, prints: true }); app.setRole(P.role); }
    if (id === 'along') { app.load3d(); app.setSlow(false); app.setTempo(P.alongBpm); app.setVoice(true); app.setRole(P.role); }
    if (id === 'speed') { app.load3d(); app.setSlow(false); app.setVoice(true); const saved = +(app.savedTempo || 0); app.setTempo(saved >= 60 ? saved : P.alongBpm + 20); }
    render(focus);
  }

  function toggle(id) {
    if (app.playing()) { app.stop(); return; }
    if (id === 'listen') { app.load3d(); app.lanes({ click: true }); P.heard = 0; }
    if (id === 'find') { app.lanes(P.level === 'guided' ? { click: true } : {}); }
    if (id === 'watch') { app.setStepMode(false); P.watched = 0; }
    if (id === 'along') { P.stepped = 0; }
    if (id === 'speed') { P.speedBeats = 0; app.saveTempo(); }
    app.jumpTo(0);
    app.start();
  }

  // ---------- Find the 1 (the Count Lab judge) ----------
  function tapTexts() {
    const t = L();
    $('tap').textContent = t.tap; $('calibrate').textContent = t.calibrate;
    for (const b of document.querySelectorAll('#levels button')) { b.textContent = t.levels[b.dataset.level]; b.setAttribute('aria-pressed', String(b.dataset.level === P.level)); }
    calText(); statsText();
  }
  function calText() {
    const t = L();
    $('calOut').textContent = P.cal ? t.calibrating + P.calTaps.length + '/8' : (P.offset ? t.calDone + fmtMs(P.offset) : t.calNone);
  }
  function statsText() {
    const t = L(), n = P.taps.length;
    $('tapStats').textContent = n ? t.stats(n, fmtMs(median(P.taps.filter((x) => x.v !== 'five' && x.v !== 'far').map((x) => x.ms))), P.taps.filter((x) => x.v === 'good').length, P.best) + ' · ' + t.streak(Math.min(3, P.streak)) : t.streak(0);
  }
  function plot() {
    const tg = $('target'); tg.querySelectorAll('.dot').forEach((d) => d.remove());
    for (const x of P.taps.slice(-12)) {
      const d = document.createElement('span'); d.className = 'dot' + (x.v === 'five' ? ' five' : x.v === 'good' ? ' good' : '');
      d.style.left = (50 + Math.max(-250, Math.min(250, x.ms)) / 5) + '%'; tg.appendChild(d);
    }
  }
  function verdict(key, ms) {
    const t = L(), v = $('verdict');
    v.className = 'verdict ' + (key === 'good' ? 'good' : key === 'five' ? 'five' : 'warn');
    v.textContent = t.v[key] + (ms !== null && key !== 'five' && key !== 'far' && key !== 'start' ? ' · ' + fmtMs(ms) : '');
  }
  function onTap(ev) {
    ev.preventDefault();
    const b = $('tap'); b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 90);
    if (!app.playing()) { app.lanes(P.cal ? { clickAll: true, bell: false, clave: false, conga: false, bass: false } : P.level === 'guided' ? { click: true } : {}); app.jumpTo(0); app.start(); verdict('start', null); return; }
    const p = app.tapPos(ev.timeStamp || performance.now());
    if (p === null) return;
    const beatMs = app.beatMs();
    if (P.cal) {
      P.calTaps.push(calTap(p, beatMs));
      if (P.calTaps.length >= 8) { P.offset = median(P.calTaps); P.cal = false; app.lanes(P.level === 'guided' ? { click: true } : {}); }
      calText(); return;
    }
    const r = judgeTap(p, beatMs, P.offset);
    P.taps.push(r); if (P.taps.length > 64) P.taps.shift();
    P.streak = r.v === 'good' ? P.streak + 1 : 0; P.best = Math.max(P.best, P.streak);
    verdict(r.v, r.ms); plot(); statsText();
    if (P.streak >= 3) markDone(1, L().found);
    return r;
  }
  $('tap').addEventListener('pointerdown', onTap);
  $('tap').addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) onTap(e); });
  $('tap').addEventListener('click', (e) => e.preventDefault());
  for (const b of document.querySelectorAll('#levels button')) b.addEventListener('click', () => {
    P.level = b.dataset.level; tapTexts();
    if (app.playing()) app.lanes(P.level === 'guided' ? { click: true } : {});
  });
  $('calibrate').addEventListener('click', () => {
    P.cal = true; P.calTaps = []; calText();
    app.lanes({ clickAll: true, bell: false, clave: false, conga: false, bass: false });
    if (!app.playing()) { app.jumpTo(0); app.start(); }
  });

  el.back.addEventListener('click', () => go(P.step - 1));
  el.next.addEventListener('click', () => { if (P.step === 4) { P.done = [false, false, false, false, false]; go(0); } else go(P.step + 1); });
  el.steps.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => go(i)));

  app.savedTempo = S.bpm !== 150 ? S.bpm : 0;
  go(0, false);

  return {
    i18n() { $('prH').textContent = L().title; el.steps.setAttribute('aria-label', L().stepsLabel); $('peekText').textContent = L().peek; render(false); },
    onPlay() { render(false); },
    // called on every new count shown (heard while playing, or stepped)
    onCount(k) {
      const id = STEPS[P.step];
      if (k === P.sawCount) return;
      P.sawCount = k;
      if (!app.playing() && !(id === 'watch' && S.stepMode)) return;
      if (id === 'listen') { P.heard++; el.cue.textContent = L().heard(Math.min(16, P.heard)); if (P.heard >= 16) markDone(0, L().listened); }
      if (id === 'watch') { P.watched++; el.cue.textContent = L().watched(Math.min(8, P.watched)); if (P.watched >= 8) markDone(2, L().watchedAll); }
      if (id === 'along') {
        P.stepped++;
        const Pt = app.PATTERNS[S.pattern], role = P.role === 'both' ? 'leader' : P.role;
        el.cue.textContent = Pt.steps[k] ? L().cueStep(k, app.describe(Pt, k, role, S.lang)) : L().cueHold(k);
        el.cue.classList.toggle('hold', !Pt.steps[k]);
        if (P.stepped >= 32) markDone(3, L().steppedAll);
      }
      if (id === 'speed') { P.speedBeats++; if (P.speedBeats >= 16) markDone(4, L().sped(S.bpm)); }
    },
    keys: () => ({ en: deepKeys(TXT.en), es: deepKeys(TXT.es) }),
    // render hooks only (demo video): set the flow's visible state frame by frame. Taps go through
    // the real judge; nothing here changes how the flow behaves for a person.
    demo(o) {
      if (o.step !== undefined && o.step !== P.step) go(o.step, false);
      if (o.done) for (const i of o.done) markDone(i);
      if (o.bpm) setBpm(o.bpm);
      if (o.go !== undefined) { const g = $('prGo'); if (g) { g.textContent = o.go; g.setAttribute('aria-pressed', 'true'); } }
      if (o.cue !== undefined) el.cue.textContent = o.cue;
      if (o.cueHold !== undefined) el.cue.classList.toggle('hold', o.cueHold);
      if (o.fb !== undefined) el.fb.textContent = o.fb;
      if (o.level) { P.level = o.level; tapTexts(); }
      if (o.tap) {
        const r = judgeTap(o.tap.p, o.tap.beatMs, 0);
        P.taps.push(r); P.streak = r.v === 'good' ? P.streak + 1 : 0; P.best = Math.max(P.best, P.streak);
        verdict(r.v, r.ms); plot(); statsText();
      }
      if (o.hit !== undefined) $('tap').classList.toggle('hit', o.hit);
      return { step: P.step, done: P.done.slice() };
    },
    state: () => ({ step: P.step, id: STEPS[P.step], done: P.done.slice(), heard: P.heard, watched: P.watched, stepped: P.stepped, taps: P.taps.slice(), streak: P.streak, offset: P.offset, level: P.level, bpm: S.bpm, slow: S.slow, voice: S.voice, stepMode: S.stepMode, noPeek: S.noPeek }),
    go, onTap,
  };
}
