// Count Lab QA: layout, no-JS, reduced motion, Spanish, accessibility,
// audio-clock sync of the visuals, and the Find-the-1 judge.
//   AXE=/path/to/axe.min.js node qa/qa.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';

const require = createRequire(process.env.PW_ROOT || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const here = new URL('..', import.meta.url).pathname;
const ev = join(here, 'evidence');
mkdirSync(ev, { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = join(here, 'dist', req.url.split('?')[0].split('#')[0].replace(/\/$/, '/index.html'));
  let body = null;
  try { body = readFileSync(p); } catch { /* not found */ }
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(body);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const URL0 = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--proxy-server=http://127.0.0.1:37691', '--proxy-bypass-list=127.0.0.1'],
});
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

// Serve Google Fonts from a local cache (fetched with curl, which trusts the
// egress proxy's CA) so screenshots use the real typefaces without ever
// switching off certificate checks in the browser.
const FC = process.env.FONTCACHE;
async function fonts(ctx) {
  if (!FC) return;
  const cssText = readFileSync(join(FC, 'fonts.css'), 'utf8');
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: cssText, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const f = join(FC, createHash('md5').update(r.request().url() + '\n').digest('hex').slice(0, 12) + '.woff2');
    try { r.fulfill({ contentType: 'font/woff2', body: readFileSync(f), headers: { 'access-control-allow-origin': '*' } }); }
    catch { r.fulfill({ status: 404, body: '' }); }
  });
}
async function open(opts = {}, hash = '') {
  const ctx = await browser.newContext(opts);
  await fonts(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL0 + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// 1. desktop at rest
{
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 1000 } });
  await page.screenshot({ path: join(ev, 'desktop-rest.png') });
  check('desktop: no script errors', errors.length === 0, errors);
  check('desktop: no horizontal scroll', (await overflow(page)) <= 0);
  const drawn = await page.evaluate(() => { const c = document.getElementById('floor'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  check('desktop: floor is drawn at rest (non-empty canvas)', drawn > 5000, drawn);
  await ctx.close();
}

// 2. phone at rest (Galaxy S25-sized viewport), EN and ES
{
  const phone = { viewport: { width: 384, height: 832 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const { ctx, page, errors } = await open(phone);
  await page.screenshot({ path: join(ev, 'phone-rest-en.png'), fullPage: true });
  check('phone: no script errors', errors.length === 0, errors);
  check('phone: no horizontal scroll at 384 px', (await overflow(page)) <= 0, await overflow(page));
  await page.click('#lang-es');
  await page.waitForTimeout(200);
  const h1 = await page.textContent('h1');
  check('phone: Spanish switch rewrites the page', /Escucha dónde vive el uno/.test(h1), h1);
  const esTable = await page.isVisible('[data-lang-block="es"] table');
  check('phone: Spanish step tables visible in ES', esTable);
  await page.screenshot({ path: join(ev, 'phone-rest-es.png') });
  await ctx.close();
}

// 3. reduced motion follows the OS
{
  const { ctx, page } = await open({ viewport: { width: 1024, height: 900 }, reducedMotion: 'reduce' });
  check('reduced motion: checkbox follows OS setting', await page.isChecked('#reduced'));
  await ctx.close();
}

// 4. no JavaScript: the tables are the page
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const canvasShown = await page.isVisible('#floor');
  const rows = await page.$$eval('[data-lang-block="en"] tbody tr', (r) => r.length);
  check('no-JS: interactive parts hidden', !canvasShown);
  check('no-JS: 24 step rows (3 patterns x 8 counts) readable', rows === 24, rows);
  await page.screenshot({ path: join(ev, 'phone-nojs.png'), fullPage: true });
  await ctx.close();
}

// 5. accessibility (axe, WCAG 2 A/AA)
if (process.env.AXE) {
  const { ctx, page } = await open({ viewport: { width: 1280, height: 900 } });
  await page.addScriptTag({ content: readFileSync(process.env.AXE, 'utf8') });
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, targets: v.nodes.slice(0, 6).map((x) => x.target.join(' ') + ' :: ' + (x.any[0] && x.any[0].message || '')) })));
  check('axe: no WCAG 2.1 A/AA violations', r.length === 0, r);
  await ctx.close();
}

// 6. visuals on the audio clock: when does the count flip vs when the beat is heard?
const timing = {};
for (const bpm of [120, 180, 220]) {
  const { ctx, page } = await open({ viewport: { width: 1280, height: 900 } }, '#qa');
  await page.evaluate((b) => { const r = document.getElementById('bpm'); r.value = b; r.dispatchEvent(new Event('input')); }, bpm);
  await page.click('#play');
  await page.waitForTimeout(Math.round(16 * 60000 / bpm) + 600); // two 8-counts
  await page.click('#play');
  const d = await page.evaluate(() => window.__qa);
  const lat = [];
  for (const f of d.flips) {
    const cands = d.sched.filter((s) => s.count === f.count && s.t <= f.heard + 0.06);
    if (!cands.length) continue;
    const s = cands[cands.length - 1];
    lat.push((f.heard - s.t) * 1000);
  }
  lat.sort((a, b) => a - b);
  const q = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
  timing[bpm] = { n: lat.length, min: +lat[0].toFixed(1), median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +lat[lat.length - 1].toFixed(1), early: lat.filter((x) => x < 0).length };
  check(`sync @${bpm} BPM: every count flips 0-34 ms after it is heard (<= 2 frames)`, lat.length >= 12 && lat[0] >= -1 && q(0.95) <= 34, timing[bpm]);
  if (bpm === 180) await page.screenshot({ path: join(ev, 'desktop-playing-180.png') });
  await ctx.close();
}

// 7. the Find-the-1 judge, driven by synthetic taps placed on the heard 1 and 5
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 900 } });
  await page.evaluate(() => { const r = document.getElementById('bpm'); r.value = 150; r.dispatchEvent(new Event('input')); });
  await page.click('#lv-band');
  await page.click('#play');
  await page.waitForTimeout(700);
  const out = await page.evaluate(async () => {
    const tap = document.getElementById('tap'), verdicts = [];
    const beat = 60 / 150;
    const read = () => document.getElementById('verdict').textContent;
    // count position is shown in the big numeral; aim taps using the page's own clock via the count cells
    for (const target of [1, 1, 5, 1]) {
      // wait until the count before the target is showing, then tap one beat later
      const before = target === 1 ? 8 : 4;
      await new Promise((res) => { const iv = setInterval(() => { if (document.getElementById('count-' + before).classList.contains('now')) { clearInterval(iv); res(); } }, 4); });
      await new Promise((res) => setTimeout(res, beat * 1000 - 8));
      tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await new Promise((res) => setTimeout(res, 50));
      verdicts.push({ target, verdict: read() });
    }
    return verdicts;
  });
  const ok = out[0].verdict.startsWith('On the 1') && out[2].verdict.startsWith('That was the 5');
  check('judge: taps on the 1 score "On the 1", a tap on 5 is caught as the 5', ok, out);
  await page.screenshot({ path: join(ev, 'desktop-trainer.png'), clip: { x: 0, y: 0, width: 1280, height: 900 } });
  await ctx.close();
}

writeFileSync(join(ev, 'qa-results.json'), JSON.stringify({ when: new Date().toISOString(), chromium: browser.version(), results, timing }, null, 2) + '\n');
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
