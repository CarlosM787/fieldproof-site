'use strict';
/*
 * Shared test harness: launches Chromium with the unpacked extension, the mock
 * Ollama server and a "trap" proxy that records any request that tries to leave
 * 127.0.0.1:11434 (the model) or 127.0.0.1:8765 (the second test website).
 *
 * The panel lives in a CLOSED shadow root, so page scripts (and Playwright
 * selectors) cannot see into it. Tests reach it through the Chrome DevTools
 * Protocol, which can, and click with real (trusted) mouse events.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { createMock } = require('../mock/ollama-mock.js');

const ROOT = path.resolve(__dirname, '..', '..');
const EXT = path.join(ROOT, 'extension');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MODEL_ORIGIN = 'http://127.0.0.1:11434';
const SITE_ORIGIN = 'http://127.0.0.1:8765';

function startTrapProxy() {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push({ t: Date.now(), kind: 'http', method: req.method, url: req.url });
    res.statusCode = 403;
    res.end('blocked by test trap');
  });
  server.on('connect', (req, socket) => {
    hits.push({ t: Date.now(), kind: 'connect', url: req.url });
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, hits })));
}

async function launch(opts) {
  const headless = !(opts && opts.headed);
  // opts.mockPort lets a test run the real Ollama binary on 11434 instead of the mock.
  const mock = createMock({ port: (opts && opts.mockPort) || 11434, sitePort: 8765 });
  await mock.start();
  const trap = await startTrapProxy();
  const udd = fs.mkdtempSync(path.join(ROOT, '_work', 'udd-'));
  const context = await chromium.launchPersistentContext(udd, {
    executablePath: CHROME,
    headless,
    viewport: { width: 1100, height: 850 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      `--proxy-server=http://127.0.0.1:${trap.port}`,
      // Only the model server and the second test site may be reached directly. "<-loopback>"
      // (it must come first) removes Chrome's implicit loopback bypass, so any other port on this
      // machine also lands in the trap.
      '--proxy-bypass-list=<-loopback>;127.0.0.1:11434;localhost:11434;127.0.0.1:8765',
      '--window-size=1100,950',
    ],
  });
  const seen = [];
  context.on('request', (r) => {
    let sw = false;
    try { sw = !!r.serviceWorker(); } catch (_) { sw = false; }
    seen.push({ url: r.url(), method: r.method(), fromServiceWorker: sw, t: Date.now() });
  });
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { predicate: (w) => w.url().startsWith('chrome-extension://'), timeout: 15000 });
  const extId = new URL(sw.url()).host;
  // The options page opens on first install; close it so tests control the tabs.
  // Keep one ordinary tab open first: in headed mode, closing the last tab quits the browser.
  await new Promise((r) => setTimeout(r, 600));
  const keep = await context.newPage();
  for (const p of context.pages()) {
    if (p !== keep && p.url().startsWith('chrome-extension://')) await p.close();
  }
  // Extension service workers stop when idle (in headed mode within a second of install).
  // Re-acquire a live one, waking it with an extension page if needed.
  const isExt = (w) => w.url().startsWith('chrome-extension://' + extId + '/');
  async function liveWorker() {
    let w = context.serviceWorkers().find(isExt);
    if (w) return w;
    const waiter = context.waitForEvent('serviceworker', { predicate: isExt, timeout: 10000 }).catch(() => null);
    const p = await context.newPage();
    await p.goto('chrome-extension://' + extId + '/popup/popup.html');
    w = (await waiter) || context.serviceWorkers().find(isExt);
    await p.close();
    if (!w) throw new Error('could not wake the extension service worker');
    return w;
  }
  async function swEval(fn, arg) {
    for (let i = 0; i < 3; i++) {
      const w = await liveWorker();
      try { return await w.evaluate(fn, arg); }
      catch (e) { if (!/closed|Target/.test(String(e && e.message)) || i === 2) throw e; }
    }
  }
  return {
    context, sw, extId, mock, trap, seen, udd, liveWorker, swEval,
    async close() {
      await context.close().catch(() => {});
      await mock.stop().catch(() => {});
      await new Promise((r) => trap.server.close(r));
      fs.rmSync(udd, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------- CDP helpers

async function cdp(page) {
  if (!page.__cdp) page.__cdp = await page.context().newCDPSession(page);
  return page.__cdp;
}

function findNode(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  const kids = [].concat(node.children || [], node.shadowRoots || [], node.contentDocument ? [node.contentDocument] : []);
  for (const k of kids) {
    const r = findNode(k, pred);
    if (r) return r;
  }
  return null;
}

async function panelRoot(page) {
  const c = await cdp(page);
  const { root } = await c.send('DOM.getDocument', { depth: -1, pierce: true });
  const host = findNode(root, (n) => n.nodeName === 'CARLOS-WRITER-PANEL');
  if (!host || !host.shadowRoots || !host.shadowRoots.length) return null;
  return { c, host, shadow: host.shadowRoots[0] };
}

async function q(page, selector) {
  const r = await panelRoot(page);
  if (!r) return null;
  const { nodeId } = await r.c.send('DOM.querySelector', { nodeId: r.shadow.nodeId, selector });
  return nodeId ? { c: r.c, nodeId } : null;
}

async function call(page, selector, fn) {
  const n = await q(page, selector);
  if (!n) return undefined;
  const { object } = await n.c.send('DOM.resolveNode', { nodeId: n.nodeId });
  const res = await n.c.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn, returnByValue: true });
  return res.result.value;
}

const text = (page, selector) => call(page, selector, 'function(){ return this.textContent; }');
const visible = (page, selector) => call(page, selector, 'function(){ let e=this; while(e){ if(e.hidden) return false; e=e.parentElement; } const r=this.getBoundingClientRect(); return r.width>0 && r.height>0; }');
const disabled = (page, selector) => call(page, selector, 'function(){ return !!this.disabled; }');
const count = async (page, selector) => (await call(page, '.panel', 'function(){ return this.getRootNode().querySelectorAll(' + JSON.stringify(selector) + ').length; }')) || 0;

async function click(page, selector) {
  const n = await q(page, selector);
  if (!n) throw new Error('panel element not found: ' + selector);
  const { model } = await n.c.send('DOM.getBoxModel', { nodeId: n.nodeId });
  const qd = model.content;
  const x = (qd[0] + qd[2] + qd[4] + qd[6]) / 4;
  const y = (qd[1] + qd[3] + qd[5] + qd[7]) / 4;
  await page.mouse.click(x, y);
}

async function waitFor(fn, timeout, label) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < (timeout || 10000)) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error('timeout waiting for ' + (label || 'condition') + (last instanceof Error ? ': ' + last.message : ''));
}

async function panelExists(page) {
  return !!(await panelRoot(page));
}

// Chromium's own background services (network time, autofill field hints, account and
// component checks). They show up in a plain browser with no extension loaded too
// (tests/e2e/baseline-browser-noise.js records that). The extension's own traffic is checked
// separately: CSP, a fetch() log inside the service worker, and the mock server's log.
const BROWSER_INTERNAL = [
  /^http:\/\/clients2\.google\.com\/time\/1\/current\?/,
  /^(content-autofill\.googleapis\.com|accounts\.google\.com|www\.google\.com|redirector\.gvt1\.com|android\.clients\.google\.com|clients2\.google\.com|update\.googleapis\.com|optimizationguide-pa\.googleapis\.com|safebrowsing\.googleapis\.com):443$/,
];
function extensionTrapHits(hits) {
  return hits.filter((h) => !BROWSER_INTERNAL.some((re) => re.test(h.url)));
}

module.exports = {
  BROWSER_INTERNAL, extensionTrapHits,
  ROOT, EXT, MODEL_ORIGIN, SITE_ORIGIN, launch, cdp, panelRoot, q, call, text, visible, disabled, count, click, waitFor, panelExists,
};
