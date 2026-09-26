'use strict';
/*
 * End-to-end tests, headless Chromium with the unpacked extension loaded.
 *
 * Trigger path: the tests call the service worker's startFlow(), the same
 * function the keyboard commands and the right-click menu call. (Headless
 * Chromium does not deliver keyboard shortcuts to extensions; the real keyboard
 * path is covered by run-keyboard.js under Xvfb.) Test pages are served from
 * 127.0.0.1:11434, which the extension's host permission covers, standing in for
 * the activeTab grant a real shortcut or menu click gives.
 */
const path = require('path');
const fs = require('fs');
const H = require('../helpers/harness.js');

const SHOTS = path.join(H.ROOT, 'media', 'screenshots');
const RESULTS = path.join(H.ROOT, 'tests', 'results');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RESULTS, { recursive: true });

const results = [];
const timings = [];
let env;
let seq = 0;

async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log('PASS', name, '(' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(e && e.stack || e) });
    console.log('FAIL', name, '\n   ', String(e && e.message || e));
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'not equal') + '\n      expected: ' + JSON.stringify(b) + '\n      actual:   ' + JSON.stringify(a)); }

async function mockLog() { return (await fetch(H.MODEL_ORIGIN + '/__log')).json(); }
async function mockReset() { await fetch(H.MODEL_ORIGIN + '/__reset', { method: 'POST' }); }
async function mockConfig(c) { await fetch(H.MODEL_ORIGIN + '/__config', { method: 'POST', body: JSON.stringify(c) }); }

async function setSettings(patch) {
  await env.swEval(async (p) => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: Object.assign({}, settings || {}, p) });
  }, patch);
}

async function openPage(file, origin) {
  const page = await env.context.newPage();
  const url = (origin || H.MODEL_ORIGIN) + '/fixtures/' + file + (file.includes('?') ? '&' : '?') + 'run=' + (++seq);
  await page.goto(url);
  await page.bringToFront();
  page.__url = url;
  return page;
}

async function trigger(page, action, frameId) {
  return env.swEval(async ({ url, action, frameId }) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === url);
    if (!tab) throw new Error('tab not found for ' + url);
    return self.cwTest.startFlow(tab, frameId, action);
  }, { url: page.__url, action, frameId: frameId == null ? null : frameId });
}

async function selectField(page, sel, start, end, frame) {
  const target = frame || page;
  await target.evaluate(({ sel, start, end }) => {
    const el = document.querySelector(sel);
    el.focus();
    el.setSelectionRange(start == null ? 0 : start, end == null ? el.value.length : end);
  }, { sel, start, end });
}

async function selectText(page, sel, from, to) {
  // Select a substring inside an element (contenteditable or plain text), by character offsets.
  await page.evaluate(({ sel, from, to }) => {
    const root = document.querySelector(sel);
    if (root.isContentEditable) root.focus();
    else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); // like a mouse selection
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0; let sNode = null; let sOff = 0; let eNode = null; let eOff = 0; let n;
    while ((n = walker.nextNode())) {
      const len = n.data.length;
      if (!sNode && from <= pos + len) { sNode = n; sOff = from - pos; }
      if (to <= pos + len) { eNode = n; eOff = to - pos; break; }
      pos += len;
    }
    const r = document.createRange();
    r.setStart(sNode, sOff);
    r.setEnd(eNode, eOff);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }, { sel, from, to });
}

async function waitResult(page, timeout) {
  await H.waitFor(async () => (await H.visible(page, '.result')) && (await H.text(page, '.sugg')), timeout || 10000, 'panel result');
}

async function runAndTime(page, action, frameId) {
  const t0 = Date.now();
  await trigger(page, action, frameId);
  await H.waitFor(() => H.panelExists(page), 5000, 'panel');
  const tPanel = Date.now() - t0;
  await waitResult(page);
  const tResult = Date.now() - t0;
  timings.push({ action, panelMs: tPanel, resultMs: tResult });
  return { tPanel, tResult };
}

