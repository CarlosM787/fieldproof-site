// EXPERIMENTAL (tested on 5 stills; full render not yet run). Floor adapter: renders the SalsaCoach Dancers page (life-size 3D leader and follower on the Count
// Lab clock, ../../salsacoach-dancers) into a --floor-dir for compose_v2.py. One frame per video
// frame, sampled on the episode's clock, plus the floor.json manifest compose_v2.py checks.
//   (once)  cd ../../salsacoach-dancers && npm i && node build.mjs
//   OUT=floor-3d EPISODE=episode_v2.mjs node capture_dancers.mjs
//   python compose_v2.py ... --floor-dir floor-3d          (or: python ../run.py pilot-a --floor-dir floor-3d)
// Options: DANCERS (the Dancers dist/ folder), TIMES=0.5,21.6 (test stills only), GL=gpu (skip
// SwiftShader when a real GPU is available), W/H (canvas CSS size, default the 1040x700 floor box).
// The camera follows the episode's yaw path; pitch and distance are adapted to life-size figures.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const { EPISODE } = await import(new URL(process.env.EPISODE || 'episode_v2.mjs', import.meta.url));
const DIST = process.env.DANCERS || new URL('../../salsacoach-dancers/dist/', import.meta.url).pathname;
const OUT = process.env.OUT || 'floor-3d';
const W = Number(process.env.W || 1040), H = Number(process.env.H || 700);
mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  for (const r of [process.env.PW_ROOT, process.cwd(), '/opt/node22/lib/node_modules'].filter(Boolean)) {
    try { return createRequire(r.replace(/\/?$/, '/'))('playwright'); } catch { /* next */ }
  }
  throw new Error('playwright not found: npm i playwright (or set PW_ROOT)');
}
const { chromium } = loadPlaywright();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = join(DIST, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/\/$/, '/index.html'));
  let body = null;
  try { body = readFileSync(p); } catch { /* 404 */ }
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(body);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

// software WebGL by default (works headless anywhere); external requests (web fonts) are refused
const args = ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1'];
if (process.env.GL !== 'gpu') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
const launch = { args };
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else if (process.platform === 'linux') launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: W + 200, height: H + 400 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#render-full`);
await page.evaluate(() => window.__dance.ready);
await page.evaluate(({ w, h }) => { window.__dance.set({ pattern: 'on1', loop: 'all', role: 'both', lang: 'en' }); return window.__dance.size(w, h); }, { w: W, h: H });

const fps = EPISODE.fps, total = Math.round(EPISODE.seconds * fps);
const lead = EPISODE.frameTime === 'center' ? 0.5 / fps : 0;
const camAt = (t) => {
  const c = EPISODE.capture && EPISODE.capture.cam ? EPISODE.capture.cam(t, EPISODE) : { yaw: 0.32, pitch: 0.3, dist: 3.8 };
  // Count Lab and Dancers share the yaw convention (0 = behind the leader, facing the follower);
  // life-size figures want a camera nearer eye level and a little further back
  return { yaw: c.yaw, pitch: 0.07 + 0.35 * (c.pitch - 0.2), dist: c.dist * 1.24 };
};
const frames = process.env.TIMES ? process.env.TIMES.split(',').map((s) => Math.round(Number(s) * fps)) : [...Array(total).keys()];
for (const f of frames) {
  const t = f / fps + lead;
  const beat = Math.max(0, (t - EPISODE.audioOffset) * EPISODE.bpm / 60);
  const c = camAt(t);
  const jpg = await page.evaluate(({ p, c }) => {
    window.__dance.cam(c.yaw, c.pitch, c.dist); window.__dance.frame(p); return window.__dance.shot('image/jpeg', 0.92);
  }, { p: beat % 8, c });
  writeFileSync(join(OUT, `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(jpg.split(',')[1], 'base64'));
  if (f % 150 === 0) console.log(`frame ${f}/${total}`);
}
if (!process.env.TIMES) {
  writeFileSync(join(OUT, 'floor.json'), JSON.stringify({
    source: 'salsacoach-dancers', fps, frames: total, frameTime: EPISODE.frameTime || 'start', bpm: EPISODE.bpm,
    audioOffset: EPISODE.audioOffset, pattern: 'on1', episode: EPISODE.id,
  }, null, 1) + '\n');
}
console.log('done', frames.length, 'frames ->', OUT);
await browser.close();
server.close();
