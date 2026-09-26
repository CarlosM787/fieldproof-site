// A/B timing: phase two vs phase three on the same machine, interleaved (A, B, A, B) so load from
// other jobs hits both. Software WebGL (SwiftShader): only the ratios mean anything for a phone.
//   A=/path/phase2/dist B=/path/phase3/dist OUT=evidence/ab-timing.json node qa/ab.mjs
import { writeFileSync } from 'node:fs';
import { serve, launch, bytes } from './serve.mjs';
const A = await serve(process.env.A), B = await serve(process.env.B);
const browser = await launch();
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const res = { A: { desktop: [], phone: [] }, B: { desktop: [], phone: [] } };
const VP = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
for (let round = 0; round < 2; round++) for (const [k, s] of [['A', A], ['B', B]]) for (const dev of ['desktop', 'phone']) {
  const ctx = await browser.newContext(VP[dev]);
  const page = await ctx.newPage();
  bytes.total = 0; bytes.byFile = {};
  await page.goto(s.url + 'index.html#qa', { waitUntil: 'load' });
  await page.evaluate(() => window.__dance.ready);
  const loadBytes = Object.values(bytes.byFile).reduce((a, b) => a + b, 0);
  const r = await page.evaluate(() => {
    const d = window.__dance, gl = document.getElementById('stage').getContext('webgl2');
    const pose = [d.bench(1000), d.bench(1000), d.bench(1000)];
    for (let i = 0; i < 5; i++) { d.frame(i * 0.3); gl.finish(); }
    const t = [];
    for (let i = 0; i < 60; i++) { const t0 = performance.now(); d.frame((i * 0.113) % 8); gl.finish(); t.push(performance.now() - t0); }
    t.sort((a, b) => a - b);
    const m = d.metrics();
    return { poseMedian: pose.map((x) => x.median).sort((a, b) => a - b)[1], poseP95: pose.map((x) => x.p95).sort((a, b) => a - b)[1], frameMedian: t[30], frameP90: t[54], calls: m.calls, triangles: m.triangles, textures: m.textures, dpr: m.dpr, lite: m.lite, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
  });
  res[k][dev].push({ ...r, loadBytes });
  await ctx.close();
}
const sum = {};
for (const k of ['A', 'B']) for (const dev of ['desktop', 'phone']) {
  const rs = res[k][dev];
  sum[`${k === 'A' ? 'phase2' : 'phase3'} ${dev}`] = {
    poseMs: +med(rs.map((x) => x.poseMedian)).toFixed(4), poseP95Ms: +med(rs.map((x) => x.poseP95)).toFixed(4),
    frameMs: +med(rs.map((x) => x.frameMedian)).toFixed(2), frameP90Ms: +med(rs.map((x) => x.frameP90)).toFixed(2),
    drawCalls: rs[0].calls, triangles: rs[0].triangles, loadBytes: rs[0].loadBytes, heapMB: med(rs.map((x) => x.heapMB)), tier: rs[0].lite ? 'lite' : 'full', dpr: rs[0].dpr,
  };
}
const ratio = (dev, key) => +(sum[`phase3 ${dev}`][key] / sum[`phase2 ${dev}`][key]).toFixed(2);
const out = {
  when: new Date().toISOString(),
  method: 'Same headless Chromium 141 (SwiftShader, software WebGL), same machine, interleaved A/B twice. poseMs: bench(1000) = both dancers posed, CPU only (median of 3). frameMs: pose + render + gl.finish() per frame (60 frames). loadBytes: every file the local server sent for index.html#qa (fonts excluded, as in phase two).',
  summary: sum,
  ratios: { poseDesktop: ratio('desktop', 'poseMs'), posePhone: ratio('phone', 'poseMs'), frameDesktop: ratio('desktop', 'frameMs'), framePhone: ratio('phone', 'frameMs'), loadPhone: ratio('phone', 'loadBytes') },
  raw: res,
};
writeFileSync(process.env.OUT || 'ab-timing.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ summary: sum, ratios: out.ratios }, null, 1));
await browser.close(); A.server.close(); B.server.close();