async function shot(page, name) {
  const host = page.locator('carlos-writer-panel');
  await page.waitForTimeout(150);
  const box = await host.boundingBox();
  if (!box) return page.screenshot({ path: path.join(SHOTS, name) });
  // The host is a zero-size fixed element; the panel draws inside it. Clip around its content.
  const r = await H.call(page, '.panel', 'function(){ const b=this.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; }');
  const pad = 14;
  await page.screenshot({ path: path.join(SHOTS, name), clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad } });
}

(async () => {
  env = await H.launch({ headed: false });
  const { sw, extId } = env;
  console.log('extension id', extId);
  // Record every fetch() the extension's service worker makes (the only place with network code).
  await env.swEval(() => {
    self.__fetchLog = [];
    const orig = self.fetch;
    self.fetch = function (input, init) {
      try { self.__fetchLog.push(String((input && input.url) || input)); } catch (_) { /* ignore */ }
      return orig.call(this, input, init);
    };
  });
  await env.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: H.MODEL_ORIGIN });

  await test('manifest: minimal permissions, localhost-only host access, API optional, CSP connect-src', async () => {
    const m = await env.swEval(() => chrome.runtime.getManifest());
    eq(JSON.stringify(m.permissions.slice().sort()), JSON.stringify(['activeTab', 'contextMenus', 'declarativeNetRequestWithHostAccess', 'scripting', 'storage']), 'permissions');
    eq(JSON.stringify(m.host_permissions), JSON.stringify(['http://localhost:11434/*', 'http://127.0.0.1:11434/*']), 'host permissions');
    eq(JSON.stringify(m.optional_host_permissions), JSON.stringify(['https://api.anthropic.com/*']), 'optional host permissions');
    assert(!m.content_scripts, 'no content script runs on page load');
    assert(/connect-src http:\/\/localhost:11434 http:\/\/127\.0\.0\.1:11434 https:\/\/api\.anthropic\.com/.test(m.content_security_policy.extension_pages), 'CSP connect-src');
    const granted = await env.swEval(() => chrome.permissions.getAll());
    assert(!granted.origins.includes('https://api.anthropic.com/*'), 'API permission is off by default');
  });

  await test('defaults: local Ollama, API off, neutral guide', async () => {
    const s = await env.swEval(() => self.cwTest.loadSettings());
    eq(s.provider, 'ollama');
    eq(s.anthropicEnabled, false);
    eq(s.ollamaUrl, 'http://localhost:11434');
    eq(s.styleGuideName, 'Neutral default');
  });

  await setSettings({ ollamaUrl: 'http://127.0.0.1:11434' });

  let page = await openPage('editors.html');

  await test('textarea: proofread shows a word diff, Replace updates the text, Ctrl+Z restores it', async () => {
    await mockReset();
    const before = await page.$eval('#ta', (e) => e.value);
    await selectField(page, '#ta');
    await runAndTime(page, 'proofread');
    eq(await H.text(page, '.sugg'), 'I receive the mail every morning because I like paper.', 'suggestion');
    assert((await H.count(page, 'del')) >= 1 && (await H.count(page, 'ins')) >= 1, 'diff marks');
    eq(await H.text(page, '.orig del'), 'recieve teh', 'first deletion');
    eq(await H.visible(page, '.warn'), false, 'no fact warning');
    await shot(page, 'panel-result-light.png');
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, 'panel-result-dark.png');
    await page.emulateMedia({ colorScheme: 'light' });
    eq(await page.$eval('#ta', (e) => e.value), before, 'nothing changes before the click');
    await H.click(page, '.replace');
    await H.waitFor(async () => (await page.$eval('#ta', (e) => e.value)) !== before, 3000, 'replace');
    eq(await page.$eval('#ta', (e) => e.value), 'I receive the mail every morning because I like paper.', 'replaced value');
    eq(await page.$eval('#mirror', (e) => e.textContent), 'I receive the mail every morning because I like paper.', 'framework saw the input event');
    await H.waitFor(async () => !(await H.panelExists(page)), 4000, 'panel closes after replace');
    await page.focus('#ta');
    await page.keyboard.press('Control+z');
    eq(await page.$eval('#ta', (e) => e.value), before, 'undo restores the original');
  });

  await test('text input: Replace and undo', async () => {
    const before = await page.$eval('#inp', (e) => e.value);
    await selectField(page, '#inp');
    await runAndTime(page, 'proofread');
    eq(await H.text(page, '.sugg'), 'Their plan was definitely good.');
    await H.click(page, '.replace');
    await H.waitFor(async () => (await page.$eval('#inp', (e) => e.value)) === 'Their plan was definitely good.', 3000, 'input replaced');
    await H.waitFor(async () => !(await H.panelExists(page)), 4000, 'panel closed');
    await page.focus('#inp');
    await page.keyboard.press('Control+z');
    eq(await page.$eval('#inp', (e) => e.value), before, 'undo');
  });

  await test('contenteditable: partial selection, Replace keeps the rest, undo restores', async () => {
    const before = await page.$eval('#ce', (e) => e.innerText);
    // Select "alot of things untill Tuesday"
    const from = before.indexOf('alot');
    const to = before.indexOf('Tuesday') + 'Tuesday'.length;
    await selectText(page, '#ce', from, to);
    await runAndTime(page, 'proofread');
    eq(await H.text(page, '.sugg'), 'a lot of things until Tuesday');
    await H.click(page, '.replace');
    await H.waitFor(async () => (await page.$eval('#ce', (e) => e.innerText)).includes('a lot of things until Tuesday'), 3000, 'ce replaced');
    eq(await page.$eval('#ce', (e) => e.innerText), 'We shipped a lot of things until Tuesday, and it was wierd.', 'only the selection changed');
    await H.waitFor(async () => !(await H.panelExists(page)), 4000, 'panel closed');
    await page.focus('#ce');
    await page.keyboard.press('Control+z');
    eq(await page.$eval('#ce', (e) => e.innerText), before, 'undo');
  });

  await test('Copy puts the suggestion on the clipboard and leaves the text alone', async () => {
    const before = await page.$eval('#ta-casual', (e) => e.value);
    await selectField(page, '#ta-casual');
    await runAndTime(page, 'casual');
    const sugg = await H.text(page, '.sugg');
    eq(sugg, "Hey team, I'm writing to confirm that I can't attend. Thanks");
    await H.click(page, '.copy');
    await H.waitFor(async () => (await H.text(page, '.copy')) === 'Copied', 3000, 'copied label');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    eq(clip, sugg, 'clipboard');
    eq(await page.$eval('#ta-casual', (e) => e.value), before, 'text unchanged');
    await H.click(page, '.cancel');
  });

  await test('Cancel closes the panel and leaves the text unchanged', async () => {
    const before = await page.$eval('#ta-pro', (e) => e.value);
    await selectField(page, '#ta-pro');
    await runAndTime(page, 'professional');
    eq(await H.text(page, '.sugg'), 'Hello, I am going to send it tomorrow, thank you');
    await H.click(page, '.cancel');
    await H.waitFor(async () => !(await H.panelExists(page)), 3000, 'panel gone');
    eq(await page.$eval('#ta-pro', (e) => e.value), before, 'unchanged');
    const sel = await page.$eval('#ta-pro', (e) => [document.activeElement === e, e.selectionStart, e.selectionEnd]);
    eq(JSON.stringify(sel), JSON.stringify([true, 0, before.length]), 'focus and selection restored');
  });

  await test('Escape also cancels', async () => {
    const before = await page.$eval('#ta-pro', (e) => e.value);
    await selectField(page, '#ta-pro');
    await runAndTime(page, 'professional');
    await page.keyboard.press('Escape');
    await H.waitFor(async () => !(await H.panelExists(page)), 3000, 'panel gone');
    eq(await page.$eval('#ta-pro', (e) => e.value), before, 'unchanged');
  });

  await test('password field is refused and nothing is sent', async () => {
    await mockReset();
    await page.evaluate(() => { const e = document.querySelector('#pw'); e.focus(); e.select(); });
    await trigger(page, 'proofread');
    await H.waitFor(async () => /does not read passwords/.test((await H.text(page, '.msg')) || ''), 4000, 'refusal');
    eq(await H.visible(page, '.replace'), false, 'no Replace button');
    await shot(page, 'panel-refused-password.png');
    await page.waitForTimeout(300);
    const chats = (await mockLog()).filter((r) => r.url === '/api/chat');
    eq(chats.length, 0, 'no model request');
    await H.click(page, '.cancel');
  });

  await test('one-time-code field is refused', async () => {
    await mockReset();
    await page.evaluate(() => { const e = document.querySelector('#otp'); e.focus(); e.select(); });
    await trigger(page, 'proofread');
    await H.waitFor(async () => /one-time code/.test((await H.text(page, '.msg')) || ''), 4000, 'refusal');
    eq((await mockLog()).filter((r) => r.url === '/api/chat').length, 0, 'no model request');
    await H.click(page, '.cancel');
  });

  await test('English → Spanish keeps names, numbers and the link', async () => {
    await selectField(page, '#ta-en');
    await runAndTime(page, 'en2es');
    const sugg = await H.text(page, '.sugg');
    for (const keep of ['29.39', 'Tucson', '3:40', 'https://carlosmoralesjr.com/about/', 'SalsaCoach', '24']) assert(sugg.includes(keep), 'kept ' + keep);
    eq(await H.visible(page, '.warn'), false, 'no missing-fact warning');
    await shot(page, 'panel-en2es-light.png');
    await H.click(page, '.replace');
    await H.waitFor(async () => (await page.$eval('#ta-en', (e) => e.value)).startsWith('Corrí 29.39 millas'), 3000, 'replaced');
  });

  await test('Spanish → English keeps names, numbers and the email', async () => {
    await H.waitFor(async () => !(await H.panelExists(page)), 4000, 'previous panel closed');
    await selectField(page, '#ta-es');
    await runAndTime(page, 'es2en');
    const sugg = await H.text(page, '.sugg');
    for (const keep of ['29.39', 'Tucson', '3:40', 'carlos@moraleslabs.com', 'TalkEstimate']) assert(sugg.includes(keep), 'kept ' + keep);
    eq(await H.visible(page, '.warn'), false, 'no warning');
    await H.click(page, '.cancel');
  });

  await test('a dropped number is flagged before you replace', async () => {
    await selectField(page, '#ta-drop');
    await runAndTime(page, 'proofread');
    eq(await H.visible(page, '.warn'), true, 'warning shown');
    const w = await H.text(page, '.warn');
    eq(w, 'Check before you replace. Not found in the suggestion: 5.', 'names the number');
    await shot(page, 'panel-missing-number.png');
    await H.click(page, '.cancel');
  });

  await test('menu command: chooser shows 6 actions, a number key runs one', async () => {
    await selectField(page, '#ta-hype');
    await trigger(page, null);
    await H.waitFor(async () => (await H.count(page, '.choose button')) === 6, 4000, 'chooser');
    await shot(page, 'panel-chooser.png');
    await page.keyboard.press('2');
    await waitResult(page);
    eq(await H.text(page, '.sugg'), 'I shipped 4 products. Here is what that looked like.');
    await H.click(page, '.cancel');
  });

  await test('prompt sent to the model: style guide injected, think off, fixed context', async () => {
    await mockReset();
    await setSettings({ styleGuide: 'Voice: plain.\n- TEST-GUIDE-MARKER-4410', styleGuideName: 'Test guide', tone: 4, length: 'shorter' });
    await selectField(page, '#ta-hype');
    await runAndTime(page, 'carlos');
    await H.click(page, '.cancel');
    await selectField(page, '#ta-hype');
    await runAndTime(page, 'proofread');
    await H.click(page, '.cancel');
    const chats = (await mockLog()).filter((r) => r.url === '/api/chat');
    eq(chats.length, 2, 'two requests');
    const [carlos, proof] = chats.map((c) => c.body);
    assert(carlos.messages[0].content.includes('<style_guide>\nVoice: plain.\n- TEST-GUIDE-MARKER-4410\n</style_guide>'), 'guide injected');
    assert(carlos.messages[0].content.includes('Tone: somewhat formal.'), 'tone');
    assert(carlos.messages[0].content.includes('20 to 30 percent shorter'), 'length');
    assert(!proof.messages[0].content.includes('TEST-GUIDE-MARKER-4410'), 'no guide for proofread');
    assert(proof.messages[0].content.includes('Change only errors'), 'only-errors mode');
    eq(carlos.think, false, 'think false');
    eq(carlos.stream, true, 'stream');
    eq(carlos.options.num_ctx, 8192, 'num_ctx');
    for (const c of chats) eq(c.origin, null, 'no Origin header reached Ollama (DNR rule)');
    await setSettings({ styleGuide: undefined, styleGuideName: undefined, tone: 3, length: 'same' });
  });

  await test('read-only page text: Replace is disabled, Copy works', async () => {
    const txt = await page.$eval('#para', (e) => e.textContent);
    await selectText(page, '#para', 0, txt.length);
    await runAndTime(page, 'proofread');
    eq(await H.disabled(page, '.replace'), true, 'Replace disabled');
    assert(/not editable/.test(await H.text(page, '.note')), 'explains why');
    await H.click(page, '.copy');
    await H.waitFor(async () => /Cop/.test(await H.text(page, '.copy')) && (await H.text(page, '.copy')) !== 'Copy', 3000, 'copy label changed');
    const label = await H.text(page, '.copy');
    eq(label, 'Copied', 'copy result label');
    await H.click(page, '.cancel');
  });

  await test('multi-line textarea keeps line breaks', async () => {
    await selectField(page, '#ta-multi');
    await runAndTime(page, 'proofread');
    await H.click(page, '.replace');
    await H.waitFor(async () => (await page.$eval('#ta-multi', (e) => e.value)) === 'First line has the typo.\nSecond line is fine.', 3000, 'multi-line replaced');
    await H.waitFor(async () => !(await H.panelExists(page)), 4000, 'closed');
  });

  await test('multi-paragraph contenteditable: replaced, undo restores', async () => {
    const beforeHTML = await page.$eval('#ce-multi', (e) => e.innerHTML);
    const full = await page.$eval('#ce-multi', (e) => e.textContent);
    await selectText(page, '#ce-multi', 0, full.length);
    await runAndTime(page, 'proofread');
    const sugg = await H.text(page, '.sugg');
    assert(sugg.includes('the typo') && sugg.includes('until now'), 'suggestion fixed both paragraphs: ' + JSON.stringify(sugg));
    await H.click(page, '.replace');
    await H.waitFor(async () => (await page.$eval('#ce-multi', (e) => e.innerText)).includes('until now'), 3000, 'replaced');
    const after = await page.$eval('#ce-multi', (e) => e.innerText);
    assert(/the typo\.\n+Second paragraph, until now\./.test(after), 'paragraph break kept: ' + JSON.stringify(after));
    await H.waitFor(async () => !(await H.panelExists(page)), 4000, 'closed');
    await page.focus('#ce-multi');
    await page.keyboard.press('Control+z');
    eq(await page.$eval('#ce-multi', (e) => e.innerHTML), beforeHTML, 'undo restores the paragraphs');
  });

  await test('empty selection explains what to do and sends nothing', async () => {
    await mockReset();
    await page.evaluate(() => { const e = document.querySelector('#ta'); e.focus(); e.setSelectionRange(3, 3); });
    await trigger(page, 'proofread');
    await H.waitFor(async () => /Select some text first/.test((await H.text(page, '.msg')) || ''), 4000, 'message');
    eq((await mockLog()).filter((r) => r.url === '/api/chat').length, 0, 'nothing sent');
    await H.click(page, '.cancel');
  });

  await test('email-type field (no selection API) is refused politely', async () => {
    await page.evaluate(() => { document.querySelector('#email').focus(); });
    await trigger(page, 'proofread');
    await H.waitFor(async () => /does not expose a text selection/.test((await H.text(page, '.msg')) || ''), 4000, 'message');
    await H.click(page, '.cancel');
  });

  await test('the page cannot press Replace for you (untrusted clicks ignored)', async () => {
    const before = await page.$eval('#ta', (e) => e.value);
    await selectField(page, '#ta');
    await runAndTime(page, 'proofread');
    // A page script cannot reach a closed shadow root at all:
    const fromPage = await page.evaluate(() => {
      const host = document.querySelector('carlos-writer-panel');
      return { hasHost: !!host, shadowRoot: host ? host.shadowRoot : 'no host' };
    });
    eq(fromPage.shadowRoot, null, 'closed shadow root is invisible to the page');
    // Even a synthetic click dispatched on the button node (via DevTools, main world) is ignored:
    await H.call(page, '.replace', 'function(){ this.click(); this.dispatchEvent(new MouseEvent("click", {bubbles:true})); }');
    await page.waitForTimeout(400);
    eq(await page.$eval('#ta', (e) => e.value), before, 'untrusted click did nothing');
    await H.click(page, '.cancel');
  });

  await test('errors: model not installed → "ollama pull"; Ollama down → clear message', async () => {
    await setSettings({ ollamaModel: 'not-installed:1b' });
    await selectField(page, '#ta');
    await trigger(page, 'proofread');
    await H.waitFor(async () => /ollama pull not-installed:1b/.test((await H.text(page, '.msg')) || ''), 5000, 'missing model message');
    await shot(page, 'panel-error-model-missing.png');
    await H.click(page, '.cancel');
    await setSettings({ ollamaModel: 'llama3.1:8b' });
    await mockConfig({ down: true });
    await selectField(page, '#ta');
    await trigger(page, 'proofread');
    await H.waitFor(async () => /Ollama/.test((await H.text(page, '.msg')) || ''), 5000, 'down message');
    const msg = await H.text(page, '.msg');
    assert(/Can't reach Ollama|dropped/.test(msg), msg);
    await H.click(page, '.cancel');
    await mockConfig({ down: false });
  });

  await test('API selected without the browser permission: refused, nothing leaves the machine', async () => {
    const trapBefore = H.extensionTrapHits(env.trap.hits).length;
    await setSettings({ provider: 'anthropic', anthropicEnabled: true });
    await env.swEval(() => chrome.storage.local.set({ anthropicKey: 'sk-ant-api03-FAKE-TEST-KEY-000000000000000000' }));
    await selectField(page, '#ta');
    await trigger(page, 'proofread');
    await H.waitFor(async () => /permission for api\.anthropic\.com is off/.test((await H.text(page, '.msg')) || ''), 5000, 'permission message');
    const where = await H.text(page, '.where');
    assert(/Anthropic API \(internet\)/.test(where), 'panel says where text would go: ' + where);
    await H.click(page, '.cancel');
    eq(H.extensionTrapHits(env.trap.hits).length, trapBefore, 'no request left the machine');
    await setSettings({ provider: 'ollama', anthropicEnabled: false });
    await env.swEval(() => chrome.storage.local.remove('anthropicKey'));
  });

  await test('content scripts cannot read extension storage (API key stays in trusted contexts)', async () => {
    await env.swEval(() => chrome.storage.local.set({ anthropicKey: 'sk-ant-api03-FAKE-TEST-KEY-000000000000000000' }));
    const out = await env.swEval(async (url) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url === url);
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
        try { const v = await chrome.storage.local.get(null); return 'READ:' + Object.keys(v).join(','); } catch (e) { return 'blocked: ' + e.message; }
      } });
      return r.result;
    }, page.__url);
    assert(/^blocked/.test(out), 'content script storage access: ' + out);
    await env.swEval(() => chrome.storage.local.remove('anthropicKey'));
  });

  await page.close();

  await test('strict-CSP page: panel renders styled and works', async () => {
    const p = await openPage('csp.html');
    await selectField(p, '#ta');
    await runAndTime(p, 'proofread');
    const bg = await H.call(p, '.panel', 'function(){ return getComputedStyle(this).backgroundColor; }');
    assert(bg && bg !== 'rgba(0, 0, 0, 0)', 'panel is styled: ' + bg);
    await shot(p, 'panel-strict-csp.png');
    await H.click(p, '.replace');
    await H.waitFor(async () => (await p.$eval('#ta', (e) => e.value)).includes('and the panel'), 3000, 'replaced');
    await p.close();
  });

  await test('same-origin iframe: the frame with the selection gets the panel', async () => {
    const p = await openPage('frame.html');
    const frame = p.frames().find((f) => f.url().includes('editors.html'));
    await frame.waitForSelector('#ta');
    await frame.focus('#ta');
    await selectField(p, '#ta', null, null, frame);
    const r = await trigger(p, 'proofread');
    assert(r.ok && r.frameId !== 0, 'picked the iframe: ' + JSON.stringify(r));
    await waitResult(p);
    eq(await H.text(p, '.sugg'), 'I receive the mail every morning because I like paper.');
    await H.click(p, '.replace');
    await H.waitFor(async () => (await frame.$eval('#ta', (e) => e.value)).startsWith('I receive the mail'), 3000, 'iframe replaced');
    await p.close();
  });

  await test('network: the extension talks only to 127.0.0.1:11434; nothing else is reachable', async () => {
    // 1) Every fetch the service worker made during the whole run went to the local model.
    const fetched = await env.swEval(() => self.__fetchLog.slice());
    assert(fetched.length > 0, 'fetch log recorded requests');
    const off = fetched.filter((u) => !/^http:\/\/(localhost|127\.0\.0\.1):11434\//.test(u));
    eq(JSON.stringify(off), '[]', 'service-worker fetches to anything but the model');
    // 2) The extension's own CSP blocks any other destination, even a live local server.
    await mockReset();
    const blocked = await env.swEval(async () => {
      const tryFetch = async (u) => { try { const r = await fetch(u); return 'status ' + r.status; } catch (e) { return 'blocked'; } };
      return {
        otherLocal: await tryFetch('http://127.0.0.1:8765/fixtures/editors.html?csp-probe=1'),
        internet: await tryFetch('https://example.com/'),
        model: await tryFetch('http://127.0.0.1:11434/api/version'),
      };
    });
    eq(blocked.otherLocal, 'blocked', 'live server on another port is blocked by CSP');
    eq(blocked.internet, 'blocked', 'internet blocked');
    eq(blocked.model, 'status 200', 'model endpoint allowed');
    const log = await mockLog();
    assert(!log.some((r) => /csp-probe/.test(r.url)), 'the blocked fetch never reached the live server');
    // 3) The pages the extension adds (panel, popup, settings) contain no network code at all.
    const files = ['content/content.js', 'popup/popup.js', 'options/options.js', 'lib/prompts.js', 'lib/diff.js'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(H.EXT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts/.test(src), f + ' has network code');
    }
    // 4) The Origin rewrite applies only to the extension's own requests, not to web pages.
    const p = await openPage('editors.html', H.SITE_ORIGIN);
    await mockReset();
    await p.evaluate(() => fetch('http://127.0.0.1:11434/api/version').catch(() => null));
    await p.waitForTimeout(300);
    const fromPage = (await mockLog()).find((r) => r.url === '/api/version');
    eq(fromPage && fromPage.origin, 'http://127.0.0.1:8765', 'page request keeps its Origin');
    await p.close();
    // 5) The trap proxy saw nothing except Chromium's own background services.
    const leaks = H.extensionTrapHits(env.trap.hits);
    eq(leaks.length, 0, 'unexplained requests that tried to leave: ' + JSON.stringify(leaks.slice(0, 5)));
    assert(!env.trap.hits.some((h) => /anthropic/.test(h.url)), 'nothing went to Anthropic');
    // 6) Every request Playwright observed from pages went to the two local test origins.
    const hosts = [...new Set(env.seen.map((r) => { try { return new URL(r.url).host; } catch (_) { return r.url; } }))];
    const bad = hosts.filter((h) => !['127.0.0.1:11434', '127.0.0.1:8765', ''].includes(h) && !h.startsWith(env.extId));
    eq(JSON.stringify(bad), '[]', 'unexpected hosts: ' + hosts.join(', '));
  });

  await test('settings page: check connection, import guide (cannot change provider/endpoint), key stays hidden', async () => {
    const p = await env.context.newPage();
    await p.goto('chrome-extension://' + extId + '/options/options.html');
    await p.click('#check');
    await p.waitForFunction(() => /is running/.test(document.querySelector('#check-result').textContent));
    const res = await p.textContent('#check-result');
    assert(/Ollama 0\.0\.0-mock is running/.test(res) && /“llama3\.1:8b” is installed/.test(res), res);
    await p.screenshot({ path: path.join(SHOTS, 'options-light.png'), fullPage: true });
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.screenshot({ path: path.join(SHOTS, 'options-dark.png'), fullPage: true });
    await p.emulateMedia({ colorScheme: 'light' });
    const tmp = path.join(H.ROOT, '_work', 'import-test.json');
    fs.writeFileSync(tmp, JSON.stringify({ styleGuideName: 'Imported test', styleGuide: 'IMPORTED-GUIDE-MARKER', settings: { tone: 2, length: 'longer', provider: 'anthropic' }, provider: 'anthropic', ollamaUrl: 'http://evil.example:11434', anthropicEnabled: true }));
    await p.setInputFiles('#import', tmp);
    await p.waitForFunction(() => /Imported/.test(document.querySelector('#guide-status').textContent));
    fs.rmSync(tmp, { force: true });
    const s = await env.swEval(() => self.cwTest.loadSettings());
    eq(s.styleGuide, 'IMPORTED-GUIDE-MARKER', 'guide imported');
    eq(s.tone, 2, 'tone imported');
    eq(s.length, 'longer', 'length imported');
    eq(s.provider, 'ollama', 'provider untouched');
    eq(s.anthropicEnabled, false, 'API stays off');
    eq(s.ollamaUrl, 'http://127.0.0.1:11434', 'endpoint untouched');
    const fake = 'sk-ant-api03-FAKE-TEST-KEY-1234567890abcdefghij';
    await p.fill('#anthropicKey', fake);
    await p.click('#save-key');
    await p.waitForFunction(() => /A key is saved/.test(document.querySelector('#key-status').textContent));
    eq(await p.inputValue('#anthropicKey'), '', 'field cleared after save');
    const html = await p.content();
    assert(!html.includes(fake), 'key not rendered in the page');
    const stored = await env.swEval(() => chrome.storage.local.get('anthropicKey'));
    eq(stored.anthropicKey, fake, 'stored locally');
    await p.click('#forget-key');
    await p.waitForFunction(() => /No key saved/.test(document.querySelector('#key-status').textContent));
    const keys = await p.$$eval('#keys tr', (rows) => rows.map((r) => r.textContent));
    eq(keys.length, 3, 'three commands listed');
    await p.click('#reset-guide');
    await p.close();
    await setSettings({ tone: 3, length: 'same' });
  });

  await test('toolbar popup (paste box for Google Docs and other apps): proofread and copy', async () => {
    const p = await env.context.newPage();
    await p.goto('chrome-extension://' + extId + '/popup/popup.html');
    await p.fill('#input', 'I recieve teh mail every morning becuase i like paper.');
    await p.click('text=Proofread');
    await p.waitForFunction(() => !document.querySelector('#out').hidden);
    eq(await p.textContent('#sugg'), 'I receive the mail every morning because I like paper.');
    assert(/This computer \(Ollama\)/.test(await p.textContent('#where')), 'popup says where text goes');
    await p.click('#copy');
    await p.waitForFunction(() => /Copied/.test(document.querySelector('#copy').textContent));
    await p.setViewportSize({ width: 420, height: 560 });
    await p.screenshot({ path: path.join(SHOTS, 'popup-light.png') });
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.screenshot({ path: path.join(SHOTS, 'popup-dark.png') });
    await p.close();
  });

  const summary = {
    when: new Date().toISOString(),
    browser: await env.context.browser()?.version?.() || 'Chromium 141 (Playwright 1.56.1 bundle)',
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    timings,
    trapHits: env.trap.hits,
    trapHitsNotExplainedByBrowserServices: H.extensionTrapHits(env.trap.hits),
    serviceWorkerFetchLog: await env.swEval(() => self.__fetchLog && self.__fetchLog.slice()).catch(() => null),
    hostsSeen: [...new Set(env.seen.map((r) => { try { return new URL(r.url).host; } catch (_) { return r.url; } }))],
    serviceWorkerRequestsSeenByPlaywright: env.seen.filter((r) => r.fromServiceWorker).length,
  };
  fs.writeFileSync(path.join(RESULTS, 'e2e-headless.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
  const pm = timings.map((t) => t.resultMs).sort((a, b) => a - b);
  if (pm.length) console.log('trigger→result with mock (ms): median', pm[Math.floor(pm.length / 2)], 'min', pm[0], 'max', pm[pm.length - 1], 'n', pm.length);
  await env.close();
  process.exit(summary.failed ? 1 : 0);
})().catch(async (e) => {
  console.error('HARNESS ERROR', e);
  if (env) await env.close();
  process.exit(2);
});
