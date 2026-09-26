// Writes QA_RESULTS.md from the evidence files, so every number in it comes from a measurement:
//   evidence/qa-results.json (qa/qa.mjs), evidence/ab-timing.json (qa/ab.mjs),
//   ../lh/results/summary.json (Lighthouse), ../media/media.json + demo meta (media sizes).
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
const here = new URL('..', import.meta.url).pathname;
const J = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const q = J(here + 'evidence/qa-results.json'), ab = J(here + 'evidence/ab-timing.json');
const lh = J(here + '../lh/results/summary.json'), media = J(here + '../media/media.json');
const demo = J(here + '../media/demo.json');
const d = q.data, R = q.results;
const kb = (b) => (b / 1000).toFixed(1) + ' KB', mb = (b) => (b / 1e6).toFixed(2) + ' MB'; // decimal, like the budgets
const line = (r) => `| ${r.ok ? 'PASS' : '**FAIL**'} | ${r.name.replace(/\|/g, '/')} |`;
const p2 = R.slice(0, 33), p3 = R.slice(33);
const out = [];
out.push('# QA results: SalsaCoach Dancers, phase three', '');
out.push(`Run: ${q.when.replace('T', ' ').slice(0, 19)} UTC, \`node qa/qa.mjs\` (headless Chromium 141, software WebGL through SwiftShader, 4 shared CPUs). **VERIFIED** in this lane; not on a phone.`, '');
out.push(`**${q.passed} of ${q.total} checks pass**: the 33 phase-two checks (${q.phase2.passed}/33, unchanged code) and ${p3.length} new checks (${p3.filter((r) => r.ok).length}/${p3.length}).`, '');
const fails = R.filter((r) => !r.ok);
if (fails.length) out.push('Failures in this run:', '', ...fails.map((r) => `- ${r.name}: \`${JSON.stringify(r.detail).slice(0, 300)}\``), '');
out.push('Run history today, for honesty:', '');
out.push('- about 09:25 UTC, first run of the phase-two suite on the new build: 32/33. The audio-clock check failed (max lag 330 ms, allowed about 255 ms) while other lanes loaded the machine.');
out.push('- 14:04 UTC: 71/73. The audio-clock check failed (277 ms vs 254 ms allowed). A new slow-motion check also failed on its own over-strict tolerance, since fixed to 0.002 beat (1.6 ms).');
out.push('- 14:23 UTC: 72/73, all 33 phase-two checks passing. A new step-mode check failed because it did not allow the correct wrap from count 8 to count 1; the check was fixed, not the code.');
out.push('- 14:26 UTC: 73/73.');
out.push('- 14:31 UTC: 73/73 again after the download-size wording was corrected (this file).');
out.push('');
out.push('The audio-clock check allows at most two median frames plus 5 ms, so one slow frame fails it. In software WebGL on a shared machine, frame pacing is set by the machine, not the page.');
out.push('- A same-time A/B gave both builds a 299 ms median frame interval.');
out.push('- Under load, the phase-two build itself failed this check in 2 of 3 runs (09:38 UTC).');
out.push('- The load-independent version (each count drawn on the first frame after it is heard) passes at half speed.');
out.push('- A real-phone test is the measurement that counts; it is on the human test card.', '');
out.push('## Numbers', '');
out.push('| What | Phase three | Phase two | Note |', '|---|---|---|---|');
const p2d = { phone: 1139093, desktop: 2180677, pose: 0.044 };
out.push(`| Phone first load, explore page (lite tier) | ${mb(d.load_phone.bytes)} (${d.load_phone.bytes} B, ${d.load_phone.files} files) | ${mb(p2d.phone)} | budget 1.2 MB; same method (local server bytes, fonts excluded) |`);
out.push(`| Desktop first load (full tier) | ${mb(d.load_desktop.bytes)} | ${mb(p2d.desktop)} | |`);
if (d.practiceLazy) out.push(`| Practice page first load, before Start | ${kb(d.practiceLazy.firstLoadBytes)}, 0 avatar or texture requests | – | 3D loads only on the visitor's tap (${d.practiceLazy.requestsAfterStart} files after Start) |`);
out.push(`| Pose, both dancers (qa.mjs bench) | ${d.poseCpuMs.median} ms median, ${d.poseCpuMs.p95} ms p95 | ${p2d.pose} ms (phase-two record) | budget "well under 1 ms" |`);
if (ab) {
  const s = ab.summary;
  out.push(`| Pose, same-machine A/B, desktop | ${s['phase3 desktop'].poseMs} ms | ${s['phase2 desktop'].poseMs} ms | ratio ${ab.ratios.poseDesktop}× (qa/ab.mjs, interleaved) |`);
  out.push(`| Pose, same-machine A/B, phone emulation | ${s['phase3 phone'].poseMs} ms | ${s['phase2 phone'].poseMs} ms | ratio ${ab.ratios.posePhone}× |`);
  out.push(`| Frame (pose + render + GPU finish), desktop | ${s['phase3 desktop'].frameMs} ms | ${s['phase2 desktop'].frameMs} ms | ratio ${ab.ratios.frameDesktop}×; software WebGL, relative only |`);
  out.push(`| Frame, phone emulation (DPR 1.5 cap) | ${s['phase3 phone'].frameMs} ms | ${s['phase2 phone'].frameMs} ms | ratio ${ab.ratios.framePhone}× |`);
  out.push(`| Draw calls / triangles | ${s['phase3 desktop'].drawCalls} / ${s['phase3 desktop'].triangles} | ${s['phase2 desktop'].drawCalls} / ${s['phase2 desktop'].triangles} | +shadows, badges, weight dots |`);
}
out.push(`| Audio clock: count drawn after it is heard | median ${d.audioSync.lagMsMedian.toFixed(0)} ms, max ${d.audioSync.lagMsMax.toFixed(0)} ms (frame ${d.audioSync.frameMsMedian.toFixed(0)} ms) | median 67, max 191 (frame 123) | software WebGL frame rate; not a phone number |`);
if (d.slowMotion) out.push(`| Half speed: band tempo, pose vs heard position | ${d.slowMotion.bandBpm} BPM, max error ${d.slowMotion.posErrBeats.toExponential(1)} beat | – | ${d.slowMotion.counts} counts; each drawn on its own first frame: ${d.slowMotion.withinOwnFrame} |`);
if (d.stepMode) out.push(`| Step by step: one press | ${d.stepMode.from} → ${d.stepMode.to}, monotonic, lands with its cue | – | beat ${d.stepMode.beat.toFixed(2)} s |`);
out.push(`| Touchdown vs count, all patterns | ${(d.on1.touchErrBeats[0] * 400).toFixed(0)} ms at 150 BPM (never late) | same | ball within 1 mm |`);
out.push(`| Planted-foot drift | ${d.on1.plantedDriftMm} mm | 0 mm | |`);
if (d.realism) out.push(`| Toe tip below floor / toe lift while ball down | ${d.realism.on1.tipBelowMm} mm / ${d.realism.on1.tipLiftWhileDownMm} mm | not measured | max ankle roll ${d.realism.on1.rollMaxDeg}°, 0° on the weighted foot |`);
if (d.voiceOnsetsMs) { const f = Object.values(d.voiceOnsetsMs).flat(); out.push(`| Count voice: word reaches full level vs beat | worst ${Math.max(...f.map(Math.abs)).toFixed(0)} ms (EN/ES × 100/150/200 BPM) | – | offline render; intelligibility unjudged |`); }
if (d.judge) out.push(`| Find the 1 judge vs Count Lab code | ${d.judge.identical}/${d.judge.taps} identical verdicts | – | code extracted from count-lab/src/app.js |`);
if (d.engine) out.push(`| Count engine fingerprint | sha256 ${d.engine.hash.slice(0, 12)}… | same | 21 parts of src/choreo.js |`);
out.push('');
if (media) {
  const b = media.bytes;
  out.push('## Hero and banner', '');
  out.push(`- Poster 720×720: WebP ${kb(b['hero-poster.webp'])}, AVIF ${kb(b['hero-poster.avif'])} (budget 60 KB).`);
  out.push(`- Loop: ${media.seconds} s, ${media.audioStreams} audio streams: WebM ${kb(b['hero-loop.webm'])}, MP4 ${kb(b['hero-loop.mp4'])} (budget 300 KB each).`);
  if (d.banner) out.push(`- Component, gzipped: HTML ${d.banner.bytes.gzip.html} B, CSS ${d.banner.bytes.gzip.css} B, JS ${d.banner.bytes.gzip.js} B. First paint needs the component plus one poster (WebP ${kb(b['hero-poster.webp'])} or AVIF ${kb(b['hero-poster.avif'])}); the loop comes later, only on screen.`);
}
if (lh) {
  const s = lh.summary, row = (k, n) => s[k] && s[k].runs ? `| ${n} | ${(s[k].lcpMs / 1000).toFixed(2)} s | ${(s[k].fcpMs / 1000).toFixed(2)} s | ${s[k].cls} | ${s[k].tbtMs} ms | ${s[k].perf} | ${s[k].a11y} | ${kb(s[k].bytes)} | ${s[k].runs} |` : `| ${n} | not measured | | | | | | | 0 |`;
  out.push('', `Lighthouse ${lh.tool.replace('Lighthouse ', '')}. Lab numbers on a local build, not field data.`, '');
  out.push('| Page | LCP | FCP | CLS | TBT | Perf | A11y | Bytes | Runs |', '|---|---|---|---|---|---|---|---|---|');
  out.push(row('test-home.html', 'Banner test page (system fonts)'), row('home-a.html', 'Homepage copy, no banner'), row('home-b.html', 'Homepage copy + banner'));
  out.push('', 'The homepage copies come from `web/authority-v1` (`website/index.html`). In both, the Cloudflare beacon was removed. Google Fonts cannot load in this container, so both copies ran without web fonts; the comparison is relative.');
  const el = (x) => (!x ? 'unknown' : x.startsWith('<img') ? 'the poster image' : x.startsWith('<video') ? 'the loop video' : x.startsWith('<h1') ? 'the page headline (h1)' : 'another element');
  if (s['test-home.html']) out.push('', `LCP element in the first run: banner test page, ${el(s['test-home.html'].lcpElement)}; homepage copies, ${el(s['home-a.html'] && s['home-a.html'].lcpElement)} in both (the banner sits below the hero, so it never becomes the LCP element there).`);
}
if (d.csp) out.push('', `CSP: under the live \`_headers\` policy the staged route's dancers fail (\`${d.csp.live.violations.join(', ')}\`); with \`'wasm-unsafe-eval'\` added to \`script-src\` they load with ${d.csp['live+wasm'].violations.length} violations.`);
if (demo) out.push('', '## Demo video', '', `- \`media/practice-demo.mp4\`: ${demo.seconds.toFixed(1)} s, ${demo.width}×${demo.height}, ${kb(demo.bytes)}, H.264 + AAC. The band and robot voice are rendered offline with the page's own code, and the taps are synthetic, scored by the real judge. \`media/practice-demo.jpg\` is its poster.`);
out.push('', '## All checks', '', '| Result | Check |', '|---|---|', '| | **Phase two (33, unchanged)** |', ...p2.map(line), '| | **Phase three (new)** |', ...p3.map(line), '');
out.push('Screenshots in `evidence/`: `desktop-page.jpg`, `phone-page.jpg`, `phone-page-es.jpg`, `phone-nojs.jpg`, `desktop-canvas.jpg`, `phone-canvas.jpg`, and `practice-{phone,desktop}-{en,es}.jpg`. Before/after images are in `evidence/changes/`.', '');
writeFileSync(here + 'QA_RESULTS.md', out.join('\n'));
console.log('QA_RESULTS.md', q.passed + '/' + q.total);
