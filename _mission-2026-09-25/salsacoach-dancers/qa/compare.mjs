// Renders the same camera shots from any build (phase two or three) for before/after pairs.
//   DIST=/path/to/dist OUT=dir [SET='{"overlays":false}'] node qa/compare.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, fonts, here } from './serve.mjs';
const OUT = process.env.OUT || join(here, 'evidence', 'changes', 'after');
const DIST = process.env.DIST || join(here, 'dist');
mkdirSync(OUT, { recursive: true });
// name: [yaw, pitch, dist, tx, ty, tz, p]   (p = beat position; 0 = count 1)
export const SHOTS = {
  'feet-side-toeoff': [Math.PI / 2, 0.06, 1.25, 0, 0.12, 0.21, 0.8],
  'feet-side-land': [Math.PI / 2, 0.06, 1.25, 0, 0.12, 0.21, 1.0],
  'feet-side-back-ball': [Math.PI / 2, 0.06, 1.25, 0, 0.12, 0.21, 4.1],
  'feet-front-roll': [0.25, 0.22, 1.5, 0, 0.15, 0.1, 5.85],
  'couple-leader': [0.32, 0.16, 4.1, 0, 0.86, 0.21, 0.35],
  'couple-side-mid': [Math.PI / 2, 0.08, 4.0, 0, 0.86, 0.21, 0.8],
  'torso-hold': [0.9, 0.12, 2.2, 0, 1.25, 0.21, 2.3],
  'heads': [Math.PI / 2, 0.02, 1.4, 0, 1.55, 0.21, 6.3],
};
const { server, url } = await serve(DIST);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
await fonts(ctx);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto(url + 'index.html#render-full');
await page.evaluate(() => window.__dance.ready);
await page.evaluate((o) => window.__dance.set(o), JSON.parse(process.env.SET || '{"pattern":"on1","loop":"all"}'));
for (const [name, v] of Object.entries(SHOTS)) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;
  const d = await page.evaluate(({ v }) => { window.__dance.cam(v[0], v[1], v[2], [v[3], v[4], v[5]]); window.__dance.frame(v[6]); return window.__dance.shot('image/jpeg', 0.9); }, { v });
  writeFileSync(join(OUT, name + '.jpg'), Buffer.from(d.split(',')[1], 'base64'));
}
console.log('ok', OUT);
await browser.close(); server.close();
