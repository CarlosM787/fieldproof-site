// Phase-three QA: the new features. Called from qa/qa.mjs after the 33 phase-two checks, with the
// same browser, server and check() function. Every check here is additive; none relaxes an old one.
import { readFileSync, existsSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fingerprint } from './engine.mjs';
import { judgeTap } from '../src/judge.js';
import { STATES } from '../src/choreo.js';
import { PATTERNS } from '../../salsacoach-count-lab/src/model.js';
import { rhythmWord } from '../src/rhythm.js';

const PHASE2_ENGINE = '8f1df7be36200e16cff89ab84c4be17c954b59c228046876205c0b10afd99b38';
const mod = (a, n) => ((a % n) + n) % n;

export async function phaseThree({ browser, url, check, data, open, overflow, ev, here, serveDir, fonts, bytes }) {
  // ---------- A. the count engine is untouched ----------
  {
    const fp = fingerprint(readFileSync(join(here, 'src/choreo.js'), 'utf8'));
    data.engine = fp;
    check('count engine unchanged: beatState and its timing helpers are byte-identical to phase two (sha256 over 21 parts)', fp.ok && fp.hash === PHASE2_ENGINE, fp.hash);
  }
  // ---------- B. Find the 1 is the Count Lab judge ----------
  {
    const src = readFileSync(join(here, '..', 'salsacoach-count-lab', 'src', 'app.js'), 'utf8');
    const m = src.match(/const d1 = \(mod\(p \+ 4, 8\) - 4\) \* beatMs - trainer\.offset;[\s\S]*?else v = 'far';/);
    let same = 0, n = 0, first = null;
    if (m) {
      // eslint-disable-next-line no-new-func
      const lab = new Function('p', 'beatMs', 'trainer', 'mod', m[0] + '\nreturn { v, ms: v === "five" ? d5 : d1 };');
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (; n < 10000; n++) {
        const p = rnd() * 8, beatMs = 60000 / (90 + rnd() * 130), off = (rnd() - 0.5) * 160;
        const a = lab(p, beatMs, { offset: off }, mod), b = judgeTap(p, beatMs, off);
        if (a.v === b.v && Math.abs(a.ms - b.ms) < 1e-9) same++; else if (!first) first = { p, beatMs, off, a, b };
      }
    }
    data.judge = { extracted: !!m, taps: n, identical: same, first };
    check('Find the 1: the tap judge gives the Count Lab verdict on 10,000 random taps (code taken from count-lab/src/app.js)', !!m && same === n && n === 10000, { identical: same, of: n });
  }

  // ---------- C. realism, overlays, slow motion, step mode (desktop page) ----------
  {
    const { ctx, page, errors, ready } = await open({ viewport: { width: 1280, height: 800 } });
    const N = 50;
    const real = {};
    for (const pattern of ['on1', 'on2t', 'on2c']) {
      await page.evaluate((p) => window.__dance.set({ pattern: p, loop: 'all', reduced: false, ov: { count: true, weight: true, rhythm: true, prints: true } }), pattern);
      const s = await page.evaluate((N) => {
        const out = [];
        for (let i = 0; i <= 8 * N; i++) {
          const r = window.__dance.probe(i / N);
          const pick = (d, t) => ({ tipY: [d.LtoeTip.y - d.LtoeTipRest.y, d.RtoeTip.y - d.RtoeTipRest.y], ballUp: [d.Lball.y - d.LballRest.y, d.Rball.y - d.RballRest.y], pel: d.pelvis.x, roll: [t.feet.L.roll, t.feet.R.roll], w: [t.feet.L.weighted, t.feet.R.weighted], pitch: [t.feet.L.pitch, t.feet.R.pitch], settle: t.body.settle });
          out.push({ p: i / N, k: r.k, frac: r.frac, travel: r.travel, L: pick(r.leader, r.targets.leader), F: pick(r.follower, r.targets.follower), badges: r.badges, dots: r.dots });
        }
        return out;
      }, N);
      const P = STATES[pattern];
      const rep = { tipBelowMm: 0, tipLiftWhileDownMm: 0, rollMax: 0, rollWeighted: 0, hipMiss: [], badgeMiss: [], dotMiss: [], settleRange: [9, -9] };
      for (const x of s) {
        for (const who of ['L', 'F']) {
          const d = x[who];
          for (const f of [0, 1]) {
            rep.tipBelowMm = Math.max(rep.tipBelowMm, -d.tipY[f] * 1000);
            if (d.ballUp[f] < 0.0005) rep.tipLiftWhileDownMm = Math.max(rep.tipLiftWhileDownMm, Math.abs(d.tipY[f]) * 1000);
            rep.rollMax = Math.max(rep.rollMax, Math.abs(d.roll[f]));
            if (d.w[f]) rep.rollWeighted = Math.max(rep.rollWeighted, Math.abs(d.roll[f]));
          }
          rep.settleRange = [Math.min(rep.settleRange[0], d.settle), Math.max(rep.settleRange[1], d.settle)];
        }
        // hips over the weighted foot through the whole planted part of every count (not only at +0.3)
        if (x.frac >= 0.02 && x.frac < 0.6) {
          const st = P[x.k], side = st.w === 'L' ? 1 : -1;
          for (const who of ['L', 'F']) if (Math.sign(x[who].pel) !== side) rep.hipMiss.push({ p: x.p, who });
          // the weight dot sits on the weighted side too
          for (const r of ['leader', 'follower']) if (Math.sign(x.dots[r].x) !== side) rep.dotMiss.push({ p: x.p, r });
        }
        // count badges: from lift-off, the landing spot shows the count it lands on
        const nk = x.k % 8 + 1, Pt = PATTERNS[pattern];
        const nextMoves = Pt.steps[nk] || (P[x.k].w !== P[nk].w);
        if (x.travel && nextMoves && x.frac >= 0.66) for (const r of ['leader', 'follower']) if (!x.badges[r + 'next'].v || x.badges[r + 'next'].n !== String(nk)) rep.badgeMiss.push({ p: x.p, r, got: x.badges[r + 'next'] });
        if (!x.travel && x.frac < 0.5 && Pt.steps[x.k]) for (const r of ['leader', 'follower']) if (!x.badges[r + 'now'].v || x.badges[r + 'now'].n !== String(x.k)) rep.badgeMiss.push({ p: x.p, r, now: x.badges[r + 'now'] });
      }
      real[pattern] = { tipBelowMm: +rep.tipBelowMm.toFixed(3), tipLiftWhileDownMm: +rep.tipLiftWhileDownMm.toFixed(3), rollMaxDeg: +(rep.rollMax * 180 / Math.PI).toFixed(2), rollWeightedDeg: +(rep.rollWeighted * 180 / Math.PI).toFixed(3), hipMiss: rep.hipMiss.length, dotMiss: rep.dotMiss.length, badgeMiss: rep.badgeMiss.slice(0, 3), badgeMissN: rep.badgeMiss.length, settle: rep.settleRange.map((v) => +v.toFixed(3)) };
    }
    data.realism = real;
    const all = (f) => ['on1', 'on2t', 'on2c'].every((p) => f(real[p]));
    check('foot plant: toe tips never go below the floor (all patterns, both dancers, 50 samples per beat)', all((r) => r.tipBelowMm <= 1), Object.fromEntries(Object.entries(real).map(([k, r]) => [k, r.tipBelowMm + ' mm'])));
    check('foot plant: toes stay flat on the floor while the ball is down (toe-off only after the ball lifts)', all((r) => r.tipLiftWhileDownMm <= 0.5), Object.fromEntries(Object.entries(real).map(([k, r]) => [k, r.tipLiftWhileDownMm + ' mm'])));
    check('ankle roll is subtle (at most 3°) and never on the weighted foot', all((r) => r.rollMaxDeg <= 3 && r.rollWeightedDeg === 0), Object.fromEntries(Object.entries(real).map(([k, r]) => [k, [r.rollMaxDeg, r.rollWeightedDeg]])));
    check('hip settle: hips stay over the weighted foot through the whole planted part of every count', all((r) => r.hipMiss === 0), Object.fromEntries(Object.entries(real).map(([k, r]) => [k, r.hipMiss])));
    check('weight indicator: the centre-of-weight dot sits on the weighted side through every planted phase', all((r) => r.dotMiss === 0), Object.fromEntries(Object.entries(real).map(([k, r]) => [k, r.dotMiss])));
    check('count numbers: from lift-off the landing spot shows the count it lands on; after landing the foot shows its count', all((r) => r.badgeMissN === 0), Object.fromEntries(Object.entries(real).map(([k, r]) => [k, r.badgeMissN ? r.badgeMiss : 0])));

    // contact shadows: darker under the weighted planted foot than under a lifted one
    await page.evaluate(() => window.__dance.set({ pattern: 'on1', loop: 'all' }));
    const sh = await page.evaluate(() => { window.__dance.frame(0.3); const a = window.__dance.shadows(); window.__dance.frame(7.8); const b = window.__dance.shadows(); return { planted: a, lifting: b }; });
    data.shadows = sh;
    // at 0.3 the leader stands on L (weighted, flat); at 7.8 his L is in the air on its way to count 1
    check('contact shadow: darkest under the weighted flat foot, faint under a foot in the air', sh.planted.leader.L >= 0.55 && sh.lifting.leader.L < 0.35, { weightedFlat: sh.planted.leader.L, inAir: sh.lifting.leader.L });

    // overlays toggle off and on
    const tog = await page.evaluate(async () => {
      const d = window.__dance, out = {};
      const snap = () => { const r = d.probe(0.8); return { badge: r.badges.leadernext.v, dot: r.dots.leader.v, rhythm: !d.rhythmWord().hidden }; };
      out.on = snap();
      for (const k of ['count', 'weight', 'rhythm', 'prints']) document.getElementById('ov-' + k).click();
      out.off = snap();
      out.offShot = d.shot('image/jpeg', 0.8).length;
      for (const k of ['count', 'weight', 'rhythm', 'prints']) document.getElementById('ov-' + k).click();
      out.again = snap();
      return out;
    });
    data.overlayToggle = tog;
    check('teaching overlays toggle: count numbers, weight dot, quick-quick-slow and footprints switch off and back on', tog.on.badge && tog.on.dot && tog.on.rhythm && !tog.off.badge && !tog.off.dot && !tog.off.rhythm && tog.again.badge && tog.again.dot && tog.again.rhythm, tog);

    // quick-quick-slow words for every count of every pattern
    const words = {};
    let wordMiss = 0;
    for (const pattern of ['on1', 'on2t', 'on2c']) {
      await page.evaluate((p) => window.__dance.set({ pattern: p }), pattern);
      words[pattern] = [];
      for (let k = 1; k <= 8; k++) {
        const w = await page.evaluate((k) => { window.__dance.frame(k - 1 + 0.2); return window.__dance.rhythmWord().word; }, k);
        words[pattern].push(w[0].toUpperCase());
        if (w !== rhythmWord(PATTERNS[pattern], k)) wordMiss++;
      }
      words[pattern] = words[pattern].join('');
    }
    data.rhythmWords = words;
    check('quick-quick-slow captions follow the step table (On1 QQSH QQSH; 2-3-4 count HQQS HQQS)', wordMiss === 0 && words.on1 === 'QQSHQQSH' && words.on2c === 'HQQSHQQS', words);
    await page.evaluate(() => window.__dance.set({ pattern: 'on1' }));

    // slow motion: the band runs at half tempo and the drawn pose is still the heard position
    const sl = await page.evaluate(() => window.__dance.playLog(30, { slow: true, minCounts: 6 }));
    const beat = 60 / sl.bpm, lags = [], gaps = [];
    let posErr = 0;
    for (let i = 1; i < sl.log.length; i++) {
      const a = sl.log[i - 1], b = sl.log[i], gap = b.perf - a.perf;
      gaps.push(gap);
      if (b.beats > 0) posErr = Math.max(posErr, Math.abs(b.pos - mod((b.heard - sl.startTime) * sl.bpm / 60, 8)));
      if (Math.floor(b.pos) !== Math.floor(a.pos) && b.beats > 0) lags.push({ lag: (b.heard - (sl.startTime + Math.floor(b.beats + 1e-9) * beat)) * 1000, gap });
    }
    gaps.sort((x, y) => x - y);
    data.slowMotion = { bandBpm: sl.bpm, counts: lags.length, posErrBeats: posErr, lagMsMax: Math.max(...lags.map((l) => l.lag)), withinOwnFrame: lags.every((l) => l.lag >= -1 && l.lag <= l.gap + 5), frameMsMedian: gaps[gaps.length >> 1] };
    // pos and heard are read with two performance.now() calls a few microseconds apart, so allow 0.002 beat (1.6 ms)
    check('slow motion ½×: the band plays at half tempo (150 -> 75 BPM) and each drawn pose is the heard position within 0.002 beat (steps land on the count)', sl.bpm === 75 && lags.length >= 5 && posErr < 0.002, data.slowMotion);
    check('slow motion ½×: each new count is drawn on the first frame after it is heard', data.slowMotion.withinOwnFrame, data.slowMotion);

    // step by step: one press = one count, animated on the audio clock, landing when its cue sounds
    const st = await page.evaluate(() => window.__dance.stepLog());
    const mono = st.log.every((x, i) => i === 0 || x.pos >= st.log[i - 1].pos - 1e-9 || (x.done && x.pos === st.to)); // the last entry may wrap 8 -> 1
    const doneAt = st.log.find((x) => x.done);
    data.stepMode = { from: st.from, to: st.to, final: st.pos, frames: st.log.length, monotonic: mono, doneHeardMinusLand: doneAt ? +((doneAt.heard - st.tLand) * 1000).toFixed(1) : null, beat: st.beat };
    check('step by step: one press advances exactly one count, animated forward and finishing when its cue is heard', st.pos === st.to && st.to === (st.from + 1) % 8 && mono && doneAt && doneAt.heard >= st.tLand - 0.001, data.stepMode);
    const keys = await page.evaluate(async () => {
      const d = window.__dance, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      d.set({ stepMode: true, reduced: false });
      const p0 = d.state().pos;
      document.body.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      for (let i = 0; i < 200 && d.tick(); i++) await wait(30);
      const p1 = d.state().pos;
      const c = document.getElementById('stage'), r = c.getBoundingClientRect();
      const o = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, bubbles: true };
      c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o));
      await wait(20);
      for (let i = 0; i < 200 && d.tick(); i++) await wait(30);
      const p2 = d.state().pos;
      d.set({ stepMode: false });
      return { p0, p1, p2 };
    });
    data.stepKeys = keys;
    check('step by step: the → key and a tap on the dancers each advance one count', keys.p1 === (keys.p0 + 1) % 8 && keys.p2 === (keys.p1 + 1) % 8, keys);

    // reduced motion, new features: step snaps (no animation), no "next" badge travel, no flash
    const red = await page.evaluate(() => {
      const d = window.__dance;
      d.set({ reduced: true, stepMode: true });
      const before = d.state().pos;
      document.getElementById('play').click();
      const s1 = d.state();
      const r = d.probe(0.8);
      const anim = getComputedStyle(document.getElementById('countBig')).animationName;
      d.set({ reduced: false, stepMode: false });
      return { before, after: s1.pos, anim: s1.stepAnim, nextBadge: r.badges.leadernext.v, flash: anim };
    });
    data.reducedNew = red;
    check('reduced motion: step by step snaps to the next count, no travelling badge, no count flash', red.after === (red.before + 1) % 8 && red.anim === null && !red.nextBadge && (red.flash === 'none' || red.flash === ''), red);
    check('phase-three page loads with no script errors (desktop)', ready === true && errors.length === 0, errors);
    await ctx.close();
  }

  // ---------- D. count voice: each word lands on its beat (offline render) ----------
  {
    const { ctx, page } = await open({ viewport: { width: 800, height: 600 } });
    const res = {};
    for (const lang of ['en', 'es']) for (const bpm of [100, 150, 200]) {
      const b64 = await page.evaluate(({ lang, bpm }) => window.__dance.audio(9, bpm, 48000, 'all', -1, { band: false, voice: lang, pattern: 'on1', voiceGain: 1 }), { lang, bpm });
      const buf = Buffer.from(b64, 'base64'), sr = 48000, n = (buf.length - 44) / 4;
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(44 + i * 4) / 32768;
      // envelope: rectified, 2 ms hop, 10 ms window
      const hop = 96, env = [];
      for (let i = 0; i + 480 < n; i += hop) { let e = 0; for (let j = 0; j < 480; j++) e += x[i + j] * x[i + j]; env.push(Math.sqrt(e / 480)); }
      const beat = 60 / bpm, offs = [];
      for (let k = 0; k < 8; k++) {
        const t = (k + 1) * beat; // beat k (count k+1) at t: the render starts one beat early
        const a = Math.max(0, Math.floor((t - 0.35 * beat) / (hop / sr))), b = Math.min(env.length - 1, Math.floor((t + 0.45 * beat) / (hop / sr)));
        let mx = 0; for (let i = a; i <= b; i++) mx = Math.max(mx, env[i]);
        // the vowel onset: the first point after which the level stays above 40% of the word's peak for 25 ms
        let on = null;
        for (let i = a; i <= b; i++) { let ok = true; for (let j = 0; j < 12 && i + j <= b; j++) if (env[i + j] < 0.4 * mx) { ok = false; break; } if (ok) { on = i; break; } }
        offs.push(on === null ? null : +(((on * hop + 240) / sr - t) * 1000).toFixed(1));
      }
      res[lang + bpm] = offs;
    }
    data.voiceOnsetsMs = res;
    const flat = Object.values(res).flat();
    check('count voice: every word (EN and ES, 100/150/200 BPM) reaches full level within 60 ms of its beat (offline render; a person must still judge the sound)', flat.every((o) => o !== null && o >= -60 && o <= 60), { worstMs: Math.max(...flat.map((o) => Math.abs(o))) });
    await ctx.close();
  }

  // ---------- E. practice page ----------
  {
    // E1. the 3D loads only when the viewer acts
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await fonts(ctx);
    const page = await ctx.newPage();
    const req = [];
    page.on('request', (r) => req.push(r.url()));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    bytes.total = 0; bytes.byFile = {};
    await page.goto(url + 'practice.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const before = req.filter((u) => /\.(glb|webp)(\?|$)/.test(u)).length;
    const firstLoad = Object.values(bytes.byFile).reduce((a, b) => a + b, 0);
    const hasGlBefore = await page.evaluate(() => document.body.classList.contains('has3d'));
    await page.click('#prGo');
    await page.waitForFunction(() => document.body.classList.contains('has3d'), null, { timeout: 60000 });
    const after = req.filter((u) => /\.(glb|webp)(\?|$)/.test(u)).length;
    data.practiceLazy = { requestsBefore: before, requestsAfterStart: after, firstLoadBytes: firstLoad, errors };
    check('practice page: no 3D is downloaded until the viewer presses Start; then the dancers load', before === 0 && !hasGlBefore && after >= 8 && errors.length === 0, data.practiceLazy);
    // E2. progress indicator and step navigation
    const prog = await page.evaluate(() => {
      const lis = [...document.querySelectorAll('#prSteps li')];
      return { n: lis.length, current: lis.findIndex((l) => l.querySelector('button').getAttribute('aria-current') === 'step'), text: document.getElementById('prProg').textContent, value: document.querySelector('.prog .bar').getAttribute('aria-valuenow') };
    });
    await page.click('#prGo'); // stop
    await page.click('#prNext');
    const prog2 = await page.evaluate(() => ({ current: [...document.querySelectorAll('#prSteps li')].findIndex((l) => l.querySelector('button').getAttribute('aria-current') === 'step'), text: document.getElementById('prProg').textContent, focus: document.activeElement && document.activeElement.id, tap: !document.getElementById('tapZone').hidden, peek: document.body.classList.contains('nopeek') }));
    data.practiceProgress = { prog, prog2 };
    check('practice flow: five steps, progress shows "Step 1 of 5" then "Step 2 of 5", aria-current moves, focus goes to the step title', prog.n === 5 && prog.current === 0 && prog.text === 'Step 1 of 5' && prog2.current === 1 && prog2.text === 'Step 2 of 5' && prog2.focus === 'prTitle', data.practiceProgress);
    check('practice flow, Find the 1: the counts are hidden (listen by ear) and the tap pad is shown', prog2.tap && prog2.peek, prog2);
    await ctx.close();
  }
  {
    // E3. Find the 1 through the real judge; steps 3-5 set up slow motion, voice and tempo; storage
    const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 } }, '#qa', true, 'practice.html');
    const r = await page.evaluate(async () => {
      const d = window.__dance, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const out = {};
      d.practiceGo(1);
      document.getElementById('prGo').click(); // band on
      await wait(300);
      const b = d.band();
      // taps exactly on the next three 1s (beats 8, 16, 24 of this playback), then one on a 5
      const v = [];
      for (const beat of [8, 16, 24]) v.push(d.practiceTapAt(beat));
      v.push(d.practiceTapAt(28));
      v.push(d.practiceTapAt(32 + 0.3));
      out.verdicts = v.map((x) => x && x.v);
      out.ms = v.map((x) => x && Math.round(x.ms));
      out.after = d.practice();
      out.guidedClick = b.lanes.click === true;
      document.getElementById('prGo').click();
      // step 3: watch slowly
      out.watch = d.practiceGo(2);
      out.watchState = d.state();
      // step 4: step along with the voice
      out.along = d.practiceGo(3);
      out.alongState = { voice: d.state().voice, slow: d.state().slow, bpm: d.state().bpm };
      // step 5: speed up; tempo buttons save the last tempo
      out.speed = d.practiceGo(4);
      [...document.querySelectorAll('#prActions [data-bpm]')].find((x) => x.dataset.bpm === '170').click();
      out.speedBpm = d.state().bpm;
      out.storage = Object.keys(localStorage);
      out.stored = localStorage.getItem('salsacoach.dancers.tempo');
      return out;
    });
    data.practiceFlow = r;
    check('practice flow, Find the 1: taps on the 1 score "On the 1" (Count Lab judge), a tap on the 5 scores "That was the 5", three in a row complete the step', r.verdicts.slice(0, 3).every((v) => v === 'good') && r.verdicts[3] === 'five' && r.verdicts[4] !== 'good' && r.after.done[1] === true && r.guidedClick, { verdicts: r.verdicts, ms: r.ms, done: r.after.done });
    check('practice flow, Watch slowly: half speed, overlays on; Step along: count voice on at full speed', r.watchState.slow === true && r.watchState.ov.count && r.watchState.ov.weight && r.watchState.ov.rhythm && r.alongState.voice === true && r.alongState.slow === false, { watch: { slow: r.watchState.slow, ov: r.watchState.ov, effBpm: r.watchState.effBpm }, along: r.alongState });
    check('practice flow, Speed up: tempo buttons work and the last tempo is the only thing stored (localStorage)', r.speedBpm === 170 && r.stored === '170' && r.storage.length === 1 && r.storage[0] === 'salsacoach.dancers.tempo', { bpm: r.speedBpm, keys: r.storage });
    // reload: the stored tempo comes back on the Speed up step
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => window.__dance.ready);
    const back = await page.evaluate(() => { window.__dance.practiceGo(4); return window.__dance.state().bpm; });
    check('practice flow: the last tempo comes back after a reload (Speed up step)', back === 170, back);
    const keys = await page.evaluate(() => window.__dance.i18nKeys());
    const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
    const enP = keys.practice.en, esP = keys.practice.es;
    check('EN/ES: every page string and every practice string exists in both languages', same(keys.en.slice().sort(), keys.es.slice().sort()) && same(enP, esP), { page: [keys.en.length, keys.es.length], practice: [enP.length, esP.length] });
    check('practice page loads with no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // E4. blocked storage is harmless
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await ctx.addInitScript(() => { const boom = () => { throw new Error('storage blocked'); }; Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(url + 'practice.html#qa', { waitUntil: 'load' });
    const ok = await page.evaluate(async () => { await window.__dance.ready; window.__dance.practiceGo(4); document.querySelector('#prActions [data-bpm="130"]').click(); return window.__dance.state().bpm; });
    check('storage blocked: the practice page still works (every storage call is wrapped in try/catch)', ok === 130 && errors.length === 0, { bpm: ok, errors });
    await ctx.close();
  }
  {
    // E5. keyboard: Tab reaches the flow's controls; Enter and Space operate them
    const { ctx, page } = await open({ viewport: { width: 1280, height: 900 } }, '#qa', true, 'practice.html');
    const kb = await page.evaluate(() => { window.__dance.practiceGo(1); return true; });
    void kb;
    await page.focus('#tap');
    await page.keyboard.press('Space'); // first press starts the band, like the Count Lab
    await page.waitForTimeout(400);
    const playing = await page.evaluate(() => window.__dance.state().playing);
    await page.keyboard.press('Space');
    const verdict = await page.evaluate(() => document.getElementById('verdict').textContent);
    await page.evaluate(() => document.getElementById('prGo').click());
    await page.focus('#prNext');
    await page.keyboard.press('Enter');
    const step = await page.evaluate(() => window.__dance.practice().step);
    data.keyboard = { playing, verdict, step };
    check('keyboard: Space on the tap pad starts the band and then taps; Enter on "Next step" moves on', playing === true && verdict.length > 0 && step === 2, data.keyboard);
    await ctx.close();
  }
  // E6. accessibility and layout of the practice page, EN and ES, phone and desktop
  for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
    for (const lang of ['en', 'es']) {
      const { ctx, page } = await open(opts, '#qa', true, 'practice.html' + (lang === 'es' ? '?lang=es' : ''));
      await page.evaluate(() => { window.__dance.practiceGo(1); });
      const ov = await overflow(page);
      const htmlLang = await page.evaluate(() => document.documentElement.lang);
      let ax = [];
      if (process.env.AXE) {
        await page.addScriptTag({ content: readFileSync(process.env.AXE, 'utf8') });
        ax = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0] && v.nodes[0].target })); });
      }
      await page.screenshot({ path: join(ev, `practice-${name}-${lang}.jpg`), type: 'jpeg', quality: 72, fullPage: name === 'phone', scale: 'css' });
      data[`practice_${name}_${lang}`] = { overflow: ov, lang: htmlLang, axe: ax, axeRan: !!process.env.AXE }; // fails without AXE: an axe check that never ran must not pass
      check(`practice page ${name} ${lang.toUpperCase()}: no horizontal scroll, lang="${lang}", axe finds no violations`, ov <= 0 && htmlLang === lang && !!process.env.AXE && ax.length === 0, data[`practice_${name}_${lang}`]);
      await ctx.close();
    }
  }

  // ---------- F. weight and speed budgets ----------
  check('phone first load at most 1.2 MB (explore page, phone tier, same method as phase two)', data.load_phone && data.load_phone.bytes <= 1200000, data.load_phone && data.load_phone.bytes);
  check('pose solve well under 1 ms (median under 0.25 ms, p95 under 0.5 ms, both dancers)', data.poseCpuMs.median < 0.25 && data.poseCpuMs.p95 < 0.5, data.poseCpuMs);

  // ---------- G. hero media and the homepage banner ----------
  const site = join(here, 'dist', 'site');
  const B = join(site, 'banner');
  if (existsSync(B)) {
    const sz = (f) => (existsSync(join(B, f)) ? statSync(join(B, f)).size : null);
    const w = { posterWebp: sz('hero-poster.webp'), posterAvif: sz('hero-poster.avif'), loopWebm: sz('hero-loop.webm'), loopMp4: sz('hero-loop.mp4'), html: sz('banner.html'), css: sz('banner.css'), js: sz('banner.js') };
    const meta = existsSync(join(B, 'media.json')) ? JSON.parse(readFileSync(join(B, 'media.json'), 'utf8')) : {};
    w.gzip = { html: gzipSync(readFileSync(join(B, 'banner.html'))).length, css: gzipSync(readFileSync(join(B, 'banner.css'))).length, js: gzipSync(readFileSync(join(B, 'banner.js'))).length };
    data.banner = { bytes: w, meta };
    check('hero poster at most 60 KB (WebP and AVIF)', w.posterWebp && w.posterWebp <= 60000 && w.posterAvif && w.posterAvif <= 60000, { webp: w.posterWebp, avif: w.posterAvif });
    check('hero loop: silent, 3–4 s, at most 300 KB as WebM and as MP4', w.loopWebm <= 300000 && w.loopMp4 <= 300000 && meta.seconds >= 3 && meta.seconds <= 4 && meta.audioStreams === 0, { webm: w.loopWebm, mp4: w.loopMp4, seconds: meta.seconds, audio: meta.audioStreams });
    // the banner on a test homepage: no 3D, poster first, CTA to the staged route
    const { server: s2, url: u2 } = await serveDir(site);
    for (const lang of ['en', 'es']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await fonts(ctx);
      const page = await ctx.newPage();
      const req = [];
      page.on('request', (r) => req.push(r.url()));
      await page.goto(u2 + (lang === 'es' ? 'test-home-es.html' : 'test-home.html'), { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => ({ cta: document.querySelector('.sc-banner .sc-cta') && document.querySelector('.sc-banner .sc-cta').getAttribute('href'), ctaText: document.querySelector('.sc-banner .sc-cta') && document.querySelector('.sc-banner .sc-cta').textContent.trim(), webgl: !!document.querySelector('canvas'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      const heavy = req.filter((u) => /\.(glb)(\?|$)|practice\/app\.js/.test(u));
      data['bannerPage_' + lang] = { ...info, requests: req.length, heavy };
      const want = lang === 'es' ? { href: '/es/practica/', text: 'Prueba la práctica' } : { href: '/practice/', text: 'Try the practice' };
      check(`banner ${lang.toUpperCase()}: CTA "${want.text}" goes to ${want.href}; no 3D, no WebGL, no avatar download on the homepage`, info.cta === want.href && info.ctaText === want.text && !info.webgl && heavy.length === 0 && info.overflow <= 0, data['bannerPage_' + lang]);
      await ctx.close();
    }
    s2.close();
  }
  // ---------- H. staged route under the live site's Content Security Policy ----------
  if (existsSync(join(site, 'practice', 'index.html'))) {
    const headers = readFileSync(join(here, 'qa', 'live-csp.txt'), 'utf8').trim();
    const results = {};
    for (const [name, csp] of [['live', headers], ['live+wasm', headers.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")]]) {
      const { server: s3, url: u3 } = await serveDir(site, { 'content-security-policy': csp });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      await fonts(ctx);
      const page = await ctx.newPage();
      const viol = [];
      await page.exposeFunction('__csp', (v) => viol.push(v));
      await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__csp && window.__csp(e.violatedDirective + ' ' + (e.blockedURI || ''))));
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
      await page.goto(u3 + 'practice/', { waitUntil: 'load' });
      await page.click('#prGo');
      const loaded = await page.waitForFunction(() => document.body.classList.contains('has3d') || document.getElementById('poster').classList.contains('fail'), null, { timeout: 60000 }).then(() => page.evaluate(() => document.body.classList.contains('has3d')));
      results[name] = { loaded, violations: [...new Set(viol)], errors: errors.slice(0, 2) };
      await ctx.close(); s3.close();
    }
    data.csp = results;
    check("staged route under the live site's CSP: the dancers need 'wasm-unsafe-eval' (meshopt decoder) and nothing else; with it, no violations", results['live+wasm'].loaded && results['live+wasm'].violations.length === 0 && !results.live.loaded, results);
  }
}
