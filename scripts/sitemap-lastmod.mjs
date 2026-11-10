// sitemap.xml <lastmod> from git (G W-08): each URL gets the date of the last commit that changed its page file.
// Run it in the git worktree as the last step before the release commit (the deploy builds from a git archive, which
// has no history, so the dates have to be in the committed sitemap.xml).
//   node scripts/sitemap-lastmod.mjs           rewrite <lastmod> values (a file with uncommitted changes gets today)
//   node scripts/sitemap-lastmod.mjs --check   exit 1 if any <lastmod> differs from git
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const today = () => { const d = new Date(); const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

export function fileFor(loc) {
  const p = decodeURIComponent(new URL(loc).pathname);
  const c = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html'];
  return c.map((x) => x.replace(/^\//, '')).find((f) => existsSync(path.join(ROOT, f)) && statSync(path.join(ROOT, f)).isFile());
}

const check = process.argv.includes('--check');
const sp = path.join(ROOT, 'sitemap.xml');
const raw = readFileSync(sp, 'utf8');
const crlf = raw.includes('\r\n');
let xml = raw.replace(/\r\n/g, '\n');
const dirty = new Set(git('status', '--porcelain').split('\n').filter(Boolean).map((l) => l.slice(3).trim()));
let diffs = 0;
xml = xml.replace(/<url>([\s\S]*?)<\/url>/g, (block, inner) => {
  const loc = /<loc>([^<]+)<\/loc>/.exec(inner)[1].trim();
  const f = fileFor(loc);
  if (!f) throw new Error(`no file for ${loc}`);
  const date = dirty.has(f) ? today() : git('log', '-1', '--format=%cs', '--', f);
  const cur = /<lastmod>([^<]+)<\/lastmod>/.exec(inner)?.[1];
  if (cur !== date) { diffs++; if (check) console.error(`${loc}: sitemap ${cur}, git ${date}`); }
  return block.replace(/<lastmod>[^<]+<\/lastmod>/, `<lastmod>${date}</lastmod>`);
});
if (check) { console.log(diffs ? `${diffs} lastmod value(s) out of date` : 'sitemap lastmod: all match git'); process.exit(diffs ? 1 : 0); }
writeFileSync(sp, crlf ? xml.replace(/\n/g, '\r\n') : xml);
console.log(`sitemap lastmod: ${diffs} value(s) updated`);
