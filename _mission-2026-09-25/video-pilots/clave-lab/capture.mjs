// Pilot A capture: drives the Count Lab page (same model + synth as the web prototype) to produce
// the floor frames and the audio for "Where is the 1?".
//   OUT=/path node capture.mjs        (needs Playwright + Chromium; see ../README.md)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EPISODE } from './episode.mjs';

const require = createRequire(process.env.PW_ROOT || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const OUT = process.env.OUT || 'out';
mkdirSync(join(OUT, 'floor'), { recursive: true });

const dist = new URL('../../salsacoach-count-lab/dist/', import.meta.url).pathname;
const server = createServer((req, res) => {
  let body = null;
  try { body = readFileSync(join(dist, req.url.split('#')[0].replace(/\/$/, '/index.html'))); } catch { /* 404 */ }
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${server.address().port}/render.html#render`, { waitUntil: 'load' });
await page.evaluate(() => window.__render.set({ state: { pattern: 'on1', role: 'both', loop: 'all', reduced: false }, lang: 'en' }));

// audio first: the page's own synth, rendered offline, with the per-measure mix from the episode
const b64 = await page.evaluate(({ beats, bpm, mix }) => window.__render.audio(beats, bpm, 48000, mix), { beats: EPISODE.measures.length * 8, bpm: EPISODE.bpm, mix: EPISODE.measures.map((m) => m.mix) });
writeFileSync(join(OUT, 'audio.wav'), Buffer.from(b64, 'base64'));

const fps = EPISODE.fps, total = Math.round(EPISODE.seconds * fps);
for (let f = 0; f < total; f++) {
  const t = f / fps;
  const beat = Math.max(0, (t - EPISODE.audioOffset) * EPISODE.bpm / 60);
  const u = t / EPISODE.seconds;
  const yaw = 0.35 + 1.25 * u, pitch = 0.36 + 0.26 * Math.sin(Math.PI * u);
  const jpg = await page.evaluate(({ p, yaw, pitch }) => { window.__render.cam(yaw, pitch); window.__render.frame(p); return window.__render.canvas(); }, { p: beat % 8, yaw, pitch });
  writeFileSync(join(OUT, 'floor', `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(jpg.split(',')[1], 'base64'));
  if (f % 150 === 0) console.log(`frame ${f}/${total}`);
}
await browser.close();
server.close();
console.log('done', total, 'frames');
