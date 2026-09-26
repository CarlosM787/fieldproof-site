// Renders the stand-in clips for the filmed-route player (behind leader, side; 640x360, two
// 8-counts with the band) and the banner loop (720x720, one 8-count, muted), plus stills.
//   OUT=dir node qa/clips.mjs   (frames + audio; encoded with ffmpeg afterwards)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch, here } from './serve.mjs';
const OUT = process.env.OUT || join(here, 'evidence', 'clips');
const BPM = 150, FPS = 30;
const { server, url } = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url + 'index.html#render-full');
await page.evaluate(() => window.__dance.ready);
await page.evaluate(() => window.__dance.set({ pattern: 'on1', loop: 'all' }));
const jobs = [
  { name: 'standin-leader', w: 640, h: 360, beats: 16, view: 'leader' },
  { name: 'standin-side', w: 640, h: 360, beats: 16, view: 'side' },
  { name: 'hero-loop', w: 720, h: 720, beats: 8, cam: [1.2, 0.08, 3.9, 0, 0.88, 0.21] },
];
for (const j of (process.env.ONLY ? jobs.filter((x) => x.name === process.env.ONLY) : jobs)) {
  const dir = join(OUT, j.name);
  mkdirSync(dir, { recursive: true });
  await page.evaluate(({ w, h }) => window.__dance.size(w, h), j);
  if (j.view) await page.evaluate((v) => window.__dance.set({ view: v }), j.view);
  if (j.cam) await page.evaluate((c) => window.__dance.cam(c[0], c[1], c[2], [c[3], c[4], c[5]]), j.cam);
  const wav = await page.evaluate(({ beats }) => window.__dance.audio(beats, 150, 48000, 'all', 0), j);
  writeFileSync(join(dir, 'audio.wav'), Buffer.from(wav, 'base64'));
  const total = Math.round(j.beats * 60 / BPM * FPS);
  for (let f = 0; f < total; f++) {
    const p = ((f / FPS) * BPM / 60) % 8;
    const d = await page.evaluate((p) => { window.__dance.frame(p); return window.__dance.shot('image/jpeg', 0.95); }, p);
    writeFileSync(join(dir, `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(d.split(',')[1], 'base64'));
  }
  console.log('done', j.name, total);
}
await browser.close(); server.close();
