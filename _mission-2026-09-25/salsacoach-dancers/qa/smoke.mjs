// Quick smoke test: loads the pages, reports script errors, renders a few frames.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, fonts, here } from './serve.mjs';
const OUT = process.env.OUT || join(here, '..', 'scratch', 'smoke');
mkdirSync(OUT, { recursive: true });
const { server, url } = await serve();
const browser = await launch();
for (const [pg, vp] of [['index.html#qa', { width: 1280, height: 800 }], ['practice.html#qa', { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }]]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor || 1, isMobile: !!vp.isMobile });
  await fonts(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto(url + pg, { waitUntil: 'load' });
  const ok = await page.evaluate(() => window.__dance && window.__dance.ready);
  console.log(pg, 'ready', ok, errors);
  for (const p of [0.3, 0.8, 4.1, 5.85]) {
    const d = await page.evaluate((p) => { window.__dance.frame(p); return window.__dance.shot('image/jpeg', 0.85); }, p);
    writeFileSync(join(OUT, pg.split('.')[0] + '-' + String(p).replace('.', '_') + '.jpg'), Buffer.from(d.split(',')[1], 'base64'));
  }
  await page.screenshot({ path: join(OUT, pg.split('.')[0] + '-page.jpg'), type: 'jpeg', quality: 70, fullPage: true });
  console.log(await page.evaluate(() => JSON.stringify(window.__dance.probe(0.8).badges)));
  console.log('errors after', errors);
  await ctx.close();
}
await browser.close(); server.close();
