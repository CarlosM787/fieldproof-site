'use strict';
/*
 * Real keyboard path. Headed Chromium under Xvfb, keys sent through the X server
 * (XTEST), exactly like a physical keyboard. This is the only way the browser's
 * extension-shortcut handling runs in automation: DevTools key events never reach
 * browser accelerators.
 *
 * The test page is served from 127.0.0.1:8765, which the extension's host
 * permissions do NOT cover, so injection works only through the activeTab grant
 * the keyboard shortcut gives. The test first proves injection fails without it.
 *
 * Run: xvfb-run -a -s "-screen 0 1280x1000x24" node tests/e2e/run-keyboard.js
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const H = require('../helpers/harness.js');

const PYLIB = process.env.PYLIB || path.join(H.ROOT, '_work', 'pylib');
const SHOTS = path.join(H.ROOT, 'media', 'screenshots');
const results = [];
let env;

function xkey(title, chord) {
  return execFileSync('python3', [path.join(__dirname, '..', 'helpers', 'xkey.py'), title, chord], { env: Object.assign({}, process.env, { PYTHONPATH: PYLIB }) }).toString().trim();
}

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('PASS', name, '(' + (Date.now() - t0) + ' ms)'); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, error: String(e && e.stack || e) }); console.log('FAIL', name, '\n   ', String(e && e.message || e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'not equal') + '\n      expected: ' + JSON.stringify(b) + '\n      actual:   ' + JSON.stringify(a)); }
async function mockLog() { return (await fetch(H.MODEL_ORIGIN + '/__log')).json(); }
async function mockReset() { await fetch(H.MODEL_ORIGIN + '/__reset', { method: 'POST' }); }

(async () => {
  if (!process.env.DISPLAY) throw new Error('Run under Xvfb: xvfb-run -a node tests/e2e/run-keyboard.js');
  env = await H.launch({ headed: true });
  await env.swEval(async () => { await chrome.storage.local.set({ settings: { ollamaUrl: 'http://127.0.0.1:11434' } }); });
  const page = await env.context.newPage();
  for (const p of env.context.pages()) if (p !== page) await p.close();
  const url = H.SITE_ORIGIN + '/fixtures/editors.html';
  await page.goto(url);
  await page.bringToFront();
  const TITLE = 'Carlos Writer test page';

  await test('shortcuts are assigned: Alt+Shift+M menu, Alt+Shift+R proofread, Alt+Shift+V Carlos', async () => {
    const cmds = await env.swEval(() => chrome.commands.getAll());
    const map = Object.fromEntries(cmds.map((c) => [c.name, c.shortcut]));
    eq(map['cw-menu'], 'Alt+Shift+M');
    eq(map['cw-proofread'], 'Alt+Shift+R');
    eq(map['cw-carlos'], 'Alt+Shift+V');
  });

  await test('without a shortcut or click, the extension cannot touch this site (no broad host access)', async () => {
    const r = await env.swEval(async (u) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => 1 }); return 'injected'; }
      catch (e) { return 'refused: ' + e.message; }
    }, url);
    assert(/^refused/.test(r), r);
  });

  await test('real keystroke Alt+Shift+R: panel, Replace, then a real Ctrl+Z undoes it', async () => {
    await mockReset();
    await page.evaluate(() => { const e = document.querySelector('#ta'); e.focus(); e.setSelectionRange(0, e.value.length); });
    const before = await page.$eval('#ta', (e) => e.value);
    const t0 = Date.now();
    xkey(TITLE, 'Alt_L+Shift_L+r');
    await H.waitFor(async () => (await H.visible(page, '.result')) && (await H.text(page, '.sugg')), 8000, 'result after keystroke');
    const ms = Date.now() - t0;
    eq(await H.text(page, '.sugg'), 'I receive the mail every morning because I like paper.');
    await page.screenshot({ path: path.join(SHOTS, 'keyboard-headed-panel.png') });
    await H.click(page, '.replace');
    await H.waitFor(async () => (await page.$eval('#ta', (e) => e.value)) !== before, 3000, 'replaced');
    await H.waitFor(async () => !(await H.panelExists(page)), 4000, 'panel closed');
    xkey(TITLE, 'Control_L+z');
    await H.waitFor(async () => (await page.$eval('#ta', (e) => e.value)) === before, 3000, 'undo via real Ctrl+Z');
    const chats = (await mockLog()).filter((r) => r.url === '/api/chat');
    eq(chats.length, 1, 'one model request');
    eq(chats[0].origin, null, 'Origin header removed before it reached the model server');
    console.log('    keystroke → result (mock model):', ms, 'ms');
  });

  await test('real keystroke Alt+Shift+M then "3": menu runs "More casual"; Cancel leaves the text', async () => {
    await page.evaluate(() => { const e = document.querySelector('#ta-casual'); e.focus(); e.setSelectionRange(0, e.value.length); });
    const before = await page.$eval('#ta-casual', (e) => e.value);
    xkey(TITLE, 'Alt_L+Shift_L+m');
    await H.waitFor(async () => (await H.count(page, '.choose button')) === 6, 5000, 'chooser');
    xkey(TITLE, '3');
    await H.waitFor(async () => (await H.visible(page, '.result')) && (await H.text(page, '.sugg')), 8000, 'result');
    eq(await H.text(page, '.sugg'), "Hey team, I'm writing to confirm that I can't attend. Thanks");
    await H.click(page, '.cancel');
    await H.waitFor(async () => !(await H.panelExists(page)), 3000, 'closed');
    eq(await page.$eval('#ta-casual', (e) => e.value), before, 'unchanged');
  });

  await test('real keystroke Alt+Shift+V: "Sound like Carlos"', async () => {
    await page.evaluate(() => { const e = document.querySelector('#ta-hype'); e.focus(); e.setSelectionRange(0, e.value.length); });
    xkey(TITLE, 'Alt_L+Shift_L+v');
    await H.waitFor(async () => (await H.visible(page, '.result')) && (await H.text(page, '.sugg')), 8000, 'result');
    eq(await H.text(page, '.sugg'), 'I shipped 4 products. Here is what that looked like.');
    xkey(TITLE, 'Escape');
    await H.waitFor(async () => !(await H.panelExists(page)), 3000, 'Esc closed the panel');
  });

  await test('real keystroke on a password field: refused, nothing sent', async () => {
    await mockReset();
    await page.evaluate(() => { const e = document.querySelector('#pw'); e.focus(); e.select(); });
    xkey(TITLE, 'Alt_L+Shift_L+r');
    await H.waitFor(async () => /does not read passwords/.test((await H.text(page, '.msg')) || ''), 5000, 'refusal');
    await page.waitForTimeout(300);
    eq((await mockLog()).filter((r) => r.url === '/api/chat').length, 0, 'no model request');
    await H.click(page, '.cancel');
  });

  await test('no request left the machine during the keyboard run', async () => {
    eq(H.extensionTrapHits(env.trap.hits).length, 0, JSON.stringify(H.extensionTrapHits(env.trap.hits).slice(0, 5)));
  });

  const summary = { when: new Date().toISOString(), mode: 'headed Chromium under Xvfb, XTEST keystrokes', passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results, trapHits: env.trap.hits };
  fs.writeFileSync(path.join(H.ROOT, 'tests', 'results', 'e2e-keyboard.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
  await env.close();
  process.exit(summary.failed ? 1 : 0);
})().catch(async (e) => { console.error('HARNESS ERROR', e); if (env) await env.close(); process.exit(2); });
