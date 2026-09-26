'use strict';
/*
 * Baseline: the same Chromium build and flags, the same trap proxy and test pages,
 * but NO extension. Records which hosts Chromium itself tries to reach, so the
 * extension runs can tell browser background traffic from extension traffic.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createMock } = require('../mock/ollama-mock.js');
const ROOT = path.resolve(__dirname, '..', '..');

(async () => {
  const mock = createMock({ port: 11434, sitePort: 8765 });
  await mock.start();
  const hits = [];
  const trap = http.createServer((q, s) => { hits.push(q.url); s.statusCode = 403; s.end(); });
  trap.on('connect', (q, sock) => { hits.push(q.url); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise((r) => trap.listen(0, '127.0.0.1', r));
  const udd = fs.mkdtempSync(path.join(ROOT, '_work', 'udd-base-'));
  const ctx = await chromium.launchPersistentContext(udd, {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: [`--proxy-server=http://127.0.0.1:${trap.address().port}`, '--proxy-bypass-list=<-loopback>;127.0.0.1:11434;localhost:11434;127.0.0.1:8765'],
  });
  const page = await ctx.newPage();
  for (const f of ['editors.html', 'csp.html', 'frame.html', 'editors.html']) {
    await page.goto('http://127.0.0.1:11434/fixtures/' + f);
    const ta = page.locator('textarea').first();
    if (await ta.count()) { await ta.click(); await page.keyboard.type(' x'); }
    await page.waitForTimeout(4000);
  }
  await ctx.close();
  await mock.stop();
  trap.close();
  fs.rmSync(udd, { recursive: true, force: true });
  const hosts = [...new Set(hits.map((u) => u.replace(/\?.*$/, '')))].sort();
  fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'baseline-browser-noise.json'), JSON.stringify({ when: new Date().toISOString(), note: 'plain Chromium, no extension', hosts, hits }, null, 2));
  console.log('baseline (no extension) hosts Chromium tried to reach:', hosts);
})();
