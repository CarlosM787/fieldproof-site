(function () {
  'use strict';
  /*__MODEL__*/

  // ---------- words ----------
  const STR = {
    en: {
      h1: 'See every step land. <em>Hear where the 1 lives.</em>',
      lede: "A leader and a follower dance the basic step on a shared floor while a synthesized salsa band plays underneath. Everything you see moves on the band's own clock: the foot lifts late in the beat and the weight lands on the count.",
      leader: 'Leader', follower: 'Follower', both: 'Both', hint: 'Drag the floor to turn the camera',
      tempo: 'Tempo', pattern: 'Step pattern', show: 'Show', loop: 'Loop', step: 'Step', mirror: 'Mirror', reduced: 'Reduced motion',
      play: 'Play', pause: 'Pause', prev: 'Previous count', next: 'Next count',
      view: { leader: 'Behind leader', follower: 'Behind follower', side: 'Side', top: 'Above' },
      names: { on1: 'On1', on2t: 'On2 · Torres count', on2c: 'On2 · 2-3-4 count' },
      rules: {
        on1: 'Steps 1-2-3 and 5-6-7, pause on 4 and 8. Breaks on 1 and 5.',
        on2t: 'Steps 1-2-3 and 5-6-7, pause on 4 and 8. Breaks on 2 and 6; 1 and 5 are small prep steps.',
        on2c: 'Steps 2-3-4 and 6-7-8, pause on 1 and 5. The count the SalsaCoach app scores. Break direction on 2 is disputed.',
      },
      lanes: { bell: 'Bell', clave: 'Clave', conga: 'Congas', bass: 'Bass' },
      count: 'Count', hold: 'hold',
      trainerTitle: 'Find the 1',
      trainerIntro: 'Tap on every 1 while the band plays. No sound in this band announces the 1: the clave stays silent there, so your ears have to find it from the bell and the congas.',
      levels: { guided: 'Click on the 1', band: 'Band only', nobell: 'No bell' },
      tap: 'Tap on the 1', calibrate: 'Calibrate', calibrating: 'Tap on every click · ', calDone: 'Calibration: ', calNone: 'Not calibrated',
      early: 'early', late: 'late',
      v: { good: 'On the 1', early: 'Early', late: 'Late', five: 'That was the 5', far: 'Keep listening', start: 'Band on. Tap on the next 1.' },
      stats: (n, med, on, streak) => n + ' taps · median ' + med + ' · ' + on + ' on the 1 · best streak ' + streak,
      half: 'Half-loop: the feet reset during the pause. Practice drill, not a real step.',
      liveCount: (k, l, f) => 'Count ' + k + '. Leader: ' + l + '. Follower: ' + f + '.',
      floor: (name) => name + ' dance floor, leader and follower facing each other',
    },
    es: {
      h1: 'Mira cada paso caer. <em>Escucha dónde vive el uno.</em>',
      lede: 'Un líder y un(a) seguidor(a) bailan el paso básico en el mismo piso mientras suena una banda de salsa sintetizada. Todo lo que ves se mueve con el reloj de la banda: el pie se levanta al final del tiempo y el peso cae en el conteo.',
      leader: 'Líder', follower: 'Seguidor(a)', both: 'Ambos', hint: 'Arrastra el piso para girar la cámara',
      tempo: 'Tempo', pattern: 'Patrón de pasos', show: 'Mostrar', loop: 'Repetir', step: 'Paso a paso', mirror: 'Espejo', reduced: 'Movimiento reducido',
      play: 'Reproducir', pause: 'Pausa', prev: 'Tiempo anterior', next: 'Tiempo siguiente',
      view: { leader: 'Detrás del líder', follower: 'Detrás del seguidor(a)', side: 'De lado', top: 'Desde arriba' },
      names: { on1: 'On1', on2t: 'On2 · conteo Torres', on2c: 'On2 · conteo 2-3-4' },
      rules: {
        on1: 'Pasos 1-2-3 y 5-6-7, pausa en 4 y 8. Breaks en 1 y 5.',
        on2t: 'Pasos 1-2-3 y 5-6-7, pausa en 4 y 8. Breaks en 2 y 6; el 1 y el 5 son pasos pequeños de preparación.',
        on2c: 'Pasos 2-3-4 y 6-7-8, pausa en 1 y 5. Es el conteo que califica la app SalsaCoach. La dirección del break en el 2 está en disputa.',
      },
      lanes: { bell: 'Campana', clave: 'Clave', conga: 'Congas', bass: 'Bajo' },
      count: 'Tiempo', hold: 'pausa',
      trainerTitle: 'Encuentra el uno',
      trainerIntro: 'Toca en cada uno mientras suena la banda. Ningún sonido de esta banda anuncia el uno: la clave se queda callada ahí, así que tu oído lo tiene que encontrar con la campana y las congas.',
      levels: { guided: 'Clic en el 1', band: 'Solo la banda', nobell: 'Sin campana' },
      tap: 'Toca en el 1', calibrate: 'Calibrar', calibrating: 'Toca en cada clic · ', calDone: 'Calibración: ', calNone: 'Sin calibrar',
      early: 'antes', late: 'tarde',
      v: { good: 'En el uno', early: 'Antes', late: 'Tarde', five: 'Ese fue el 5', far: 'Sigue escuchando', start: 'La banda ya suena. Toca en el próximo uno.' },
      stats: (n, med, on, streak) => n + ' toques · mediana ' + med + ' · ' + on + ' en el uno · mejor racha ' + streak,
      half: 'Medio ciclo: los pies se reacomodan durante la pausa. Es un ejercicio, no un paso real.',
      liveCount: (k, l, f) => 'Tiempo ' + k + '. Líder: ' + l + '. Seguidor(a): ' + f + '.',
      floor: (name) => 'Piso de baile ' + name + ', líder y seguidor(a) frente a frente',
    },
  };

  const $ = (id) => document.getElementById(id);
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const store = {
    get(k) { try { return localStorage.getItem('countlab.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('countlab.' + k, v); } catch (e) { /* storage blocked */ } },
  };

  const S = {
    lang: 'en', pattern: 'on1', role: 'both', view: 'leader', mirror: false, loop: 'all', bpm: 150,
    reduced: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches,
    playing: false, pos: 0, mute: { bell: false, clave: false, conga: false, bass: false },
  };
  const STATES = {};
  for (const id in PATTERNS) STATES[id] = states(PATTERNS[id]);

  // ---------- audio ----------
  let ctx = null, noiseBuf = null, bus = null, laneGain = {}, voices = null;
  let startTime = 0, nextTick = 0, timer = 0;
  const QA = location.hash === '#qa';
  const qa = QA ? (window.__qa = { flips: [], sched: [] }) : null;

  function makeVoices(ac, dest, noise) {
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
      return o;
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

  function makeNoise(ac) {
    const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0);
    let x = 12345;
    for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x3fffffff) - 1; }
    return b;
  }

  const LANE_LEVEL = { bell: 0.5, clave: 0.75, conga: 0.7, bass: 0.95, click: 0.6 };

  function ensureAudio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    noiseBuf = makeNoise(ctx);
    return ctx;
  }

  function laneOn(k) {
    if (k === 'click') return trainer.level === 'guided' || trainer.cal;
    if (trainer.cal) return false;
    if (k === 'bell' && trainer.level === 'nobell') return false;
    return !S.mute[k];
  }

  function buildBus() {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.15;
    bus = ctx.createGain(); bus.gain.value = 0.85;
    bus.connect(comp); comp.connect(ctx.destination);
    laneGain = {};
    for (const k of ['bell', 'clave', 'conga', 'bass', 'click']) {
      const g = ctx.createGain(); g.gain.value = laneOn(k) ? LANE_LEVEL[k] : 0; g.connect(bus); laneGain[k] = g;
    }
    voices = makeVoices(ctx, laneGain, noiseBuf);
  }

  function applyMutes() {
    if (!ctx || !laneGain.bell) return;
    for (const k in laneGain) laneGain[k].gain.setTargetAtTime(laneOn(k) ? LANE_LEVEL[k] : 0, ctx.currentTime, 0.015);
  }

  const half = () => 30 / S.bpm; // seconds per eighth note
  const windowOff = () => (S.loop === 'second' ? 4 : 0);
  const windowLen = () => (S.loop === 'all' ? 8 : 4);
  // absolute beats since startTime -> position in the 8-count cycle
  const posFrom = (b) => windowOff() + mod(b, windowLen());
  const slotOf = (tick) => (S.loop === 'all' ? mod(tick, 16) : windowOff() * 2 + mod(tick, 8));

  function playSlot(voice, s, t, len, only) {
    const on = (k) => !only || only[k];
    const bell = BAND.bell[s]; if (bell && on('bell')) voice.bell(t, bell === 'm');
    if (BAND.clave[s] && on('clave')) voice.clave(t);
    const cg = BAND.conga[s]; if (cg && on('conga')) voice.conga(t, cg);
    const bs = BAND.bass[s]; if (bs && on('bass')) voice.bass(t, bs[0], bs[1] * len);
    if (only) { if (s === 0 && only.click) voice.click(t, true); return; }
    if (s % 2 === 0 && trainer.cal) voice.click(t, s === 0);
    else if (s === 0) voice.click(t, true);
  }

  function schedule() {
    const until = ctx.currentTime + 0.12;
    while (startTime + nextTick * half() < until) {
      const t = startTime + nextTick * half(), s = slotOf(nextTick);
      playSlot(voices, s, t, 60 / S.bpm);
      if (qa && s % 2 === 0) qa.sched.push({ count: s / 2 + 1, t: t });
      nextTick++;
    }
  }

  function heardAt(perf) {
    if (ctx.getOutputTimestamp) {
      const o = ctx.getOutputTimestamp();
      if (o && o.contextTime > 0 && o.performanceTime > 0) return o.contextTime + (perf - o.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || 0) - (performance.now() - perf) / 1000;
  }

  function start() {
    ensureAudio();
    if (ctx.state === 'suspended') ctx.resume();
    buildBus();
    const lead = 0.12, b = S.pos - windowOff();
    startTime = ctx.currentTime + lead - b * 60 / S.bpm;
    nextTick = Math.ceil(b * 2 - 1e-6);
    S.playing = true;
    schedule();
    timer = setInterval(schedule, 25);
    setPlayUI();
    loop();
  }

  function stop() {
    if (!S.playing) return;
    clearInterval(timer);
    S.pos = currentPos();
    S.playing = false;
    const old = bus; old.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    setTimeout(() => { try { old.disconnect(); } catch (e) { /* gone */ } }, 300);
    setPlayUI();
    S.pos = Math.floor(S.pos) % 8; // settle on a whole count
    render();
  }

  function retime(newBpm) {
    if (S.playing) {
      const tNext = startTime + nextTick * half();
      S.bpm = newBpm;
      startTime = tNext - nextTick * half();
    } else S.bpm = newBpm;
  }

  function currentPos() {
    if (!S.playing || !ctx) return S.pos;
    const b = (heardAt(performance.now()) - startTime) * S.bpm / 60;
    return b < 0 ? S.pos : posFrom(b);
  }

  // ---------- pose on the audio clock ----------
  const G = GEOM;
  function poseAt(p) {
    const P = STATES[S.pattern];
    const k = Math.floor(p) % 8 + 1, frac = p - Math.floor(p);
    let next = k % 8 + 1, reset = false;
    if (S.loop !== 'all') {
      const first = windowOff() + 1, last = windowOff() + 4;
      if (k === last) { next = first; reset = true; }
    }
    const A = P[k], Bn = P[next];
    const discrete = S.reduced;
    if (reset) {
      const R0 = P[first0()];
      if (discrete || frac < 0.15) return pose(A, A, 0, false);
      if (frac < 0.55) return pose(A, R0, ease((frac - 0.15) / 0.4), true);
      if (frac < 0.6) return pose(R0, R0, 0, false);
      return pose(R0, Bn, ease((frac - 0.6) / 0.4), false);
    }
    if (discrete || frac < 0.6) return pose(A, A, 0, false);
    return pose(A, Bn, ease((frac - 0.6) / 0.4), false);
  }
  function first0() { return S.loop === 'second' ? 4 : 8; }
  function pose(A, B, u, ghost) {
    const moving = Math.abs(A.L - B.L) > 1e-6 ? 'L' : (Math.abs(A.R - B.R) > 1e-6 ? 'R' : null);
    const lift = moving && !ghost ? Math.sin(Math.PI * u) * 0.07 : 0;
    const wy = (st, f) => st[f];
    const comA = { x: A.w === 'L' ? -G.hip : G.hip, y: wy(A, A.w) };
    const comB = { x: B.w === 'L' ? -G.hip : G.hip, y: wy(B, B.w) };
    return {
      L: { y: lerp(A.L, B.L, u), z: moving === 'L' ? lift : 0 },
      R: { y: lerp(A.R, B.R, u), z: moving === 'R' ? lift : 0 },
      w: u < 0.5 ? A.w : B.w,
      com: { x: lerp(comA.x, comB.x, u), y: lerp(comA.y, comB.y, u) },
      moving: moving, u: u, ghost: ghost, from: A, to: B,
    };
  }

  // ---------- 3D floor ----------
  const cv = $('floor'), g2 = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  const cam = { yaw: 0.35, pitch: 0.36, dist: 4.4 }, camGoal = { yaw: 0.35, pitch: 0.36 };
  const PRESET = { leader: [0.35, 0.36], follower: [Math.PI + 0.35, 0.36], side: [Math.PI / 2, 0.16], top: [0.001, 1.5] };
  const TGT = [0, G.gap / 2, 0.72];
  let K = null;

  function sizeCanvas() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width * DPR)); H = Math.max(1, Math.round(r.height * DPR));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function camera() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const pos = [TGT[0] + cam.dist * sy * cp, TGT[1] - cam.dist * cy * cp, TGT[2] + cam.dist * sp];
    const f = norm(sub(TGT, pos)), r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
    const focal = Math.min(W * 1.05, H * 1.9);
    K = { pos, f, r, u, focal, cx: W / 2, cy: H * 0.53 };
  }
  function P3(p) {
    const d = sub(p, K.pos), z = dot(d, K.f), s = K.focal / Math.max(z, 0.08);
    let x = K.cx + dot(d, K.r) * s;
    if (S.mirror) x = 2 * K.cx - x;
    return [x, K.cy - dot(d, K.u) * s, z];
  }
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const COL = {};
  function colors() { for (const n of ['leader', 'follower', 'line', 'text', 'muted', 'faint', 'bell', 'clave']) COL[n] = css('--' + n); }
  function rgba(hex, a) {
    const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // shoe outline in foot space: t from heel (0) to toe (1)
  const SHOE = (function () {
    const pts = [], N = 12, len = 0.27, heel = -0.1;
    const hw = (t) => t < 0.12 ? 0.036 * Math.sqrt(t / 0.12) : t < 0.45 ? lerp(0.036, 0.03, (t - 0.12) / 0.33) : t < 0.76 ? lerp(0.03, 0.046, (t - 0.45) / 0.31) : 0.046 * Math.sqrt(Math.max(0, 1 - (t - 0.76) / 0.24));
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push([hw(t), heel + t * len]); }
    for (let i = N; i >= 0; i--) { const t = i / N; pts.push([-hw(t), heel + t * len]); }
    return pts;
  })();

  function dancers(ps) {
    // world placement of both dancers; follower feet mirror the leader's on the same world side
    const list = [];
    const addDancer = (role) => {
      const lead = role === 'leader';
      const base = lead ? 0 : G.gap, fwd = lead ? 1 : -1, right = lead ? 1 : -1;
      const feet = {};
      for (const f of ['L', 'R']) {
        const side = f === 'L' ? -1 : 1; // leader-frame side
        const own = lead ? f : (f === 'L' ? 'R' : 'L');
        feet[own] = { x: side * G.hip, y: base + ps[f].y, z: ps[f].z, weighted: ps.w === f, moving: ps.moving === f, lead: f };
      }
      list.push({ role, base, fwd, right, feet, com: { x: ps.com.x, y: base + ps.com.y } });
    };
    if (S.role !== 'follower') addDancer('leader');
    if (S.role !== 'leader') addDancer('follower');
    return list;
  }

  function drawFloor() {
    g2.lineWidth = Math.max(1, DPR * 0.8);
    for (let x = -1.5; x <= 1.501; x += 0.25) line3([x, -1.1, 0], [x, 2.05, 0], Math.abs(x) < 1e-6 ? 0.34 : 0.13);
    for (let y = -1.1; y <= 2.051; y += 0.25) line3([-1.5, y, 0], [1.5, y, 0], 0.13);
    // home marks
    for (const y of [0, G.gap]) { line3([-0.06, y, 0], [0.06, y, 0], 0.5); line3([0, y - 0.06, 0], [0, y + 0.06, 0], 0.5); }
  }
  function line3(a, b, alpha) {
    const A = P3(a), B = P3(b);
    if (A[2] < 0.1 || B[2] < 0.1) return;
    g2.strokeStyle = rgba('#5a73ad', Math.min(1, alpha * 1.6));
    g2.beginPath(); g2.moveTo(A[0], A[1]); g2.lineTo(B[0], B[1]); g2.stroke();
  }

  function shoePath(ft, fwd, z) {
    g2.beginPath();
    SHOE.forEach((p, i) => {
      const wx = ft.x + p[0] * fwd, wy = ft.y + p[1] * fwd;
      const q = P3([wx, wy, z]);
      if (i) g2.lineTo(q[0], q[1]); else g2.moveTo(q[0], q[1]);
    });
    g2.closePath();
  }

  function drawDancer(d, ps) {
    const col = d.role === 'leader' ? COL.leader : COL.follower;
    const ghost = ps.ghost;
    // shadows + shoes
    for (const f of ['L', 'R']) {
      const ft = d.feet[f];
      if (ft.z > 0.002) { shoePath(ft, d.fwd, 0); g2.fillStyle = 'rgba(0,0,0,0.35)'; g2.fill(); }
      shoePath(ft, d.fwd, ft.z);
      if (ft.weighted && !ghost) {
        const q = P3([ft.x, ft.y, 0]);
        const gr = g2.createRadialGradient(q[0], q[1], 0, q[0], q[1], 40 * DPR);
        gr.addColorStop(0, rgba(col, 0.95)); gr.addColorStop(1, rgba(col, 0.55));
        g2.fillStyle = gr; g2.fill();
      } else { g2.fillStyle = rgba(col, ghost ? 0.06 : 0.12); g2.fill(); }
      g2.lineWidth = 2 * DPR; g2.strokeStyle = rgba(col, ghost ? 0.4 : 0.95);
      if (ghost) g2.setLineDash([4 * DPR, 4 * DPR]);
      g2.stroke(); g2.setLineDash([]);
      // foot letter at the heel
      const hq = P3([ft.x, ft.y - 0.15 * d.fwd, 0]);
      g2.fillStyle = rgba(col, 0.9); g2.font = '600 ' + Math.round(11 * DPR) + 'px ' + (css('--mono') || 'monospace');
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText(f, hq[0], hq[1]);
    }
    // weight ring under the hips
    ring([d.com.x, d.com.y, 0], 0.07, rgba(col, 0.9));
    // skeleton
    const lat = d.right; // world x of the dancer's right
    const pel = [lerp(0, d.com.x, 0.65), d.com.y, 0.93];
    const hipR = [pel[0] + 0.1 * lat, pel[1], pel[2]], hipL = [pel[0] - 0.1 * lat, pel[1], pel[2]];
    const chest = [pel[0] * 0.85, pel[1], 1.34], head = [chest[0], chest[1], 1.56];
    const bones = [[hipL, hipR], [pel, chest], [[chest[0] - 0.18 * lat, chest[1], 1.37], [chest[0] + 0.18 * lat, chest[1], 1.37]]];
    for (const f of ['L', 'R']) {
      const ft = d.feet[f], hip = f === 'R' ? hipR : hipL;
      const ank = [ft.x, ft.y - 0.05 * d.fwd, 0.08 + ft.z];
      const knee = ik(hip, ank, [0, d.fwd, 0]);
      bones.push([hip, knee], [knee, ank]);
    }
    g2.strokeStyle = rgba(col, ghost ? 0.35 : 0.8); g2.lineWidth = 2.2 * DPR; g2.lineCap = 'round';
    for (const b of bones) { const a = P3(b[0]), c = P3(b[1]); g2.beginPath(); g2.moveTo(a[0], a[1]); g2.lineTo(c[0], c[1]); g2.stroke(); }
    // plumb line from the hips to the weight ring
    const a = P3(pel), c = P3([d.com.x, d.com.y, 0]);
    g2.setLineDash([3 * DPR, 5 * DPR]); g2.lineWidth = 1.2 * DPR; g2.strokeStyle = rgba(col, 0.6);
    g2.beginPath(); g2.moveTo(a[0], a[1]); g2.lineTo(c[0], c[1]); g2.stroke(); g2.setLineDash([]);
    const hq = P3(head), hr = Math.max(4, 0.09 * K.focal / Math.max(hq[2], 0.1));
    g2.beginPath(); g2.arc(hq[0], hq[1], hr, 0, Math.PI * 2); g2.stroke();
    g2.fillStyle = rgba(col, 0.95);
    for (const j of [pel, hipL, hipR, chest]) { const q = P3(j); g2.beginPath(); g2.arc(q[0], q[1], 2.6 * DPR, 0, Math.PI * 2); g2.fill(); }
  }
  function ik(hip, ank, fwd) {
    const L1 = 0.46, dv = sub(ank, hip), d = Math.hypot(dv[0], dv[1], dv[2]), dir = [dv[0] / d, dv[1] / d, dv[2] / d];
    const mid = [hip[0] + dv[0] / 2, hip[1] + dv[1] / 2, hip[2] + dv[2] / 2];
    if (d >= 2 * L1) return mid;
    const h = Math.sqrt(L1 * L1 - (d / 2) * (d / 2)), k = dot(fwd, dir);
    const n = norm([fwd[0] - k * dir[0], fwd[1] - k * dir[1], fwd[2] - k * dir[2]]);
    return [mid[0] + n[0] * h, mid[1] + n[1] * h, mid[2] + n[2] * h];
  }
  function ring(c, r, col) {
    g2.beginPath();
    for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2, q = P3([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]]); if (i) g2.lineTo(q[0], q[1]); else g2.moveTo(q[0], q[1]); }
    g2.lineWidth = 2 * DPR; g2.strokeStyle = col; g2.stroke();
  }
  function arrows(ps, list) {
    // a floor arrow for a break while the foot travels and for half a beat after it lands
    const P = PATTERNS[S.pattern];
    const k = Math.floor(currentShown) % 8 + 1, frac = currentShown - Math.floor(currentShown);
    let from = null, to = null, alpha = 0, foot = null;
    let nextK = k % 8 + 1;
    if (S.loop !== 'all' && k === windowOff() + 4) nextK = windowOff() + 1;
    if (ps.moving && P.steps[nextK] && P.steps[nextK][2] === 'break' && !ps.ghost) {
      foot = ps.moving; from = ps.from[foot]; to = ps.to[foot]; alpha = 0.9;
    } else if (P.steps[k] && P.steps[k][2] === 'break' && frac < 0.5 && !S.reduced) {
      foot = P.steps[k][0]; const prev = STATES[S.pattern][k - 1]; from = prev[foot]; to = STATES[S.pattern][k][foot]; alpha = 0.9 * (1 - frac * 2);
    } else if (S.reduced && P.steps[k] && P.steps[k][2] === 'break') {
      foot = P.steps[k][0]; from = STATES[S.pattern][k - 1][foot]; to = STATES[S.pattern][k][foot]; alpha = 0.9;
    }
    if (!foot) return;
    for (const d of list) {
      const col = d.role === 'leader' ? COL.leader : COL.follower;
      const x = (foot === 'L' ? -1 : 1) * G.hip + (foot === 'L' ? -0.09 : 0.09);
      const a = P3([x, d.base + from, 0.005]), b = P3([x, d.base + to, 0.005]);
      g2.strokeStyle = rgba(col, alpha); g2.lineWidth = 3 * DPR; g2.beginPath(); g2.moveTo(a[0], a[1]); g2.lineTo(b[0], b[1]); g2.stroke();
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 9 * DPR;
      g2.fillStyle = rgba(col, alpha); g2.beginPath(); g2.moveTo(b[0], b[1]);
      g2.lineTo(b[0] - s * Math.cos(ang - 0.45), b[1] - s * Math.sin(ang - 0.45));
      g2.lineTo(b[0] - s * Math.cos(ang + 0.45), b[1] - s * Math.sin(ang + 0.45)); g2.closePath(); g2.fill();
    }
  }

  let currentShown = 0;
  function draw(p) {
    sizeCanvas(); camera();
    g2.clearRect(0, 0, W, H);
    drawFloor();
    const ps = poseAt(p);
    const list = dancers(ps);
    arrows(ps, list);
    list.sort((a, b) => P3([0, b.base, 0.9])[2] - P3([0, a.base, 0.9])[2]);
    for (const d of list) drawDancer(d, ps);
  }

  // ---------- strip, lanes, labels ----------
  const grid = $('grid');
  const laneRows = {};
  let countCells = [], slotCols = [];
  function buildGrid() {
    grid.textContent = '';
    countCells = []; slotCols = Array.from({ length: 16 }, () => []);
    const lab = document.createElement('div'); lab.className = 'lbl'; lab.id = 'lbl-count'; grid.appendChild(lab);
    for (let k = 1; k <= 8; k++) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'count'; b.id = 'count-' + k;
      b.addEventListener('click', () => jumpTo(k - 1));
      grid.appendChild(b); countCells.push(b);
    }
    for (const lane of LANES) {
      const lb = document.createElement('div'); lb.className = 'lbl';
      const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'lane-btn'; bt.id = 'lane-' + lane;
      bt.setAttribute('aria-pressed', String(!S.mute[lane]));
      const dotEl = document.createElement('i'); dotEl.style.background = 'var(--' + lane + ')';
      const t = document.createElement('span'); bt.append(dotEl, t);
      bt.addEventListener('click', () => { S.mute[lane] = !S.mute[lane]; applyMutes(); refreshLanes(); });
      lb.appendChild(bt); grid.appendChild(lb);
      const row = [];
      for (let s = 0; s < 16; s++) {
        const c = document.createElement('div'); c.className = 'cell' + (s % 2 === 0 ? ' beat' : '');
        const hit = BAND[lane][s];
        if (hit) { const d = document.createElement('span'); d.className = 'd' + (hit === 'm' || hit === 'open' || lane === 'clave' || lane === 'bass' ? ' big' : ''); d.style.background = 'var(--' + lane + ')'; c.appendChild(d); }
        grid.appendChild(c); row.push(c); slotCols[s].push(c);
      }
      laneRows[lane] = { btn: bt, cells: row };
    }
    refreshGrid();
  }
  function glyph(role, k) {
    const P = PATTERNS[S.pattern], st = P.steps[k];
    if (!st) return '—';
    const s = STATES[S.pattern], dy = st[1] - s[k - 1][st[0]];
    const f = role === 'follower' ? (st[0] === 'L' ? 'R' : 'L') : st[0];
    const fwd = role === 'follower' ? dy < 0 : dy > 0;
    const arrow = st[2] === 'replace' ? '•' : st[2] === 'close' ? (fwd ? '↑' : '↓') + '|' : (fwd ? '↑' : '↓');
    return f + ' ' + arrow;
  }
  function refreshGrid() {
    const T = STR[S.lang], P = PATTERNS[S.pattern];
    $('lbl-count').textContent = T.count;
    countCells.forEach((b, i) => {
      const k = i + 1;
      const isHold = P.holds.includes(k), isBrk = P.breaks.includes(k);
      b.className = 'count' + (isHold ? ' hold' : '') + (isBrk ? ' brk' : '');
      let html = '<span class="n">' + k + '</span>';
      if (S.role !== 'follower') html += '<span class="g l">' + (isHold ? T.hold : glyph('leader', k)) + '</span>';
      if (S.role !== 'leader') html += '<span class="g f">' + (isHold ? T.hold : glyph('follower', k)) + '</span>';
      b.innerHTML = html;
      b.setAttribute('aria-label', T.count + ' ' + k + '. ' + (isHold ? T.hold : T.leader + ': ' + describe(P, k, 'leader', S.lang) + '. ' + T.follower + ': ' + describe(P, k, 'follower', S.lang)));
    });
    refreshLanes();
    lastCount = -1; lastSlot = -1;
    markNow(currentShown);
  }
  function refreshLanes() {
    const T = STR[S.lang];
    for (const lane of LANES) {
      const r = laneRows[lane]; if (!r) continue;
      const on = laneOn(lane);
      r.btn.setAttribute('aria-pressed', String(!S.mute[lane]));
      r.btn.querySelector('span').textContent = T.lanes[lane];
      r.cells.forEach((c) => { c.style.opacity = on ? '' : '0.35'; });
    }
  }
  let lastCount = -1, lastSlot = -1;
  function markNow(p) {
    const k = Math.floor(p) % 8, slot = Math.floor(p * 2) % 16;
    if (k !== lastCount) {
      if (countCells[lastCount]) countCells[lastCount].classList.remove('now');
      if (countCells[k]) countCells[k].classList.add('now');
      lastCount = k;
      const big = $('count-big'), T = STR[S.lang], held = PATTERNS[S.pattern].holds.includes(k + 1);
      big.innerHTML = (k + 1) + (held ? '<small>' + T.hold + '</small>' : '');
      if (qa && S.playing) qa.flips.push({ count: k + 1, heard: heardAt(performance.now()), perf: performance.now() });
    }
    if (slot !== lastSlot) {
      if (slotCols[lastSlot]) slotCols[lastSlot].forEach((c) => c.classList.remove('now'));
      if (S.playing && slotCols[slot]) slotCols[slot].forEach((c) => c.classList.add('now'));
      lastSlot = slot;
    }
  }

  // ---------- render loop ----------
  let raf = 0, dragging = false;
  function render() {
    const p = currentShown = currentPos();
    const shown = S.reduced ? Math.floor(p) : p;
    draw(shown);
    markNow(p);
  }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      stepCamera();
      render();
      if (S.playing || dragging || camMoving()) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function camMoving() { return Math.abs(cam.yaw - camGoal.yaw) > 0.002 || Math.abs(cam.pitch - camGoal.pitch) > 0.002; }
  function stepCamera() {
    if (dragging) return;
    if (S.reduced) { cam.yaw = camGoal.yaw; cam.pitch = camGoal.pitch; return; }
    cam.yaw += (camGoal.yaw - cam.yaw) * 0.14; cam.pitch += (camGoal.pitch - cam.pitch) * 0.14;
  }

  // ---------- controls ----------
  function setPlayUI() {
    const T = STR[S.lang];
    $('play').setAttribute('aria-label', S.playing ? T.pause : T.play);
    $('play-icon').setAttribute('d', S.playing ? 'M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z' : 'M7 4.5v15l13-7.5z');
  }
  function jumpTo(k) {
    const was = S.playing;
    if (was) { clearInterval(timer); S.playing = false; const old = bus; old.gain.setTargetAtTime(0, ctx.currentTime, 0.01); setTimeout(() => { try { old.disconnect(); } catch (e) { /* gone */ } }, 300); }
    S.pos = mod(k, 8);
    if (S.loop !== 'all' && (S.pos < windowOff() || S.pos >= windowOff() + 4)) S.pos = windowOff();
    if (was) start(); else { render(); announce(); }
  }
  function announce() {
    const T = STR[S.lang], P = PATTERNS[S.pattern], k = Math.floor(S.pos) % 8 + 1;
    $('live').textContent = T.liveCount(k, describe(P, k, 'leader', S.lang), describe(P, k, 'follower', S.lang));
  }
  function setView(v) {
    S.view = v; [camGoal.yaw, camGoal.pitch] = PRESET[v];
    // turn the short way round
    while (camGoal.yaw - cam.yaw > Math.PI) camGoal.yaw -= 2 * Math.PI;
    while (camGoal.yaw - cam.yaw < -Math.PI) camGoal.yaw += 2 * Math.PI;
    document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    loop();
  }
  function applyLang(l) {
    S.lang = l; store.set('lang', l);
    document.documentElement.lang = l;
    const T = STR[l];
    document.querySelectorAll('[data-i18n]').forEach((el) => { const v = T[el.dataset.i18n]; if (typeof v === 'string') el.textContent = v; });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = T[el.dataset.i18nHtml]; });
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    for (const v in T.view) $('view-' + v).textContent = T.view[v];
    for (const o of $('pattern').options) o.textContent = T.names[o.value];
    const roleSel = $('role'); roleSel.options[0].textContent = T.both; roleSel.options[1].textContent = T.leader; roleSel.options[2].textContent = T.follower;
    for (const b of document.querySelectorAll('#levels button')) b.textContent = T.levels[b.dataset.level];
    $('tap').textContent = T.tap; $('calibrate').textContent = T.calibrate;
    $('prev').setAttribute('aria-label', T.prev); $('next').setAttribute('aria-label', T.next);
    const en = document.querySelector('[data-lang-block="en"]'), es = document.querySelector('[data-lang-block="es"]');
    en.hidden = l !== 'en'; es.hidden = l !== 'es'; if (l === 'es') es.open = true;
    badge(); refreshGrid(); setPlayUI(); calText(); statsText(); render();
  }
  function badge() {
    const T = STR[S.lang];
    $('badge-name').textContent = T.names[S.pattern];
    $('badge-rule').textContent = T.rules[S.pattern] + (S.loop !== 'all' ? ' ' + T.half : '');
    cv.setAttribute('aria-label', T.floor(T.names[S.pattern]));
  }

  // orbit by drag or arrow keys
  let lastX = 0, lastY = 0;
  cv.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; cv.setPointerCapture(e.pointerId); loop(); });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    cam.yaw += (S.mirror ? -1 : 1) * dx * 0.009; cam.pitch = clamp(cam.pitch + dy * 0.006, 0.06, 1.52);
    camGoal.yaw = cam.yaw; camGoal.pitch = cam.pitch;
  });
  const endDrag = () => { dragging = false; document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-pressed', 'false')); };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('keydown', (e) => {
    const m = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
    if (!m) return;
    e.preventDefault(); camGoal.yaw += m[0]; camGoal.pitch = clamp(camGoal.pitch + m[1], 0.06, 1.52); loop();
  });

  $('play').addEventListener('click', () => (S.playing ? stop() : start()));
  $('bpm').addEventListener('input', (e) => { retime(+e.target.value); $('bpm-out').textContent = S.bpm + ' BPM'; store.set('bpm', S.bpm); });
  $('pattern').addEventListener('change', (e) => { S.pattern = e.target.value; badge(); refreshGrid(); render(); if (!S.playing) announce(); });
  $('role').addEventListener('change', (e) => { S.role = e.target.value; refreshGrid(); render(); });
  $('loop').addEventListener('change', (e) => { S.loop = e.target.value; badge(); jumpTo(windowOff()); });
  $('prev').addEventListener('click', () => jumpTo(Math.floor(currentPos()) - 1));
  $('next').addEventListener('click', () => jumpTo(Math.floor(currentPos()) + 1));
  $('mirror').addEventListener('change', (e) => { S.mirror = e.target.checked; render(); });
  $('reduced').addEventListener('change', (e) => { S.reduced = e.target.checked; render(); });
  document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea, #tap')) return;
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); S.playing ? stop() : start(); }
  });

  // ---------- Find the 1 ----------
  const trainer = { level: 'guided', taps: [], streak: 0, best: 0, offset: +(store.get('offset') || 0) || 0, cal: false, calTaps: [] };
  function median(a) { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
  const fmt = (ms) => (ms > 0 ? '+' : ms < 0 ? '−' : '') + Math.abs(Math.round(ms)) + ' ms';
  function calText() {
    const T = STR[S.lang];
    $('cal-out').textContent = trainer.cal ? T.calibrating + trainer.calTaps.length + '/8' : (store.get('offset') !== null ? T.calDone + fmt(trainer.offset) : T.calNone);
  }
  function statsText() {
    const T = STR[S.lang], n = trainer.taps.length;
    if (!n) { $('stats').textContent = ''; return; }
    const on = trainer.taps.filter((t) => t.v === 'good').length;
    const med = median(trainer.taps.filter((t) => t.v !== 'five' && t.v !== 'far').map((t) => t.ms));
    $('stats').textContent = T.stats(n, fmt(med), on, trainer.best);
  }
  function plotTaps() {
    const tg = $('target'); tg.textContent = '';
    for (const t of trainer.taps.slice(-12)) {
      const d = document.createElement('span'); d.className = 'dot' + (t.v === 'five' ? ' five' : '');
      d.style.left = (50 + clamp(t.ms, -250, 250) / 5) + '%'; tg.appendChild(d);
    }
  }
  function verdict(key, ms) {
    const T = STR[S.lang], el = $('verdict');
    el.className = 'verdict ' + (key === 'good' ? 'good' : key === 'five' ? 'five' : 'warn');
    el.textContent = T.v[key] + (ms !== null && key !== 'five' && key !== 'far' && key !== 'start' ? ' · ' + fmt(ms) : '');
  }
  function onTap(ev) {
    ev.preventDefault();
    const btn = $('tap'); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 90);
    if (!S.playing) {
      if (S.loop !== 'all') { S.loop = 'all'; $('loop').value = 'all'; badge(); }
      S.pos = 0; start(); verdict('start', null); return;
    }
    const h = heardAt(ev.timeStamp || performance.now());
    const b = (h - startTime) * S.bpm / 60, p = posFrom(b), beatMs = 60000 / S.bpm;
    if (trainer.cal) {
      const near = Math.round(p); trainer.calTaps.push((p - near) * beatMs);
      if (trainer.calTaps.length >= 8) {
        trainer.offset = median(trainer.calTaps); trainer.cal = false; store.set('offset', String(Math.round(trainer.offset)));
        applyMutes(); refreshLanes();
      }
      calText(); return;
    }
    if (S.loop !== 'all') { S.loop = 'all'; $('loop').value = 'all'; badge(); }
    const d1 = (mod(p + 4, 8) - 4) * beatMs - trainer.offset;
    const d5 = (p - 4) * beatMs - trainer.offset;
    let v;
    if (Math.abs(d5) < Math.abs(d1) && Math.abs(d5) <= 150) v = 'five';
    else if (Math.abs(d1) <= 110) v = 'good';
    else if (Math.abs(d1) <= 450) v = d1 < 0 ? 'early' : 'late';
    else v = 'far';
    trainer.taps.push({ ms: v === 'five' ? d5 : d1, v });
    if (trainer.taps.length > 64) trainer.taps.shift();
    trainer.streak = v === 'good' ? trainer.streak + 1 : 0; trainer.best = Math.max(trainer.best, trainer.streak);
    verdict(v, v === 'five' ? d5 : d1); plotTaps(); statsText();
  }
  $('tap').addEventListener('pointerdown', onTap);
  $('tap').addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) onTap(e); });
  $('tap').addEventListener('click', (e) => e.preventDefault());
  document.querySelectorAll('#levels button').forEach((b) => b.addEventListener('click', () => {
    trainer.level = b.dataset.level;
    document.querySelectorAll('#levels button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    applyMutes(); refreshLanes();
  }));
  $('calibrate').addEventListener('click', () => {
    trainer.cal = true; trainer.calTaps = []; applyMutes(); refreshLanes(); calText();
    if (!S.playing) { S.pos = 0; start(); }
  });

  // ---------- video render hooks (only with #render) ----------
  if (location.hash === '#render') {
    window.__render = {
      set(o) { Object.assign(S, o.state || {}); Object.assign(cam, o.cam || {}); Object.assign(camGoal, o.cam || {}); if (o.lang) applyLang(o.lang); badge(); refreshGrid(); },
      cam(yaw, pitch) { cam.yaw = camGoal.yaw = yaw; cam.pitch = camGoal.pitch = pitch; },
      canvas(bg) {
        const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
        const c = o.getContext('2d'), gr = c.createRadialGradient(o.width / 2, o.height, 0, o.width / 2, o.height, o.height * 1.2);
        gr.addColorStop(0, '#14203d'); gr.addColorStop(0.6, bg || '#0d1427'); c.fillStyle = gr; c.fillRect(0, 0, o.width, o.height);
        c.drawImage(cv, 0, 0); return o.toDataURL('image/jpeg', 0.92);
      },
      frame(p) { S.playing = false; S.pos = p; currentShown = p; draw(S.reduced ? Math.floor(p) : p); lastCount = -1; lastSlot = -1; markNow(p); for (const c of slotCols.flat()) c.classList.remove('now'); const sl = Math.floor(p * 2) % 16; slotCols[sl].forEach((c) => c.classList.add('now')); return true; },
      async audio(beats, bpm, sr, sections) {
        const rate = sr || 44100, secs = beats * 60 / bpm + 1.2;
        const off = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
        const comp = off.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.15; comp.connect(off.destination);
        const busO = off.createGain(); busO.gain.value = 0.85; busO.connect(comp);
        const lanes = {}; for (const k of ['bell', 'clave', 'conga', 'bass', 'click']) { const gg = off.createGain(); gg.gain.value = sections ? LANE_LEVEL[k] : (k === 'click' ? 0 : (S.mute[k] ? 0 : LANE_LEVEL[k])); gg.connect(busO); lanes[k] = gg; }
        const v = makeVoices(off, lanes, makeNoise(off)), hb = 30 / bpm;
        // sections[m] = { bell, clave, conga, bass, click } for measure m (8 counts = 16 slots)
        for (let i = 0; i < beats * 2; i++) playSlot(v, i % 16, 0.1 + i * hb, 60 / bpm, sections ? (sections[Math.floor(i / 16)] || sections[sections.length - 1]) : undefined);
        const buf = await off.startRendering();
        const ch = [buf.getChannelData(0), buf.getChannelData(1)], n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4));
        const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
        out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
        for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, clamp(ch[c][i], -1, 1) * 32767, true);
        const bytes = new Uint8Array(out.buffer); let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      },
    };
  }

  // ---------- boot ----------
  colors();
  const savedLang = store.get('lang');
  const savedBpm = +store.get('bpm');
  if (savedBpm >= 90 && savedBpm <= 220) { S.bpm = savedBpm; $('bpm').value = savedBpm; $('bpm-out').textContent = savedBpm + ' BPM'; }
  $('reduced').checked = S.reduced;
  buildGrid();
  applyLang(savedLang === 'es' || (!savedLang && (navigator.language || '').toLowerCase().startsWith('es')) ? 'es' : 'en');
  setView('leader'); cam.yaw = camGoal.yaw; cam.pitch = camGoal.pitch;
  if (window.ResizeObserver) new ResizeObserver(() => render()).observe(cv); else window.addEventListener('resize', render);
  render();
  calText();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.playing) loop(); });
})();
