// Encodes the banner poster (WebP + AVIF) from a rendered hero frame, and records the media facts.
//   node tools/poster.mjs <frame.png> <mediaDir>
import sharp from 'sharp';
import { writeFileSync, statSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [src, dir] = process.argv.slice(2);
await sharp(src).webp({ quality: 80, effort: 6 }).toFile(dir + '/hero-poster.webp');
await sharp(src).avif({ quality: 52, effort: 6 }).toFile(dir + '/hero-poster.avif');
const FF = '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const probe = (f) => { try { execFileSync(FF, ['-hide_banner', '-i', f], { stdio: 'pipe' }); } catch (e) { return String(e.stderr); } return ''; };
const info = probe(dir + '/hero-loop.mp4') + probe(dir + '/hero-loop.webm');
const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
const meta = {
  seconds: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : null,
  audioStreams: (info.match(/Stream #\d+:\d+[^\n]*Audio/g) || []).length,
  size: '720x720', fps: 30, loop: 'one On1 8-count at 150 BPM; frame 96 = frame 0, so it loops without a seam',
  bytes: Object.fromEntries(['hero-poster.webp', 'hero-poster.avif', 'hero-loop.webm', 'hero-loop.mp4'].map((f) => [f, statSync(dir + '/' + f).size])),
  source: 'rendered from the real scene through the #render hooks (qa/hero.mjs), camera yaw 1.2 rad',
};
writeFileSync(dir + '/media.json', JSON.stringify(meta, null, 2) + '\n');
console.log(meta);
