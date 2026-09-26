// Builds SalsaCoach Dancers: bundles src/ with esbuild (three.js tree-shaken), inlines CSS and JS,
// pre-renders the On1 step table for no-JS readers, and copies the avatar assets.
//   npm i   (three@0.170.0, esbuild@0.24.0)   then   node build.mjs
//   -> dist/index.html (full page) + dist/artifact.html (claude.ai artifact body) + dist/assets/
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { PATTERNS, describe } from '../salsacoach-count-lab/src/model.js';

const here = new URL('.', import.meta.url).pathname;
const read = (f) => readFileSync(here + f, 'utf8');
mkdirSync(here + 'dist/assets', { recursive: true });

const out = await build({
  entryPoints: [here + 'src/main.js'], bundle: true, minify: true, format: 'iife', target: 'es2020',
  write: false, legalComments: 'eof', logLevel: 'warning',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const P = PATTERNS.on1;
const rows = [];
for (let k = 1; k <= 8; k++) {
  rows.push(`<tr data-k="${k}"${P.holds.includes(k) ? ' class="hold"' : ''}><th scope="row">${k}</th><td>${describe(P, k, 'leader', 'en')}</td><td>${describe(P, k, 'follower', 'en')}</td></tr>`);
}
const table = `<caption>On1</caption><thead><tr><th scope="col">Count</th><th scope="col">Leader</th><th scope="col">Follower</th></tr></thead><tbody>${rows.join('')}</tbody>`;
// function replacements everywhere: '$' sequences in the minified bundle must not act as patterns
const body = read('src/body.html').replace('{{TABLE}}', () => table)
  .replace('{{NOW_L}}', () => describe(P, 1, 'leader', 'en')).replace('{{NOW_F}}', () => describe(P, 1, 'follower', 'en'));
const css = read('src/style.css');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Big+Shoulders+Display:wght@800&family=JetBrains+Mono:wght@500;600;700&display=swap">';
const title = '<title>SalsaCoach Dancers</title>';
const meta = '<meta name="description" content="Two life-size salsa dancers stepping on the count, driven by the SalsaCoach Count Lab step table and audio clock.">';
const artifact = `${title}\n${meta}\n${fonts}\n<style>\n${css}</style>\n${body}\n<script>\n${js}</script>\n`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${artifact.replace('\n' + body, () => '\n</head>\n<body>\n' + body)}</body>\n</html>\n`;
writeFileSync(here + 'dist/artifact.html', artifact);
writeFileSync(here + 'dist/index.html', full);

// Review build: the same page plus the route comparison, the filmed-route stand-in, the banner
// concept and the evidence, for Carlos's private review. Media (videos, stills) are private and
// live outside git: MEDIA=/path/to/media node build.mjs copies them into dist/media.
let facts = '';
try {
  const q = JSON.parse(readFileSync(here + 'evidence/qa-results.json', 'utf8')), d = q.data;
  const li = (b, t) => `<li><b>${b}</b> ${t}</li>`;
  facts = [
    li(`${q.passed} of ${q.total} QA checks pass`, `(${q.when.slice(0, 16).replace('T', ' ')} UTC, headless Chromium, software WebGL).`),
    li('Every step lands on its count', `for On1 and both On2 counts: at most ${Math.abs(d.on1.touchErrBeats[0] * 400).toFixed(0)} ms early at 150 BPM, never late.`),
    li('Planted feet do not slide:', `${d.on1.plantedDriftMm} mm of movement while planted.`),
    li('Hips over the weighted foot', 'on every count, both dancers; knees always bend forward.'),
    li('Phone first load:', `${(d.load_phone.bytes / 1e6).toFixed(2)} MB (desktop ${(d.load_desktop.bytes / 1e6).toFixed(2)} MB); ${d.load_phone.drawCalls} draw calls; ${(d.load_phone.triangles / 1000).toFixed(1)}k triangles.`),
    li('Pose solve:', `${d.poseCpuMs.median} ms per frame for both dancers (CPU).`),
    li('Not yet measured:', 'frame rate and audio latency on a real phone with Bluetooth headphones.'),
  ].join('');
} catch { /* first build before QA */ }
const reviewBody = body.replace('  </main>', () => read('src/review.html').replace('{{FACTS}}', () => facts) + '  </main>');
const reviewJs = read('src/review.js');
const reviewArtifact = `${title}\n${meta}\n${fonts}\n<style>\n${css}${read('src/review.css')}</style>\n${reviewBody}\n<script>\n${js}</script>\n<script>\n${reviewJs}</script>\n`;
// artifact host: no .glb files served, so the review artifact carries both avatars inline
const glbInline = `<script>window.__GLB = { leader: '${readFileSync(here + 'assets/leader.glb').toString('base64')}', follower: '${readFileSync(here + 'assets/follower.glb').toString('base64')}' };</script>\n`;
writeFileSync(here + 'dist/review-artifact.html', reviewArtifact.replace('<script>\n' + js, () => glbInline + '<script>\n' + js));
writeFileSync(here + 'dist/review.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${reviewArtifact.replace('\n' + reviewBody, () => '\n</head>\n<body>\n' + reviewBody)}</body>\n</html>\n`);
if (process.env.MEDIA) {
  mkdirSync(here + 'dist/media', { recursive: true });
  for (const f of readdirSync(process.env.MEDIA)) if (/\.(mp4|jpg|png|webp)$/.test(f)) copyFileSync(process.env.MEDIA + '/' + f, here + 'dist/media/' + f);
}

let assetBytes = 0;
for (const f of readdirSync(here + 'assets')) {
  if (!/\.(glb|webp|jpg|png)$/.test(f)) continue;
  copyFileSync(here + 'assets/' + f, here + 'dist/assets/' + f);
  assetBytes += statSync(here + 'assets/' + f).size;
}
const size = {
  js: js.length, jsGzip: gzipSync(js, { level: 9 }).length,
  page: full.length, pageGzip: gzipSync(full, { level: 9 }).length, assets: assetBytes,
};
writeFileSync(here + 'dist/size.json', JSON.stringify(size, null, 2) + '\n');
console.log(size);
