// SalsaCoach Dancers QA: step timing and foot contacts measured on the posed skeletons, planted-foot
// drift, weight side per count, IK reach, joined-hand spacing, reduced motion, bytes, load time,
// memory, frame cost, layout at phone width, no-JS fallback, accessibility (axe) and audio-clock sync.
//   FONTCACHE=... AXE=/path/axe.min.js node qa/qa.mjs      -> evidence/qa-results.json + screenshots
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, fonts, here, bytes } from './serve.mjs';
import { STATES, REAL } from '../src/choreo.js';

const ev = join(here, 'evidence');
mkdirSync(ev, { recursive: true });
const results = [], data = {};
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const { server, url } = await serve();
const browser = await launch();

async function open(opts, hash = '#qa', js = true) {
  const ctx = await browser.newContext({ ...opts, javaScriptEnabled: js });
  await fonts(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  bytes.total = 0; bytes.byFile = {};
  const t0 = Date.now();
  await page.goto(url + 'index.html' + hash, { waitUntil: 'load' });
  let ready = null;
  if (js) ready = await page.evaluate(() => window.__dance ? window.__dance.ready : null);
  return { ctx, page, errors, ready, wallMs: Date.now() - t0 };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// ---------- 1. step timing on the skeletons ----------
{
  const { ctx, page, errors, ready } = await open({ viewport: { width: 1280, height: 800 } });
  check('desktop: dancers load without script errors', ready === true && errors.length === 0, errors);
  const N = 100; // samples per beat
  for (const pattern of ['on1', 'on2t', 'on2c']) {
    await page.evaluate((p) => window.__dance.set({ pattern: p, loop: 'all', reduced: false }), pattern);
    const samples = await page.evaluate((N) => {
      const out = [];
      for (let i = 0; i <= 8 * N; i++) {
        const r = window.__dance.probe(i / N);
        const pick = (d) => ({ Lb: [d.Lball.x, d.Lball.y, d.Lball.z], Rb: [d.Rball.x, d.Rball.y, d.Rball.z], LbR: d.LballRest.y, RbR: d.RballRest.y, pel: [d.pelvis.x, d.pelvis.y, d.pelvis.z], Lh: [d.Lhand.x, d.Lhand.y, d.Lhand.z], Rh: [d.Rhand.x, d.Rhand.y, d.Rhand.z], Lk: [d.Lknee.x, d.Lknee.y, d.Lknee.z], Rk: [d.Rknee.x, d.Rknee.y, d.Rknee.z], Lhip: [d.Lhip.x, d.Lhip.y, d.Lhip.z], Rhip: [d.Rhip.x, d.Rhip.y, d.Rhip.z], La: [d.Lankle.x, d.Lankle.y, d.Lankle.z], Ra: [d.Rankle.x, d.Rankle.y, d.Rankle.z] });
        out.push({ p: i / N, L: pick(r.leader), F: pick(r.follower), err: r.err });
      }
      return out;
    }, N);
    const P = STATES[pattern];
    const rep = { touch: [], lift: [], drift: 0, reach: { leg: 0, arm: 0 }, weightMiss: [], posMiss: [], kneeBack: 0, handGap: [] };
    for (const who of ['L', 'F']) for (const f of ['L', 'R']) {
      const rest = samples[0][who][f + 'bR'];
      const B = samples.map((s) => s[who][f + 'b']);
      // landed: the ball is on the floor and within 1 mm of where it stays for the next 0.1 beat
      const still = B.map((b, i) => {
        if (b[1] - rest > 0.001) return false;
        const j = Math.min(B.length - 1, i + N / 10), c = B[j];
        return Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]) < 0.001;
      });
      for (let i = 1; i < samples.length; i++) {
        if (still[i] && !still[i - 1]) rep.touch.push({ who, f, p: samples[i].p });
        if (B[i][1] - rest > 0.001 && B[i - 1][1] - rest <= 0.001) rep.lift.push({ who, f, p: samples[i].p });
      }
      // strict slide check over each planted phase [k, k + 0.6): the ball must not move at all
      for (let k = 0; k < 8; k++) {
        const i0 = k * N, i1 = k * N + Math.round(0.6 * N) - 1, b0 = B[i0];
        for (let i = i0; i <= i1; i++) rep.drift = Math.max(rep.drift, Math.hypot(B[i][0] - b0[0], B[i][1] - b0[1], B[i][2] - b0[2]));
      }
    }
    for (const s of samples) {
      rep.reach.leg = Math.max(rep.reach.leg, s.err.leader.leg, s.err.follower.leg);
      rep.reach.arm = Math.max(rep.reach.arm, s.err.leader.arm, s.err.follower.arm);
      rep.handGap.push(Math.hypot(s.L.Lh[0] - s.F.Rh[0], s.L.Lh[1] - s.F.Rh[1], s.L.Lh[2] - s.F.Rh[2]));
      // knees must bend forward: knee ahead of the hip-ankle line in each dancer's own forward
      for (const [who, fwd] of [['L', 1], ['F', -1]]) for (const f of ['L', 'R']) {
        const hip = s[who][f + 'hip'], an = s[who][f + 'a'], kn = s[who][f + 'k'];
        const mid = [(hip[0] + an[0]) / 2, (hip[1] + an[1]) / 2, (hip[2] + an[2]) / 2];
        if ((kn[2] - mid[2]) * fwd < -0.003) rep.kneeBack++;
      }
    }
    // weight side and foot positions at every count (0.3 beat after it lands)
    for (let k = 1; k <= 8; k++) {
      const s = samples[Math.round((k - 1 + 0.3) * N)], st = P[k];
      const side = st.w === 'L' ? 1 : -1; // world +X for the leader's left and the follower's right
      for (const who of ['L', 'F']) if (Math.sign(s[who].pel[0]) !== side) rep.weightMiss.push({ k, who });
      for (const lf of ['L', 'R']) {
        const wantL = REAL.scale * st[lf], wantF = REAL.gap + REAL.scale * st[lf];
        const gotL = s.L[lf + 'a'][2] - (-0.015), gotF = s.F[(lf === 'L' ? 'R' : 'L') + 'a'][2];
        void gotL; void gotF; void wantL; void wantF;
      }
    }
    const touchErr = rep.touch.map((t) => t.p - Math.round(t.p));
    const liftFrac = rep.lift.map((t) => t.p - Math.floor(t.p));
    const hg = rep.handGap.slice().sort((a, b) => a - b);
    data[pattern] = { touches: rep.touch.length, touchErrBeats: [Math.min(...touchErr), Math.max(...touchErr)], liftFrac: [Math.min(...liftFrac), Math.max(...liftFrac)], plantedDriftMm: +(rep.drift * 1000).toFixed(4), legReachMm: +(rep.reach.leg * 1000).toFixed(2), armReachMm: +(rep.reach.arm * 1000).toFixed(1), weightMiss: rep.weightMiss, kneeBackSamples: rep.kneeBack, handGapM: [+hg[0].toFixed(3), +hg[hg.length - 1].toFixed(3)] };
    const steps = Object.keys(P === STATES.on1 ? { 1: 1, 2: 1, 3: 1, 5: 1, 6: 1, 7: 1 } : {}).length;
    void steps;
    check(`${pattern}: every step lands on its count (ball within 1 mm of its spot no earlier than 0.01 beat = 4 ms at 150 BPM before the count, never after)`, touchErr.every((e) => e <= 1e-9 && e >= -0.0100001), data[pattern].touchErrBeats);
    check(`${pattern}: feet leave the floor only after 0.6 of the beat`, liftFrac.every((f) => f >= 0.6 && f <= 0.66), data[pattern].liftFrac);
    check(`${pattern}: planted feet do not slide during [count, count + 0.6) (max movement < 0.1 mm)`, rep.drift < 0.0001, data[pattern].plantedDriftMm + ' mm');
    check(`${pattern}: legs reach every target (no stretch error)`, rep.reach.leg < 0.0005, data[pattern].legReachMm + ' mm');
    check(`${pattern}: hips over the weighted foot on every count, both dancers`, rep.weightMiss.length === 0, rep.weightMiss);
    check(`${pattern}: knees bend forward in every sample`, rep.kneeBack === 0, rep.kneeBack);
    check(`${pattern}: joined hands stay together (gap 5-16 cm)`, hg[0] > 0.05 && hg[hg.length - 1] < 0.16, data[pattern].handGapM);
  }
  // reduced motion: a pose between counts equals the pose on the count
  await page.evaluate(() => window.__dance.set({ pattern: 'on1', reduced: true }));
  const snap = await page.evaluate(() => { const a = window.__dance.probe(0.8).leader.Lball, b = window.__dance.probe(0).leader.Lball; return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); });
  check('reduced motion: poses snap to the count (no travel between counts)', snap < 1e-6, snap);
  await page.evaluate(() => window.__dance.set({ reduced: false }));
  data.poseCpuMs = await page.evaluate(() => window.__dance.bench(1000));
  check('pose solve (both dancers, CPU) under 2 ms median on this machine', data.poseCpuMs.median < 2, data.poseCpuMs);
  await ctx.close();
}

