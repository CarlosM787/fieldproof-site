// Local preview that serves the site like Cloudflare Workers Static Assets does in production:
// html_handling "none" + the 200 rewrites and 301s in _redirects. Not deployed (scripts/ is skipped by cf-assets).
//   node scripts/dev-server.mjs [port]      then open http://127.0.0.1:8791/
// Analytics stays off here (analytics.js only runs on talkestimate.com).
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const PORT = Number(process.argv[2] || 8791);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.ico': 'image/x-icon' };

const rules = readFileSync(path.join(ROOT, '_redirects'), 'utf8').split(/\r?\n/)
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => { const [from, to, code] = l.split(/\s+/); return { from, to, code: Number(code || 302) }; });

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let p = decodeURIComponent(url.pathname);
  const rule = rules.find((r) => r.from === p);
  if (rule && rule.code !== 200) { res.writeHead(rule.code, { Location: rule.to }); res.end(); return; }
  if (rule) p = rule.to;
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || /[\\/]\.|[\\/](scripts|node_modules)[\\/]/.test(file.slice(ROOT.length))) { res.writeHead(404); res.end('not found'); return; }
  try {
    if (!statSync(file).isFile()) throw new Error('dir');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    try { res.end(readFileSync(path.join(ROOT, '404.html'))); } catch { res.end('not found'); }
  }
}).listen(PORT, '127.0.0.1', () => console.log(`preview: http://127.0.0.1:${PORT}/`));
