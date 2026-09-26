// Shared test harness: serves dist/ on localhost and opens Chromium with software WebGL.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';

const require = createRequire(process.env.PW_ROOT || '/opt/node22/lib/node_modules/');
export const { chromium } = require('playwright');
export const here = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
export const bytes = { total: 0, byFile: {} };
export async function serve(root = join(here, 'dist'), headers = {}) {
  const server = createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const p = join(root, u.replace(/\/$/, '/index.html'));
    // byte ranges for video (Chromium asks for them); whole-file answers are fine for everything else
    let body = null;
    try { body = readFileSync(p); } catch { /* 404 */ }
    if (!body) { res.writeHead(404); res.end(); return; }
    bytes.total += body.length; bytes.byFile[u] = body.length;
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', ...headers }); res.end(body);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}
export async function launch() {
  return chromium.launch({
    executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1'],
  });
}
// Google Fonts from a local cache (fetched earlier with curl through the egress proxy)
export async function fonts(ctx) {
  const FC = process.env.FONTCACHE;
  if (!FC) return;
  const cssText = readFileSync(join(FC, 'fonts.css'), 'utf8');
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: cssText, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const f = join(FC, createHash('md5').update(r.request().url() + '\n').digest('hex').slice(0, 12) + '.woff2');
    try { r.fulfill({ contentType: 'font/woff2', body: readFileSync(f), headers: { 'access-control-allow-origin': '*' } }); } catch { r.fulfill({ status: 404, body: '' }); }
  });
}
