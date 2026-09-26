// Builds SalsaCoach Dancers (phase three): bundles src/ with esbuild (three.js tree-shaken), inlines
// CSS and JS, pre-renders the On1 step table for no-JS readers, and copies the avatar assets.
//   npm i   (three@0.170.0, esbuild@0.24.0)   then   node build.mjs
// Outputs (dist/ is not in git):
//   index.html      explore page, tier chosen on the device (phone: lite, desktop: full)
//   phone.html      the same page forced to the phone tier (512 px textures, no normal maps)
//   desktop.html    the same page forced to the desktop tier (1024 px textures + normal maps)
//   practice.html   the guided practice flow; the 3D loads only when the viewer starts
//   artifact.html   the explore page as a claude.ai artifact body
//   review.html / review-artifact.html   practice page + the review sections (the artifact carries
//                   both avatars inline as base64, because the artifact host does not serve .glb)
//   site/           a CSP-safe staged route and the homepage banner for mysalsacoach.com (no inline
//                   scripts: the live site's policy is script-src 'self')
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build, transform } from 'esbuild';
import { PATTERNS, describe, states } from '../salsacoach-count-lab/src/model.js';

const here = new URL('.', import.meta.url).pathname;
const read = (f) => readFileSync(here + f, 'utf8');
mkdirSync(here + 'dist/assets', { recursive: true });

async function bundle(entry, defines = {}) {
  const out = await build({
    entryPoints: [here + entry], bundle: true, minify: true, format: 'iife', target: 'es2020',
    write: false, legalComments: 'eof', logLevel: 'warning', define: defines,
  });
  return out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}
const js = await bundle('src/main.js', { PRACTICE_FLOW: 'false' }); // explore pages
const pjs = await bundle('src/main.js', { PRACTICE_FLOW: 'true' }); // practice pages

const P = PATTERNS.on1, S1 = states(P)[1];
const rows = [];
for (let k = 1; k <= 8; k++) {
  rows.push(`<tr data-k="${k}"${P.holds.includes(k) ? ' class="hold"' : ''}><th scope="row">${k}</th><td>${describe(P, k, 'leader', 'en')}</td><td>${describe(P, k, 'follower', 'en')}</td></tr>`);
}
const table = `<caption>On1</caption><thead><tr><th scope="col">Count</th><th scope="col">Leader</th><th scope="col">Follower</th></tr></thead><tbody>${rows.join('')}</tbody>`;
const W = { L: 'Weight on the left foot', R: 'Weight on the right foot' };
// function replacements everywhere: '$' sequences in the minified bundle must not act as patterns
function stagePart(practice) {
  return (read('src/parts/stage-top.html') + read('src/parts/stage-rest.html')).replace('{{TABLE}}', () => table)
    .replace('{{NOW_L}}', () => describe(P, 1, 'leader', 'en')).replace('{{NOW_F}}', () => describe(P, 1, 'follower', 'en'))
    .replace('{{W_L}}', () => W[S1.w]).replace('{{W_F}}', () => W[S1.w === 'L' ? 'R' : 'L'])
    .replace('{{LOAD3D}}', () => (practice ? '<button type="button" id="load3d" class="load3d" data-i18n="load3d">Load the dancers</button>' : ''))
    .replace('{{DOCK_OPEN}}', () => (practice ? '<details class="more"><summary data-i18n="allControls">All controls</summary>' : ''))
    .replace('{{DOCK_CLOSE}}', () => (practice ? '</details>' : ''));
}
const assemble = (file, practice) => {
  const stage = stagePart(practice), cut = stage.indexOf('  ' + (practice ? '<details class="more">' : '<section class="dock"'));
  return read(file).replace('{{TOP}}', () => read('src/parts/top.html'))
    .replace('{{STAGE}}', () => stage).replace('{{STAGE_TOP}}', () => stage.slice(0, cut)).replace('{{STAGE_REST}}', () => stage.slice(cut))
    .replace('{{NOTES}}', () => read('src/parts/notes.html'));
};
const body = assemble('src/body.html', false);
const practiceBody = assemble('src/practice-body.html', true)
  .replace('<p id="posterText" data-i18n="loading">Loading the dancers…</p>', '<p id="posterText">The dancers load when you start (about 0.5 MB more on a phone).</p>');
