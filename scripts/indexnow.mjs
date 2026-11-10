// IndexNow pings for the URLs a release actually changes (G W-11, same tool as carlosmoralesjr.com and mysalsacoach.com (WO-20261106-08 E4)). Owner-run, two steps:
//
//   node scripts/indexnow.mjs plan <host>   BEFORE `wrangler deploy`, after cf-assets prod.
//        Compares every URL in .cf-dist/sitemap.xml with the LIVE site, byte for byte, and lists
//        changed + new URLs, plus URLs that are in the live sitemap but no longer in the new one (deleted).
//        Writes .indexnow-plan.json. Contacts only the site itself.
//   node scripts/indexnow.mjs send <host>   AFTER the deploy and its live check, and only on a release
//        Carlos approved. POSTs the planned URLs once to api.indexnow.org and prints the HTTP status
//        (200/202 = accepted) for the receipt. Refuses if the plan is empty, stale (>6 h) or for another host.
//   node scripts/indexnow.mjs plan <host> --list <file>   one-off: plan an explicit URL list (must be in the sitemap).
//   add --dry-run to `send` to print the request without sending it.
//
// The key is public by design (served at /<key>.txt by cf-assets prod); it is not a secret.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const [cmd, host, ...flags] = process.argv.slice(2);
if (!['plan', 'send'].includes(cmd) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host || '')) {
  console.error('usage: node scripts/indexnow.mjs plan|send <host> [--dry-run]'); process.exit(2);
}
const OUT = '.cf-dist'; const PLAN = '.indexnow-plan.json';
const key = readFileSync('indexnow-key.txt', 'utf8').trim();
if (!/^[a-f0-9]{32,128}$/.test(key)) { console.error('indexnow-key.txt must hold 32-128 hex characters'); process.exit(2); }
const origin = `https://${host}`;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].trim());

function fileFor(url) {
  let p = decodeURIComponent(new URL(url).pathname);
  const c = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'];
  return c.map((x) => path.join(OUT, x)).find((f) => existsSync(f) && statSync(f).isFile());
}

if (cmd === 'plan' && flags[0] === '--list') {
  // One-off: plan an explicit list (one URL per line), e.g. pages a release already took live. Each must be in the sitemap.
  const next = locs(readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8'));
  const list = readFileSync(flags[1], 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((u) => !next.includes(u) || new URL(u).host !== host);
  if (bad.length) { console.error('not in the sitemap or not this host:\n  ' + bad.join('\n  ')); process.exit(1); }
  writeFileSync(PLAN, JSON.stringify({ host, at: new Date().toISOString(), listed: list, urlList: list }, null, 2) + '\n');
  console.log(`indexnow plan ${host}: ${list.length} listed URL(s)`); process.exit(0);
}
if (cmd === 'plan') {
  const next = locs(readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8')).filter((u) => new URL(u).host === host);
  const liveRes = await fetch(`${origin}/sitemap.xml`);
  const live = liveRes.ok ? locs(await liveRes.text()) : [];
  const changed = [], added = [], same = [], unknown = [];
  for (const u of next) {
    const f = fileFor(u); if (!f) { unknown.push(u); continue; }
    if (!live.includes(u)) { added.push(u); continue; }
    const r = await fetch(u, { redirect: 'follow' });
    const liveBody = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    (liveBody && sha(liveBody) === sha(readFileSync(f)) ? same : changed).push(u);
  }
  const deleted = live.filter((u) => !next.includes(u));
  const urlList = [...changed, ...added, ...deleted];
  writeFileSync(PLAN, JSON.stringify({ host, at: new Date().toISOString(), changed, added, deleted, unknown, urlList }, null, 2) + '\n');
  console.log(`indexnow plan ${host}: ${changed.length} changed, ${added.length} new, ${deleted.length} deleted, ${same.length} unchanged${unknown.length ? `, ${unknown.length} not in build (ignored)` : ''}`);
  urlList.forEach((u) => console.log('  ' + u));
  process.exit(0);
}

// send
if (!existsSync(PLAN)) { console.error('no plan: run `plan` before the deploy'); process.exit(1); }
const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
if (plan.host !== host) { console.error(`plan is for ${plan.host}, not ${host}`); process.exit(1); }
if (Date.now() - Date.parse(plan.at) > 6 * 3600e3) { console.error('plan is older than 6 h: re-run `plan`'); process.exit(1); }
if (!plan.urlList.length) { console.log('indexnow: nothing changed, nothing sent'); process.exit(0); }
const body = { host, key, keyLocation: `${origin}/${key}.txt`, urlList: plan.urlList.slice(0, 10000) };
if (flags.includes('--dry-run')) { console.log('indexnow dry run, would POST to https://api.indexnow.org/indexnow:'); console.log(JSON.stringify(body, null, 2)); process.exit(0); }
const k = await fetch(body.keyLocation); const kt = k.ok ? (await k.text()).trim() : '';
if (kt !== key) { console.error(`key file not live at ${body.keyLocation} (HTTP ${k.status}); deploy first`); process.exit(1); }
const res = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
console.log(`indexnow ${host}: HTTP ${res.status} ${res.statusText} for ${body.urlList.length} URL(s) at ${new Date().toISOString()}${[200, 202].includes(res.status) ? ' (accepted)' : ''}`);
writeFileSync(PLAN, JSON.stringify({ ...plan, sent: { at: new Date().toISOString(), status: res.status } }, null, 2) + '\n');
process.exit([200, 202].includes(res.status) ? 0 : 1);
