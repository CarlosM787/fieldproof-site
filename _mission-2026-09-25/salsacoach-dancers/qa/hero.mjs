// Renders the banner's hero loop from the real scene through the #render hooks: one On1 8-count at
// 150 BPM (3.2 s, 30 fps), which loops seamlessly because the basic repeats every 8 counts. Count
// numbers and footprints on, weight dot off (less clutter at banner size). Frames only; encode after.
//   OUT=dir [W=720] node qa/hero.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, here } from './serve.mjs';
const OUT = process.env.OUT || join(here, '..', 'media', 'frames-hero');
const W = Number(process.env.W || 720), BPM = 150, FPS = 30, BEATS = 8;
mkdirSync(OUT, { recursive: true });
const { server, url } = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url + 'index.html#render-full');
await page.evaluate(() => window.__dance.ready);
await page.evaluate(() => window.__dance.set({ pattern: 'on1', loop: 'all', role: 'both', ov: { count: true, weight: false, rhythm: false, prints: true } }));
await page.evaluate((w) => window.__dance.size(w, w), W);
// a three-quarter view from the leader's left: both faces visible, the feet and the numbers readable
const cam = (process.env.CAM || '0.95,0.2,3.35,0,0.8,0.21').split(',').map(Number);
await page.evaluate((c) => window.__dance.cam(c[0], c[1], c[2], [c[3], c[4], c[5]]), cam);
const total = Math.round(BEATS * 60 / BPM * FPS);
for (let f = 0; f < total; f++) {
  const p = (f / FPS) * BPM / 60;
  const d = await page.evaluate((p) => { window.__dance.frame(p % 8); return window.__dance.shot('image/png'); }, p);
  writeFileSync(join(OUT, `f${String(f).padStart(4, '0')}.png`), Buffer.from(d.split(',')[1], 'base64'));
}
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ bpm: BPM, fps: FPS, beats: BEATS, frames: total, seconds: total / FPS, cam, size: W }, null, 2));
console.log('frames', total);
await browser.close(); server.close();
