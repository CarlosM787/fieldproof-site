// Pilot A capture: drives the Count Lab page (same model + synth as the web prototype) to produce
// the floor frames and the audio for a Clave Lab episode.
//   OUT=/path node capture.mjs                                  v1: episode.mjs, frames + audio.wav
//   OUT=/path EPISODE=episode_v2.mjs STEMS=1 node capture.mjs   v2: also per-lane stems
// Options (environment variables; see ../PRODUCTION_P2.md):
//   EPISODE     episode module next to this file (default episode.mjs)
//   STEMS=1     also write stems/<lane>.wav: the same page synth and clock, one lane switched on
//   FRAMES=0    audio only (skip the floor frames)
//   PW_ROOT, CHROME   where Playwright and Chromium live (defaults fit the cloud container)
// An episode may export `capture: { viewport, dpr, cam(t, ep) -> {yaw, pitch, dist} }` and
// `frameTime: 'center'`; without them this behaves exactly like the v1 capture.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { EPISODE } = await import(new URL(process.env.EPISODE || 'episode.mjs', import.meta.url));

function loadPlaywright() {
  const roots = [process.env.PW_ROOT, process.cwd(), '/opt/node22/lib/node_modules'].filter(Boolean);
  for (const r of roots) {
    try { return createRequire(r.replace(/\/?$/, '/'))('playwright'); } catch { /* try the next root */ }
  }
  throw new Error('playwright not found: run `npm i playwright` here, or set PW_ROOT to the folder holding node_modules/');
}
const { chromium } = loadPlaywright();
const OUT = process.env.OUT || 'out';
const FRAMES = process.env.FRAMES !== '0';
mkdirSync(join(OUT, 'floor'), { recursive: true });

const dist = new URL('../../salsacoach-count-lab/dist/', import.meta.url).pathname;
const server = createServer((req, res) => {
  let body = null;
  try { body = readFileSync(join(dist, req.url.split('#')[0].replace(/\/$/, '/index.html'))); } catch { /* 404 */ }
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const cap = EPISODE.capture || {};
const launch = {};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else if (process.platform === 'linux') launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: cap.viewport || { width: 1120, height: 900 }, deviceScaleFactor: cap.dpr || 2 });
await page.goto(`http://127.0.0.1:${server.address().port}/render.html#render`, { waitUntil: 'load' });
await page.evaluate(() => window.__render.set({ state: { pattern: 'on1', role: 'both', loop: 'all', reduced: false }, lang: 'en' }));

// HEADROOM_DB=6: the page's bus compressor has make-up gain and the full band peaks above 0 dBFS,
// which the page's 16-bit export clamps (v1: 960 clipped samples). This inserts a plain gain between
// the page's compressor and the output, so the page's mix and dynamics are untouched and only the
// export level drops. The page itself is not modified; the patch lives in this capture tab only.
const headroomDb = Number(process.env.HEADROOM_DB || 0);
if (headroomDb) {
  await page.evaluate((g) => {
    const connect = AudioNode.prototype.connect;
    DynamicsCompressorNode.prototype.connect = function (dest, ...rest) {
      if (dest instanceof AudioDestinationNode) {
        const trim = this.context.createGain();
        trim.gain.value = g;
        connect.call(this, trim);
        return connect.call(trim, dest, ...rest);
      }
      return connect.call(this, dest, ...rest);
    };
  }, 10 ** (-headroomDb / 20));
}

// Audio first: the page's own synth rendered offline on the page's clock (slot i at 0.1 s + i eighth
// notes), with the per-measure mix from the episode. Stems are the same call with one lane on.
const beats = EPISODE.measures.length * 8;
const mixes = EPISODE.measures.map((m) => m.mix);
const render = (mix) => page.evaluate(({ beats, bpm, mix }) => window.__render.audio(beats, bpm, 48000, mix), { beats, bpm: EPISODE.bpm, mix });
writeFileSync(join(OUT, 'audio.wav'), Buffer.from(await render(mixes), 'base64'));
if (process.env.STEMS === '1') {
  mkdirSync(join(OUT, 'stems'), { recursive: true });
  for (const lane of ['bell', 'clave', 'conga', 'bass']) {
    const only = mixes.map((m) => ({ [lane]: !!m[lane] }));
    writeFileSync(join(OUT, 'stems', `${lane}.wav`), Buffer.from(await render(only), 'base64'));
  }
  console.log('stems written');
}

if (FRAMES) {
  const fps = EPISODE.fps, total = Math.round(EPISODE.seconds * fps);
  const lead = EPISODE.frameTime === 'center' ? 0.5 / fps : 0; // v2 samples each frame at its middle
  for (let f = 0; f < total; f++) {
    const t = f / fps + lead;
    const beat = Math.max(0, (t - EPISODE.audioOffset) * EPISODE.bpm / 60);
    let c;
    if (cap.cam) c = cap.cam(t, EPISODE);
    else { const u = t / EPISODE.seconds; c = { yaw: 0.35 + 1.25 * u, pitch: 0.36 + 0.26 * Math.sin(Math.PI * u) }; }
    const jpg = await page.evaluate(({ p, c }) => {
      if (c.dist) window.__render.set({ cam: { dist: c.dist } });
      window.__render.cam(c.yaw, c.pitch); window.__render.frame(p); return window.__render.canvas();
    }, { p: beat % 8, c });
    writeFileSync(join(OUT, 'floor', `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(jpg.split(',')[1], 'base64'));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  writeFileSync(join(OUT, 'floor', 'floor.json'), JSON.stringify({
    source: 'count-lab', fps, frames: total, frameTime: EPISODE.frameTime || 'start', bpm: EPISODE.bpm,
    audioOffset: EPISODE.audioOffset, pattern: 'on1', episode: EPISODE.id,
  }, null, 1) + '\n');
  console.log('done', total, 'frames');
}
await browser.close();
server.close();
