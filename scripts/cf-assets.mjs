// Prepares this static site for Cloudflare Workers Static Assets (the site files live at the repo root).
//   node scripts/cf-assets.mjs prod     -> .cf-dist     (production: indexable)
//   node scripts/cf-assets.mjs staging  -> .cf-staging  (workers.dev test address: noindex + robots Disallow)
import { cpSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const mode = process.argv[2] === 'staging' ? 'staging' : 'prod';
const OUT = mode === 'staging' ? '.cf-staging' : '.cf-dist';
const SKIP = new Set(['.git', '.github', '.cf-dist', '.cf-staging', '.wrangler', 'scripts', 'node_modules', 'CNAME', 'README.md', 'wrangler.jsonc', 'wrangler.staging.jsonc', '.gitignore', 'package.json']);
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT);
for (const f of readdirSync('.')) if (!SKIP.has(f)) cpSync(f, path.join(OUT, f), { recursive: true });
const hp = path.join(OUT, '_headers');
const base = existsSync('_headers') ? readFileSync('_headers', 'utf8') : '';
writeFileSync(hp, base + (mode === 'staging' ? '\n/*\n  X-Robots-Tag: noindex, nofollow\n' : ''));
if (mode === 'staging') writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`cf-assets: ${mode} -> ${OUT}`);
