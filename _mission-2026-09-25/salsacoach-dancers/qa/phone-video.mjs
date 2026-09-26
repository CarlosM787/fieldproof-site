// Phone-size video of the page's stage, count strip and step text, rendered frame by frame from
// the deterministic hooks, with the same band rendered offline. Three 8-counts: behind the leader,
// from the side, behind the follower.   OUT=dir node qa/phone-video.mjs  (then ffmpeg, see README)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, fonts, here } from './serve.mjs';
const OUT = process.env.OUT || join(here, 'evidence', 'video-frames');
mkdirSync(OUT, { recursive: true });
const BPM = Number(process.env.BPM || 150), FPS = 30, FROM = -0.75, CYCLES = 3;
const beats = CYCLES * 8 - FROM + 0.25;
const seconds = beats * 60 / BPM;
const { server, url } = await serve();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await fonts(ctx);
const page = await ctx.newPage();
await page.goto(url + 'index.html#render-full');
await page.evaluate(() => window.__dance.ready);
await page.addStyleTag({ content: '.dock, .top, h1, .lede { display: none !important; } body { padding-block: 8px; } .legend .hint { display: none; }' });
await page.evaluate(() => window.__dance.set({ pattern: 'on1', loop: 'all', view: 'leader', lang: 'en' }));
const wav = await page.evaluate(({ beats, BPM, FROM }) => window.__dance.audio(beats, BPM, 48000, 'all', FROM), { beats, BPM, FROM });
writeFileSync(join(OUT, 'audio.wav'), Buffer.from(wav, 'base64'));
const box = await page.evaluate(() => {
  const a = document.querySelector('.stage').getBoundingClientRect(), b = document.querySelector('.nowbox').getBoundingClientRect();
  return { x: a.x, y: a.y, width: a.width, height: b.bottom - a.y };
});
const views = ['leader', 'side', 'follower'];
let lastView = null;
const total = Math.round(seconds * FPS);
for (let f = 0; f < total; f++) {
  const beat = FROM + (f / FPS) * BPM / 60;
  const cyc = Math.max(0, Math.min(CYCLES - 1, Math.floor(beat / 8)));
  if (views[cyc] !== lastView) { await page.evaluate((v) => window.__dance.set({ view: v }), views[cyc]); lastView = views[cyc]; }
  const p = ((beat % 8) + 8) % 8;
  await page.evaluate((p) => window.__dance.frame(p), p);
  await page.screenshot({ path: join(OUT, `f${String(f).padStart(5, '0')}.png`), clip: box });
  if (f % 60 === 0) console.log(`frame ${f}/${total}`);
}
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ bpm: BPM, fps: FPS, from: FROM, frames: total, seconds, box, note: 'beat 0 (count 1) is at t = -FROM * 60 / BPM seconds' }, null, 2));
console.log('done', total, 'frames', box);
await browser.close(); server.close();
