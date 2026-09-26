// Quick look: renders the canvas at chosen counts and views into OUT (default evidence/dev).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, fonts, here } from './serve.mjs';
const OUT = process.env.OUT || join(here, 'evidence', 'dev');
mkdirSync(OUT, { recursive: true });
const { server, url } = await serve();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 900) }, deviceScaleFactor: 1 });
await fonts(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(url + 'index.html' + (process.env.HASH || '#render'), { waitUntil: 'load' });
const ok = await page.evaluate(() => window.__dance.ready);
console.log('ready', ok, errors);
const views = (process.env.VIEWS || 'leader').split(',');
const ps = (process.env.PS || '0,0.8,1,2.8,4,4.8').split(',').map(Number);
for (const v of views) {
  await page.evaluate((v) => window.__dance.set({ view: v, pattern: process.env && 'on1' }), v).catch(() => page.evaluate((v) => window.__dance.set({ view: v }), v));
  for (const p of ps) {
    const d = await page.evaluate((p) => { window.__dance.frame(p); return window.__dance.shot('image/jpeg', 0.9); }, p);
    const f = join(OUT, `${v}-${String(p).replace('.', '_')}.jpg`);
    writeFileSync(f, Buffer.from(d.split(',')[1], 'base64'));
  }
}
console.log('errors', errors);
console.log(await page.evaluate(() => window.__dance.metrics()));
await browser.close(); server.close();