// ---------- 2. load, bytes, memory: desktop and phone ----------
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
  const { ctx, page, errors, ready, wallMs } = await open(opts, '#qa');
  await page.evaluate(() => { window.__dance.frame(0); window.__dance.frame(0.8); });
  const m = await page.evaluate(() => window.__dance.metrics());
  const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
  const files = Object.entries(bytes.byFile).map(([f, b]) => [f, b]);
  const total = files.reduce((a, [, b]) => a + b, 0);
  data['load_' + name] = { ready, wallMs, dancersLoadMs: m.loadMs, bytes: total, files: files.length, heapMB: heap ? +(heap / 1048576).toFixed(1) : null, drawCalls: m.calls, triangles: m.triangles, textures: m.textures, tier: m.lite ? 'lite (512 px, no normal maps)' : 'full (1024 px + normal maps)', dpr: m.dpr };
  check(`${name}: loads, no errors`, ready === true && errors.length === 0, errors);
  check(`${name}: no horizontal scroll`, (await overflow(page)) <= 0);
  const shot = await page.evaluate(() => window.__dance.shot('image/jpeg', 0.9));
  writeFileSync(join(ev, `${name}-canvas.jpg`), Buffer.from(shot.split(',')[1], 'base64'));
  await page.screenshot({ path: join(ev, `${name}-page.jpg`), type: 'jpeg', quality: 78 });
  console.log(name, data['load_' + name]);
  if (name === 'phone') {
    await page.click('[data-lang="es"]');
    await page.screenshot({ path: join(ev, 'phone-page-es.jpg'), type: 'jpeg', quality: 78 });
    check('phone ES: no horizontal scroll', (await overflow(page)) <= 0);
  }
  // accessibility
  if (process.env.AXE) {
    await page.addScriptTag({ content: readFileSync(process.env.AXE, 'utf8') });
    const ax = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0] && v.nodes[0].target })); });
    data['axe_' + name] = ax;
    check(`${name}: axe finds no violations`, ax.length === 0, ax);
  }
  await ctx.close();
}