const css = (await transform(read('src/style.css'), { loader: 'css', minify: true })).code;
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Big+Shoulders+Display:wght@800&family=JetBrains+Mono:wght@500;600;700&display=swap">';
const title = '<title>SalsaCoach Dancers</title>';
const meta = '<meta name="description" content="Two life-size salsa dancers stepping on the count, driven by the SalsaCoach Count Lab step table and audio clock.">';
const ptitle = '<title>SalsaCoach Practice</title>';
const pmeta = '<meta name="description" content="Practice the salsa basic in five steps: listen, find the 1, watch slowly, step along, speed up.">';
const noindex = '<meta name="robots" content="noindex">';
const bodyTag = (attrs) => `<body${attrs ? ' ' + attrs : ''}>`;
function page({ ttl, desc, bodyHtml, attrs, extraCss = '', scripts }) {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${ttl}\n${desc}\n${noindex}\n${fonts}\n<style>\n${css}${extraCss}</style>\n</head>\n${bodyTag(attrs)}\n${bodyHtml}\n${scripts}</body>\n</html>\n`;
}
const inline = (code) => `<script>\n${code}</script>\n`;
// artifact bodies: no doctype/head (the artifact host adds them); body attributes set by a tiny script
const artifactBody = ({ ttl, desc, bodyHtml, attrs, extraCss = '', scripts }) => `${ttl}\n${desc}\n${fonts}\n<style>\n${css}${extraCss}</style>\n${attrs ? inline(`document.body && Object.assign(document.body.dataset, ${JSON.stringify(Object.fromEntries([...attrs.matchAll(/data-(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]])))});`) : ''}${bodyHtml}\n${scripts}`;

writeFileSync(here + 'dist/index.html', page({ ttl: title, desc: meta, bodyHtml: body, scripts: inline(js) }));
writeFileSync(here + 'dist/phone.html', page({ ttl: title, desc: meta, bodyHtml: body, attrs: 'data-tier="lite"', scripts: inline(js) }));
writeFileSync(here + 'dist/desktop.html', page({ ttl: title, desc: meta, bodyHtml: body, attrs: 'data-tier="full"', scripts: inline(js) }));
writeFileSync(here + 'dist/practice.html', page({ ttl: ptitle, desc: pmeta, bodyHtml: practiceBody, attrs: 'data-mode="practice"', scripts: inline(pjs) }));
writeFileSync(here + 'dist/artifact.html', artifactBody({ ttl: title, desc: meta, bodyHtml: body, scripts: inline(js) }));

// Review build: the practice page plus the review sections (comparison, hero/banner, evidence).
let facts = '';
try {
  const q = JSON.parse(readFileSync(here + 'evidence/qa-results.json', 'utf8')), d = q.data;
  const li = (b, t) => `<li><b>${b}</b> ${t}</li>`;
  facts = [
    li(`${q.passed} of ${q.total} QA checks pass`, `(${q.when.slice(0, 16).replace('T', ' ')} UTC, headless Chromium, software WebGL): the 33 phase-two checks plus ${q.total - 33} new ones.`),
    li('Every step still lands on its count', `for On1 and both On2 counts: at most ${Math.abs(d.on1.touchErrBeats[0] * 400).toFixed(0)} ms early at 150 BPM, never late, also at half speed.`),
    li('Planted feet do not slide:', `${d.on1.plantedDriftMm} mm of movement while planted; toe tips never go below the floor.`),
    li('Phone first load:', `${(d.load_phone.bytes / 1e6).toFixed(2)} MB (desktop ${(d.load_desktop.bytes / 1e6).toFixed(2)} MB).`),
    li('Pose solve:', `${d.poseCpuMs.median} ms per frame for both dancers (CPU), phase two ${d.phase2 ? d.phase2.poseMedian : '0.044'} ms on the same machine.`),
    li('Not yet measured:', 'frame rate and audio latency on a real phone with Bluetooth headphones; the count voice has not been heard by a person.'),
  ].join('');
} catch { /* first build before QA */ }
// banner rows: measured sizes (media.json from tools/poster.mjs) and the Lighthouse lab summary
let bannerRows = '';
try {
  const kb = (b) => (b / 1024).toFixed(1) + ' KB';
  const m = JSON.parse(readFileSync(process.env.MEDIA + '/media.json', 'utf8')), b = m.bytes;
  const comp = ['banner.html', 'banner.css', 'banner.js'].map((f) => gzipSync(readFileSync(here + 'src/banner/' + f)).length);
  const row = (a, c) => `<tr><th scope="row">${a}</th><td>${c}</td></tr>`;
  bannerRows = [
    row('Poster (720 × 720)', `WebP ${kb(b['hero-poster.webp'])} · AVIF ${kb(b['hero-poster.avif'])} (budget 60 KB)`),
    row('Silent loop', `${m.seconds} s, no audio track · WebM ${kb(b['hero-loop.webm'])} · MP4 ${kb(b['hero-loop.mp4'])} (budget 300 KB); loads only when on screen, never with reduced motion or Save-Data`),
    row('Component (gzip)', `HTML ${kb(comp[0])} · CSS ${kb(comp[1])} · JS ${kb(comp[2])}; no inline script, so it fits the live CSP`),
  ].join('');
  const lh = JSON.parse(readFileSync(here + '../lh/results/summary.json', 'utf8')).summary;
  const t = lh['test-home.html'], a = lh['home-a.html'], c = lh['home-b.html'];
  if (t) bannerRows += row('Lighthouse mobile, banner test page (lab, local, median of 3)', `LCP ${(t.lcpMs / 1000).toFixed(2)} s · CLS ${t.cls} · TBT ${t.tbtMs} ms · performance ${t.perf} · accessibility ${t.a11y}`);
  if (a && c) bannerRows += row('Homepage copy without / with the banner (lab)', `LCP ${(a.lcpMs / 1000).toFixed(2)} s / ${(c.lcpMs / 1000).toFixed(2)} s · CLS ${a.cls} / ${c.cls} · performance ${a.perf} / ${c.perf}. Google Fonts cannot load in this container, so both copies ran without them.`);
} catch { /* media or Lighthouse results not there yet */ }
const reviewHtml = existsSync(here + 'src/review.html') ? read('src/review.html').replace('{{FACTS}}', () => facts).replace('{{BANNER_ROWS}}', () => bannerRows) : '';
const reviewBody = practiceBody.replace('  </main>', () => reviewHtml + '  </main>');
const reviewJs = read('src/review.js');
const rv = { ttl: '<title>SalsaCoach Dancers · review</title>', desc: meta, bodyHtml: reviewBody, attrs: 'data-mode="practice"', extraCss: read('src/review.css') };
const glbInline = `window.__GLB = { leader: '${readFileSync(here + 'assets/leader.glb').toString('base64')}', follower: '${readFileSync(here + 'assets/follower.glb').toString('base64')}' };`;
writeFileSync(here + 'dist/review.html', page({ ...rv, scripts: inline(pjs) + inline(reviewJs) }));
writeFileSync(here + 'dist/review-artifact.html', artifactBody({ ...rv, scripts: inline(glbInline) + inline(pjs) + inline(reviewJs) }));
if (process.env.MEDIA) {
  mkdirSync(here + 'dist/media', { recursive: true });
  for (const f of readdirSync(process.env.MEDIA)) if (/\.(mp4|webm|jpg|png|webp|avif)$/.test(f)) copyFileSync(process.env.MEDIA + '/' + f, here + 'dist/media/' + f);
}

let assetBytes = 0;
for (const f of readdirSync(here + 'assets')) {
  if (!/\.(glb|webp|jpg|png)$/.test(f)) continue;
  copyFileSync(here + 'assets/' + f, here + 'dist/assets/' + f);
  assetBytes += statSync(here + 'assets/' + f).size;
}

// ---------- staged route + banner for mysalsacoach.com (CSP: script-src 'self', no inline JS) ----------
const site = here + 'dist/site/';
rmSync(site, { recursive: true, force: true });
mkdirSync(site + 'practice/assets', { recursive: true });
mkdirSync(site + 'es/practica', { recursive: true });
writeFileSync(site + 'practice/app.js', pjs);
for (const f of readdirSync(here + 'assets')) if (/\.(glb|webp)$/.test(f)) copyFileSync(here + 'assets/' + f, site + 'practice/assets/' + f);
const sitePage = (lang, base) => `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${ptitle}\n${pmeta}\n${noindex}\n${fonts}\n<style>\n${css}</style>\n</head>\n<body data-mode="practice">\n${practiceBody}\n<script src="${base}app.js" defer></script>\n</body>\n</html>\n`;
writeFileSync(site + 'practice/index.html', sitePage('en', ''));
// Spanish route: same app, Spanish first (?lang=es is honoured by the app; this page sets it)
writeFileSync(site + 'es/practica/index.html', sitePage('es', '../../practice/').replace('<body data-mode="practice">', '<body data-mode="practice" data-lang="es" data-assets="../../practice/">'));
const bannerDir = here + 'src/banner/';
if (existsSync(bannerDir)) {
  mkdirSync(site + 'banner', { recursive: true });
  for (const f of readdirSync(bannerDir)) copyFileSync(bannerDir + f, site + 'banner/' + f);
  if (process.env.MEDIA) for (const f of ['hero-poster.webp', 'hero-poster.avif', 'hero-loop.webm', 'hero-loop.mp4', 'media.json']) if (existsSync(process.env.MEDIA + '/' + f)) copyFileSync(process.env.MEDIA + '/' + f, site + 'banner/' + f);
  // test pages: a plain homepage-like page with the banner, system fonts only (so the numbers are the banner's)
  const testPage = (lang, snippet) => `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${lang === 'es' ? 'Prueba del banner' : 'Banner test'} · SalsaCoach</title>\n<meta name="robots" content="noindex">\n<link rel="stylesheet" href="/banner/banner.css">\n<style>:root{--bg:#17121c;--surface:#221b2a;--text:#f7f1e8;--muted:#ac9fbb;--timing:#57bcec;--gold:#ffc94b;--border:#3e3349}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}.wrap{max-width:1020px;margin:0 auto;padding:0 20px}header{padding:18px 0;font-weight:800;letter-spacing:3px;color:var(--gold)}header span{color:#ff6b4a}main p{color:var(--muted)}</style>\n</head>\n<body>\n<div class="wrap">\n<header>SALSA<span>COACH</span></header>\n<main>\n${readFileSync(bannerDir + snippet, 'utf8')}\n<p>${lang === 'es' ? 'El resto de la portada sigue aquí.' : 'The rest of the homepage continues here.'}</p>\n</main>\n</div>\n<script src="/banner/banner.js" defer></script>\n</body>\n</html>\n`;
  writeFileSync(site + 'test-home.html', testPage('en', 'banner.html'));
  writeFileSync(site + 'test-home-es.html', testPage('es', 'banner-es.html'));
}

const size = {
  js: js.length, jsGzip: gzipSync(js, { level: 9 }).length, practiceJs: pjs.length, practiceJsGzip: gzipSync(pjs, { level: 9 }).length, css: css.length,
  page: readFileSync(here + 'dist/index.html').length, pageGzip: gzipSync(readFileSync(here + 'dist/index.html'), { level: 9 }).length,
  practicePage: readFileSync(here + 'dist/practice.html').length, practicePageGzip: gzipSync(readFileSync(here + 'dist/practice.html'), { level: 9 }).length,
  reviewArtifact: readFileSync(here + 'dist/review-artifact.html').length,
  assets: assetBytes,
};
writeFileSync(here + 'dist/size.json', JSON.stringify(size, null, 2) + '\n');
console.log(size);
