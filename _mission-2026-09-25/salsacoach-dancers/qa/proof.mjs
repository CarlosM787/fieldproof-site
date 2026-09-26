// Frame-by-frame contact proof: samples the posed skeletons 200 times per beat over two 8-counts
// and writes evidence/contact-samples.json (ball heights, heel pitch, pelvis side, beat grid).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, here } from './serve.mjs';
const { server, url } = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(url + 'index.html#qa');
await page.evaluate(() => window.__dance.ready);
const out = {};
for (const pattern of (process.env.PATTERNS || 'on1').split(',')) {
  await page.evaluate((p) => window.__dance.set({ pattern: p, loop: 'all', reduced: false }), pattern);
  out[pattern] = await page.evaluate(() => {
    const N = 200, rows = [];
    for (let i = 0; i <= 16 * N; i++) {
      const p = i / N, r = window.__dance.probe(p % 8), f = (d) => [+(d.Lball.y - d.LballRest.y).toFixed(5), +(d.Rball.y - d.RballRest.y).toFixed(5), +d.Lball.z.toFixed(5), +d.Rball.z.toFixed(5), +d.pelvis.x.toFixed(4), +d.Lankle.y.toFixed(4), +d.Rankle.y.toFixed(4)];
      rows.push([+p.toFixed(4), ...f(r.leader), ...f(r.follower)]);
    }
    return { cols: ['p', 'L_Lh', 'L_Rh', 'L_Lz', 'L_Rz', 'L_pelx', 'L_Lank', 'L_Rank', 'F_Lh', 'F_Rh', 'F_Lz', 'F_Rz', 'F_pelx', 'F_Lank', 'F_Rank'], rows };
  });
}
writeFileSync(join(here, 'evidence', 'contact-samples.json'), JSON.stringify(out));
console.log('ok', Object.keys(out), out.on1.rows.length);
await browser.close(); server.close();
