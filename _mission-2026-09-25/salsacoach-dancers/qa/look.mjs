// Close-up renders with explicit camera: CAMS="name:yaw,pitch,dist,tx,ty,tz;..." PS="0,1"
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, here } from './serve.mjs';
const OUT = process.env.OUT || join(here, 'evidence', 'dev');
mkdirSync(OUT, { recursive: true });
const { server, url } = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 900), height: Number(process.env.H || 1100) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto(url + 'index.html#render');
await page.evaluate(() => window.__dance.ready);
if (process.env.SET) await page.evaluate((o) => window.__dance.set(o), JSON.parse(process.env.SET));
const cams = (process.env.CAMS || 'side:1.5708,0.1,2.6,0,1.0,0.21').split(';').map((c) => { const [n, v] = c.split(':'); return [n, v.split(',').map(Number)]; });
const ps = (process.env.PS || '0').split(',').map(Number);
for (const [n, v] of cams) for (const p of ps) {
  const d = await page.evaluate(({ v, p }) => { window.__dance.cam(v[0], v[1], v[2], v.length > 3 ? [v[3], v[4], v[5]] : null); window.__dance.frame(p); return window.__dance.shot('image/jpeg', 0.9); }, { v, p });
  writeFileSync(join(OUT, `${n}-${String(p).replace('.', '_')}.jpg`), Buffer.from(d.split(',')[1], 'base64'));
}
if (process.env.PROBE) console.log(JSON.stringify(await page.evaluate((p) => window.__dance.probe(p), Number(process.env.PROBE))));
await browser.close(); server.close();