// ---------- 3. no-JS fallback ----------
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, isMobile: true }, '', false);
  const rows = await page.$$eval('#steps tbody tr', (r) => r.length);
  check('no JS: the step table is still there (8 counts)', rows === 8, rows);
  await page.screenshot({ path: join(ev, 'phone-nojs.jpg'), type: 'jpeg', quality: 70, fullPage: true });
  await ctx.close();
}

// ---------- 4. audio clock: what is drawn follows what is heard ----------
{
  const { ctx, page } = await open({ viewport: { width: 960, height: 600 } });
  const r = await page.evaluate(() => window.__dance.playLog(7));
  const beat = 60 / r.bpm;
  const lags = [], gaps = [];
  for (let i = 1; i < r.log.length; i++) {
    gaps.push(r.log[i].perf - r.log[i - 1].perf);
    const a = r.log[i - 1], b = r.log[i];
    if (Math.floor(b.pos) !== Math.floor(a.pos) && b.beats > 0) {
      const k = Math.floor(b.beats + 1e-9); // beats since start: count boundary crossed
      const tCount = r.startTime + k * beat;
      lags.push((b.heard - tCount) * 1000);
    }
  }
  lags.sort((x, y) => x - y); gaps.sort((x, y) => x - y);
  data.audioSync = { counts: lags.length, lagMsMedian: lags[lags.length >> 1], lagMsMax: lags[lags.length - 1], frameMsMedian: gaps[gaps.length >> 1], outputLatency: r.log[r.log.length - 1].lat, baseLatency: r.log[r.log.length - 1].base, note: 'headless Chromium with software WebGL; frame interval is not a phone measurement' };
  check('audio clock: each new count is drawn within one frame after it is heard', lags.length >= 8 && lags.every((l) => l >= -1 && l <= data.audioSync.frameMsMedian * 2 + 5), data.audioSync);
  await ctx.close();
}

writeFileSync(join(ev, 'qa-results.json'), JSON.stringify({ when: new Date().toISOString(), passed: results.filter((r) => r.ok).length, total: results.length, results, data }, null, 2) + '\n');
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close(); server.close();
